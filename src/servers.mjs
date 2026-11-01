const SERVERS = {
  typescript: { command: 'typescript-language-server', args: ['--stdio'], languageId: 'typescript', extensions: ['.ts', '.tsx', '.mjs', '.cjs', '.js', '.jsx'] },
  python: { command: 'pyright-langserver', args: ['--stdio'], languageId: 'python', extensions: ['.py'] },
  go: { command: 'gopls', args: [], languageId: 'go', extensions: ['.go'] },
  rust: { command: 'rust-analyzer', args: [], languageId: 'rust', extensions: ['.rs'] },
  c: { command: 'clangd', args: [], languageId: 'c', extensions: ['.c', '.h', '.cc', '.cpp', '.hpp'] },
}

export const INSTALL_HINTS = {
  typescript: 'npm i -g typescript-language-server typescript',
  python: 'pip install pyright',
  go: 'go install golang.org/x/tools/gopls@latest',
  rust: 'rustup component add rust-analyzer',
  c: 'install clangd (LLVM)',
}

export function languageFor(file = '') {
  const lower = String(file).toLowerCase()
  for (const [language, server] of Object.entries(SERVERS)) {
    if (server.extensions.some((ext) => lower.endsWith(ext))) return language
  }
  return undefined
}

export function serverFor(language) {
  return SERVERS[language]
}

export function resolveServer({ file, language, env = process.env } = {}) {
  if (env.DSH_CODE_INTEL_SERVER) {
    let override
    try { override = JSON.parse(env.DSH_CODE_INTEL_SERVER) } catch { throw new Error('DSH_CODE_INTEL_SERVER must be JSON') }
    if (!override || typeof override.command !== 'string' || !override.command) throw new Error('DSH_CODE_INTEL_SERVER.command is required')
    return { command: override.command, args: Array.isArray(override.args) ? override.args.map(String) : [], languageId: override.languageId || language || 'plaintext', language: language || 'custom' }
  }
  const lang = language || languageFor(file)
  if (!lang || !SERVERS[lang]) throw new Error(`No language server mapping for ${file || 'this request'}; pass language: ${Object.keys(SERVERS).join(', ')}`)
  return { ...SERVERS[lang], language: lang }
}
