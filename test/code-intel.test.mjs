import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createParser, encodeMessage } from '../src/jsonrpc.mjs'
import { definition, references, symbols, diagnostics, hover, rename } from '../src/lsp.mjs'
import { apply } from '../plugin/index.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const FAKE = join(ROOT, 'test/fixtures/fake-lsp.mjs')
const ENV = { ...process.env, DSH_CODE_INTEL_SERVER: JSON.stringify({ command: process.execPath, args: [FAKE], languageId: 'typescript' }), DSH_CODE_INTEL_DIAGNOSTICS_MS: '300' }

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-code-intel-'))
  await writeFile(join(root, 'sample.ts'), 'export function hello(name: string) { return name }\nhello("x")\n')
  return root
}

test('JSON-RPC frames survive arbitrary chunking', () => {
  const seen = []
  const parse = createParser((m) => seen.push(m))
  const frame = encodeMessage({ jsonrpc: '2.0', id: 1, result: { ok: true } })
  for (let i = 0; i < frame.length; i += 3) parse(frame.subarray(i, i + 3))
  assert.deepEqual(seen, [{ jsonrpc: '2.0', id: 1, result: { ok: true } }])
})

test('definition and references reach a local LSP server', async () => {
  const root = await fixture()
  try {
    const def = await definition({ root, file: 'sample.ts', line: 1, character: 17, env: ENV })
    assert.equal(def.locations.length, 1)
    assert.match(def.locations[0].uri, /sample\.ts$/)
    const refs = await references({ root, file: 'sample.ts', line: 1, character: 17, env: ENV })
    assert.equal(refs.locations.length, 2)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('hover and rename preview work without writing', async () => {
  const root = await fixture()
  try {
    const h = await hover({ root, file: 'sample.ts', line: 1, character: 17, env: ENV })
    assert.match(h.hover.contents.value, /fixture hover/)
    const r = await rename({ root, file: 'sample.ts', line: 1, character: 17, newName: 'bye', env: ENV })
    assert.equal(Object.values(r.edit.changes)[0][0].newText, 'bye')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('symbol search and diagnostics work', async () => {
  const root = await fixture()
  try {
    const syms = await symbols({ root, query: 'hello', language: 'typescript', env: ENV })
    assert.equal(syms.symbols[0].name, 'hello')
    const diags = await diagnostics({ root, file: 'sample.ts', env: ENV })
    assert.equal(diags.diagnostics.length, 1)
    assert.equal(diags.diagnostics[0].severity, 'warning')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('files outside the workspace root are rejected', async () => {
  const root = await fixture()
  try {
    await assert.rejects(() => definition({ root, file: '/etc/hosts', line: 1, character: 1, env: ENV }), /escapes the workspace root/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('the plugin registers four tools and one skill', async () => {
  const tools = []
  let factory
  apply({
    tools: { register: (tool) => tools.push(tool) },
    skills: { registerProvider: (fn) => { factory = fn } },
  })
  assert.deepEqual(tools.map((tool) => tool.name), ['code_definition', 'code_references', 'code_symbols', 'code_diagnostics', 'code_hover', 'code_rename'])
  const provider = factory()
  const list = await provider.list()
  assert.equal(list.length, 1)
  assert.equal(list[0].name, 'code-intel')
  const skill = await provider.get({ name: 'code-intel' })
  assert.match(skill.content, /code_definition/)
  assert.equal(await provider.get({ name: 'missing' }), undefined)
})
