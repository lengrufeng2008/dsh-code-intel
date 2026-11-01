#!/usr/bin/env node
// Tiny LSP server used by the transport tests. It implements just enough for code-intel.
import { createParser, encodeMessage } from '../../src/jsonrpc.mjs'

const opened = new Map()
const diagnosticsSent = new Set()

function send(message) { process.stdout.write(encodeMessage({ jsonrpc: '2.0', ...message })) }
function respond(id, result) { send({ id, result }) }
function location(uri, line = 0, character = 16) {
  return { uri, range: { start: { line, character }, end: { line, character: character + 5 } } }
}

const parse = createParser((message) => {
  if (message.method === 'initialize') {
    respond(message.id, { capabilities: { workspace: { symbol: {} }, textDocument: { definition: {}, references: {}, publishDiagnostics: {} } } })
  } else if (message.method === 'initialized') {
    // no response
  } else if (message.method === 'textDocument/didOpen') {
    const { uri, text } = message.params.textDocument
    opened.set(uri, text)
    if (!diagnosticsSent.has(uri)) {
      diagnosticsSent.add(uri)
      send({ method: 'textDocument/publishDiagnostics', params: { uri, diagnostics: [{ severity: 2, source: 'fake', message: 'fixture warning', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }] } })
    }
  } else if (message.method === 'textDocument/definition') {
    respond(message.id, [location(message.params.textDocument.uri)])
  } else if (message.method === 'textDocument/references') {
    respond(message.id, [location(message.params.textDocument.uri, 1, 0), location(message.params.textDocument.uri, 0, 16)])
  } else if (message.method === 'textDocument/hover') {
    respond(message.id, { contents: { kind: 'markdown', value: '**fixture hover**' } })
  } else if (message.method === 'textDocument/rename') {
    respond(message.id, { changes: { [message.params.textDocument.uri]: [{ range: { start: { line: 0, character: 16 }, end: { line: 0, character: 21 } }, newText: message.params.newName }] } })
  } else if (message.method === 'workspace/symbol') {
    respond(message.id, [{ name: message.params.query, kind: 12, containerName: 'fixture', location: location('file:///fixture/sample.ts', 0, 16) }])
  } else if (message.method === 'shutdown') {
    respond(message.id, null)
  } else if (message.method === 'exit') {
    process.exit(0)
  }
})
process.stdin.on('data', parse)
process.stdin.resume()
