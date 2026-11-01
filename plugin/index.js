// DSH host plugin: four read-only semantic code tools backed by local LSP servers.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { definition, references, symbols, diagnostics, hover, rename } from '../src/lsp.mjs'
import { formatDiagnostics, formatHover, formatLocations, formatRename, formatSymbols } from '../src/format.mjs'

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const SKILL_PATH = join(PLUGIN_DIR, '..', 'skills', 'code-intel', 'SKILL.md')
const PROVIDER = 'dsh-code-intel'
export const name = 'code-intel'
export const inject = ['tools', 'skills']

const ROOT = { type: 'string', description: 'Workspace root. Defaults to the DSH workspace directory.' }
const LANGUAGE = { type: 'string', enum: ['typescript', 'python', 'go', 'rust', 'c'], description: 'Language server to use; inferred from the file extension when omitted.' }
const POSITION = {
  file: { type: 'string', description: 'File path, relative to the workspace root.' },
  line: { type: 'integer', minimum: 1, description: '1-based line.' },
  character: { type: 'integer', minimum: 1, description: '1-based character (UTF-16 code unit offset, as LSP uses).' },
  root: ROOT,
  language: LANGUAGE,
}
function tool(name, description, properties, required, run) {
  return {
    name, description, parameters: { type: 'object', additionalProperties: false, properties, required },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { markdown: { type: 'string' }, count: { type: 'integer' } },
        required: ['markdown', 'count'],
      },
      render: (_args, value) => [{ type: 'text', text: value.markdown }],
    },
    timeoutMs: 60_000,
    async execute(args = {}) { return run(args) },
  }
}

function stripFrontmatter(text) {
  if (!text.startsWith('---\n')) return text
  const end = text.indexOf('\n---\n', 4)
  return end === -1 ? text : text.slice(end + 5)
}
function summary() {
  return {
    name: 'code-intel',
    description: 'Semantic code navigation through local language servers: definitions, references, workspace symbols, and diagnostics. Read-only.',
    whenToUse: 'A code navigation or impact question that needs language-server precision.',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled', provider: PROVIDER,
    resourceBase: { kind: 'directory', path: join(PLUGIN_DIR, '..', 'skills', 'code-intel') },
    rank: 610, locator: 'code-intel', metadata: { domain: 'code-intelligence', version: '0.1.0' },
  }
}

export function apply(ctx) {
  ctx.tools.register(tool('code_definition', 'Find the definition of a symbol using a local language server. Read-only; line and character are 1-based.', POSITION, ['file', 'line', 'character'], async (args) => {
    const result = await definition(args)
    return { markdown: formatLocations(result, 'definition'), count: result.locations.length }
  }))
  ctx.tools.register(tool('code_references', 'Find references to a symbol using a local language server. Read-only; line and character are 1-based.', { ...POSITION, includeDeclaration: { type: 'boolean', description: 'Include the declaration itself. Default true.' } }, ['file', 'line', 'character'], async (args) => {
    const result = await references(args)
    return { markdown: formatLocations(result, 'reference'), count: result.locations.length }
  }))
  ctx.tools.register(tool('code_symbols', 'Search workspace symbols (classes, functions, methods, variables) using a local language server. Read-only.', {
    query: { type: 'string', description: 'Symbol query.' }, file: { type: 'string', description: 'Optional project file to open first; some language servers need this to establish a project.' }, root: ROOT, language: LANGUAGE,
  }, ['query', 'language'], async (args) => {
    const result = await symbols(args)
    return { markdown: formatSymbols(result), count: result.symbols.length }
  }))
  ctx.tools.register(tool('code_diagnostics', 'Collect compiler/type diagnostics for one file from a local language server. Read-only; diagnostics are not a substitute for tests.', {
    file: POSITION.file, root: ROOT, language: LANGUAGE,
  }, ['file'], async (args) => {
    const result = await diagnostics(args)
    return { markdown: formatDiagnostics(result), count: result.diagnostics.length }
  }))
  ctx.tools.register(tool('code_hover', 'Show type/documentation hover information at a symbol using a local language server. Read-only; line and character are 1-based.', POSITION, ['file', 'line', 'character'], async (args) => {
    const result = await hover(args)
    return { markdown: formatHover(result), count: result.hover ? 1 : 0 }
  }))
  ctx.tools.register(tool('code_rename', 'Preview a language-server rename as edits without writing any file. Review the preview, then apply it with your normal editing tool. line and character are 1-based.', {
    ...POSITION, newName: { type: 'string', description: 'New symbol name.' },
  }, ['file', 'line', 'character', 'newName'], async (args) => {
    const result = await rename(args)
    const changes = result.edit?.changes || {}
    const count = Object.values(changes).reduce((sum, items) => sum + (items?.length || 0), 0)
    return { markdown: formatRename(result), count }
  }))
  ctx.skills.registerProvider(() => ({
    name: PROVIDER,
    async list() { return [summary()] },
    async get(candidate) {
      if (candidate?.name !== 'code-intel') return undefined
      return { ...summary(), content: stripFrontmatter(await readFile(SKILL_PATH, 'utf8')) }
    },
  }))
}
