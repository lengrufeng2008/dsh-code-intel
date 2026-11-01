# Real-server smoke test

Do this in a scratch repo, not a production checkout.

```bash
# TypeScript (pin TypeScript 5.x; TypeScript 7 currently has no tsserver in the package)
printf 'export function hello(name: string) { return `hi ${name}` }\nhello("x")\n' > /tmp/code-intel-smoke.ts
# then ask DSH:
# code_definition file=/tmp/code-intel-smoke.ts line=1 character=17 language=typescript
# code_references file=/tmp/code-intel-smoke.ts line=1 character=17 language=typescript
# code_symbols query=hello language=typescript root=/tmp
# code_diagnostics file=/tmp/code-intel-smoke.ts language=typescript
```

The expected result is a definition at `1:17` and one reference at `2:1`; exact columns vary by
server. For workspace symbol search, add a `tsconfig.json`; the TypeScript server can return
`No Project` without one. If the server is missing, the tool returns the command and the install hint.

No model call is needed to test the LSP transport; `npm test` uses the fake server.
