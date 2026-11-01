import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createParser, encodeMessage } from './jsonrpc.mjs'
import { INSTALL_HINTS, resolveServer } from './servers.mjs'

const DEFAULT_TIMEOUT = 15_000
const DIAGNOSTICS_MS = 1_500

function timeoutValue(env = process.env) {
  const n = Number(env.DSH_CODE_INTEL_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT
}
function diagnosticsValue(env = process.env) {
  const n = Number(env.DSH_CODE_INTEL_DIAGNOSTICS_MS)
  return Number.isFinite(n) && n > 0 ? n : DIAGNOSTICS_MS
}

export async function resolveRoot(root) {
  const abs = await realpath(resolve(root || process.cwd()))
  return abs
}

export async function resolveWorkspaceFile(root, file) {
  if (typeof file !== 'string' || !file) throw new Error('file is required')
  const absRoot = await resolveRoot(root)
  const abs = await realpath(resolve(absRoot, file))
  const rel = relative(absRoot, abs)
  if (rel === '' || rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel)) {
    throw new Error(`file escapes the workspace root: ${file}`)
  }
  return { root: absRoot, file: abs }
}

class Session {
  constructor({ root, server, env }) {
    this.root = root
    this.server = server
    this.env = env
    this.pending = new Map()
    this.nextId = 1
    this.stderr = ''
    this.spawnError = undefined
    this.closed = false
    this.diagnostics = new Map()
  }

  async start() {
    this.child = spawn(this.server.command, this.server.args, {
      cwd: this.root,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child.on('error', (error) => { this.spawnError = error })
    this.child.stderr.on('data', (chunk) => {
      this.stderr = (this.stderr + chunk.toString('utf8')).slice(-4_000)
    })
    this.child.on('exit', () => {
      this.closed = true
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error(`language server exited${this.stderr ? `: ${this.stderr.slice(-300)}` : ''}`))
      }
      this.pending.clear()
    })
    const parse = createParser((message) => this.onMessage(message))
    this.child.stdout.on('data', parse)
    this.child.stdin.on('error', () => {})
    const initializationOptions = {}
    if (this.server.language === 'typescript') {
      const localTsserver = join(this.root, 'node_modules', 'typescript', 'lib', 'tsserver.js')
      if (existsSync(localTsserver)) initializationOptions.tsserver = { path: localTsserver }
    }
    if (this.env.DSH_CODE_INTEL_INIT_OPTIONS) {
      try { Object.assign(initializationOptions, JSON.parse(this.env.DSH_CODE_INTEL_INIT_OPTIONS)) }
      catch { throw new Error('DSH_CODE_INTEL_INIT_OPTIONS must be JSON') }
    }
    await this.request('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(this.root).href,
      workspaceFolders: [{ uri: pathToFileURL(this.root).href, name: 'workspace' }],
      capabilities: {
        workspace: { symbol: {} },
        textDocument: { definition: {}, references: {}, publishDiagnostics: {} },
      },
      ...(Object.keys(initializationOptions).length ? { initializationOptions } : {}),
    })
    this.notify('initialized', {})
  }

  onMessage(message) {
    if (message && Object.prototype.hasOwnProperty.call(message, 'id') && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id)
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error(`${message.error.message || 'LSP error'}${message.error.code ? ` (${message.error.code})` : ''}`))
      else pending.resolve(message.result)
      return
    }
    if (message?.method === 'textDocument/publishDiagnostics') {
      this.diagnostics.set(message.params.uri, message.params.diagnostics || [])
    }
  }

  request(method, params, timeoutMs = timeoutValue(this.env)) {
    if (this.spawnError) return Promise.reject(new Error(this.startHint(this.spawnError)))
    if (this.closed) return Promise.reject(new Error('language server is closed'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`LSP timeout after ${timeoutMs}ms: ${method}${this.stderr ? `; stderr: ${this.stderr.slice(-300)}` : ''}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(encodeMessage({ jsonrpc: '2.0', id, method, params }))
    })
  }

  notify(method, params) {
    if (this.child?.stdin?.writable) this.child.stdin.write(encodeMessage({ jsonrpc: '2.0', method, params }))
  }

  async open(file) {
    const text = await readFile(file, 'utf8')
    this.notify('textDocument/didOpen', {
      textDocument: { uri: pathToFileURL(file).href, languageId: this.server.languageId, version: 1, text },
    })
    return pathToFileURL(file).href
  }

  async diagnosticsFor(file) {
    const uri = await this.open(file)
    const wait = diagnosticsValue(this.env)
    const deadline = Date.now() + wait
    while (Date.now() < deadline) {
      if (this.diagnostics.has(uri)) return this.diagnostics.get(uri)
      await new Promise((r) => setTimeout(r, 50))
    }
    return this.diagnostics.get(uri) || []
  }

  startHint(error) {
    const hint = INSTALL_HINTS[this.server.language]
    return `Cannot start ${this.server.command}: ${error.message}${hint ? `. Install: ${hint}` : ''}`
  }

  async close() {
    if (!this.child || this.closed) return
    try { await this.request('shutdown', null, 800) } catch { /* best effort */ }
    this.notify('exit', null)
    await new Promise((r) => setTimeout(r, 120))
    if (!this.closed) this.child.kill('SIGTERM')
    this.closed = true
  }
}

async function withSession({ root, file, language, env = process.env }, fn) {
  const server = resolveServer({ file, language, env })
  const session = new Session({ root, server, env })
  await session.start()
  try { return await fn(session) } finally { await session.close() }
}

function position(line, character) {
  if (!Number.isInteger(line) || line < 1) throw new Error('line must be a 1-based integer')
  if (!Number.isInteger(character) || character < 1) throw new Error('character must be a 1-based integer')
  return { line: line - 1, character: character - 1 }
}

export function normalizeLocations(result) {
  if (!result) return []
  const items = Array.isArray(result) ? result : [result]
  return items.flatMap((item) => {
    if (!item) return []
    if (item.targetUri && item.targetRange) return [{ uri: item.targetUri, range: item.targetRange }]
    if (item.uri && item.range) return [{ uri: item.uri, range: item.range }]
    return []
  })
}

export async function definition({ root, file, line, character, language, env = process.env }) {
  const resolved = await resolveWorkspaceFile(root, file)
  return withSession({ root: resolved.root, file: resolved.file, language, env }, async (session) => {
    await session.open(resolved.file)
    const result = await session.request('textDocument/definition', {
      textDocument: { uri: pathToFileURL(resolved.file).href }, position: position(line, character),
    })
    return { root: resolved.root, file: resolved.file, locations: normalizeLocations(result) }
  })
}

export async function references({ root, file, line, character, language, includeDeclaration = true, env = process.env }) {
  const resolved = await resolveWorkspaceFile(root, file)
  return withSession({ root: resolved.root, file: resolved.file, language, env }, async (session) => {
    await session.open(resolved.file)
    const result = await session.request('textDocument/references', {
      textDocument: { uri: pathToFileURL(resolved.file).href },
      position: position(line, character),
      context: { includeDeclaration: includeDeclaration === true },
    })
    return { root: resolved.root, file: resolved.file, locations: normalizeLocations(result) }
  })
}

export async function symbols({ root, query, language, file, env = process.env }) {
  if (typeof query !== 'string' || !query.trim()) throw new Error('query is required')
  const absRoot = await resolveRoot(root)
  const opened = file ? await resolveWorkspaceFile(absRoot, file) : undefined
  return withSession({ root: absRoot, file: opened?.file, language, env }, async (session) => {
    if (opened) await session.open(opened.file)
    const result = await session.request('workspace/symbol', { query })
    return { root: absRoot, symbols: Array.isArray(result) ? result : [] }
  })
}

const SEVERITY = { 1: 'error', 2: 'warning', 3: 'information', 4: 'hint' }
export async function diagnostics({ root, file, language, env = process.env }) {
  const resolved = await resolveWorkspaceFile(root, file)
  return withSession({ root: resolved.root, file: resolved.file, language, env }, async (session) => {
    const items = await session.diagnosticsFor(resolved.file)
    return {
      root: resolved.root,
      file: resolved.file,
      diagnostics: items.map((item) => ({
        severity: SEVERITY[item.severity] || 'unknown',
        message: item.message,
        source: item.source,
        range: item.range,
      })),
    }
  })
}


export async function hover({ root, file, line, character, language, env = process.env }) {
  const resolved = await resolveWorkspaceFile(root, file)
  return withSession({ root: resolved.root, file: resolved.file, language, env }, async (session) => {
    await session.open(resolved.file)
    const result = await session.request('textDocument/hover', {
      textDocument: { uri: pathToFileURL(resolved.file).href }, position: position(line, character),
    })
    return { root: resolved.root, hover: result }
  })
}

export async function rename({ root, file, line, character, newName, language, env = process.env }) {
  if (typeof newName !== 'string' || !newName.trim()) throw new Error('newName is required')
  const resolved = await resolveWorkspaceFile(root, file)
  return withSession({ root: resolved.root, file: resolved.file, language, env }, async (session) => {
    await session.open(resolved.file)
    const result = await session.request('textDocument/rename', {
      textDocument: { uri: pathToFileURL(resolved.file).href },
      position: position(line, character),
      newName,
    })
    return { root: resolved.root, edit: result }
  })
}
