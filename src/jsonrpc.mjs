// Minimal LSP JSON-RPC framing. No dependencies, no network.
export function encodeMessage(message) {
  const body = JSON.stringify(message)
  return Buffer.from(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`, 'utf8')
}

export function createParser(onMessage) {
  let buffer = Buffer.alloc(0)
  return (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const header = buffer.subarray(0, headerEnd).toString('ascii')
      const match = /(?:^|\r\n)Content-Length:\s*(\d+)/i.exec(header)
      if (!match) {
        buffer = buffer.subarray(headerEnd + 4)
        continue
      }
      const length = Number(match[1])
      const start = headerEnd + 4
      if (buffer.length < start + length) return
      const body = buffer.subarray(start, start + length).toString('utf8')
      buffer = buffer.subarray(start + length)
      try { onMessage(JSON.parse(body)) } catch { /* ignore malformed frame */ }
    }
  }
}
