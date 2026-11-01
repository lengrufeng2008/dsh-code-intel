import { relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function displayPath(root, uri) {
  try {
    const path = fileURLToPath(uri)
    const rel = relative(root, path)
    return rel && !rel.startsWith('..' + sep) ? rel.split(sep).join('/') : path
  } catch { return String(uri) }
}
function line(uri, range, root) {
  return `${displayPath(root, uri)}:${(range?.start?.line ?? 0) + 1}:${(range?.start?.character ?? 0) + 1}`
}
export function formatLocations({ root, locations }, label = 'location') {
  if (!locations?.length) return `No ${label}s found.`
  return `${locations.length} ${label}${locations.length === 1 ? '' : 's'}:\n` + locations.map((item) => `- ${line(item.uri, item.range, root)}`).join('\n')
}
const KIND = { 1: 'file', 2: 'module', 3: 'namespace', 4: 'package', 5: 'class', 6: 'method', 7: 'property', 8: 'field', 9: 'constructor', 10: 'enum', 11: 'interface', 12: 'function', 13: 'variable', 14: 'constant', 15: 'string', 16: 'number', 17: 'boolean', 18: 'array', 19: 'object', 20: 'key', 21: 'null', 22: 'enum member', 23: 'struct', 24: 'event', 25: 'operator', 26: 'type parameter' }
export function formatSymbols({ root, symbols }) {
  if (!symbols?.length) return 'No workspace symbols found. The language server may still be indexing; retry once.'
  return `${symbols.length} symbol${symbols.length === 1 ? '' : 's'}:\n` + symbols.map((symbol) => {
    const loc = symbol.location || symbol
    const kind = KIND[symbol.kind] || 'symbol'
    const container = symbol.containerName ? ` — ${symbol.containerName}` : ''
    return `- ${symbol.name} (${kind})${container} ${line(loc.uri, loc.range, root)}`
  }).join('\n')
}
export function formatDiagnostics({ root, file, diagnostics }) {
  const uri = file.startsWith('file:') ? file : pathToFileURL(file).href
  if (!diagnostics?.length) return `No diagnostics for ${displayPath(root, uri)}.`
  return `${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'}:\n` + diagnostics.map((item) => {
    const loc = item.range ? `:${item.range.start.line + 1}:${item.range.start.character + 1}` : ''
    return `- ${item.severity}${loc} ${item.message}${item.source ? ` [${item.source}]` : ''}`
  }).join('\n')
}

export function formatHover({ hover }) {
  if (!hover || !hover.contents) return 'No hover information.'
  const contents = hover.contents
  const text = typeof contents === 'string' ? contents
    : Array.isArray(contents) ? contents.map((item) => typeof item === 'string' ? item : item.value || '').join('\n\n')
      : contents.value || ''
  return text.trim() || 'No hover information.'
}

export function formatRename({ root, edit }) {
  const changes = edit?.changes || {}
  const edits = Object.entries(changes).flatMap(([uri, items]) => (items || []).map((item) => ({ uri, item })))
  if (!edits.length) return 'No rename edits returned. Nothing was written.'
  const lines = [`Rename preview: ${edits.length} edit${edits.length === 1 ? '' : 's'}. Nothing was written.`, '']
  for (const { uri, item } of edits) {
    lines.push(`- ${displayPath(root, uri)}:${item.range.start.line + 1}:${item.range.start.character + 1} -> \`${item.newText}\``)
  }
  return lines.join('\n')
}
