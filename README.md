# Code Intel for DSH

> Serena showed that coding agents need **symbol-precise** navigation, not just grep. This is a small,
> read-only DSH port of that workflow: local LSP servers, four tools, no embeddings, no hosted index,
> no API key.

## What it adds

| Tool | Job |
|---|---|
| `code_definition` | Jump to the real definition |
| `code_references` | Find impact before editing |
| `code_symbols` | Search classes/functions/variables |
| `code_diagnostics` | Compiler/type diagnostics for one file |
| `code_hover` | Type/documentation at a symbol |
| `code_rename` | Preview rename edits **without writing** |

All six are **read-only**. `code_rename` returns a preview; it never writes files. Apply the preview with your normal editing tool after review.

## Install

```bash
# once the public repo exists:
dsh plugin --profile web add github:lengrufeng2008/dsh-code-intel

# local package, before the repo is published:
dsh plugin --profile web add /home/lrf/dsh/products/dsh-code-intel/dsh-code-intel-0.1.0.tgz
```

Install at least one language server:

| Language | Install |
|---|---|
| TypeScript / JavaScript | `npm i -g typescript-language-server typescript@5.9` |
| Python | `pip install pyright` |
| Go | `go install golang.org/x/tools/gopls@latest` |
| Rust | `rustup component add rust-analyzer` |
| C / C++ | install LLVM `clangd` |

## Use

```text
Use code_symbols to find where `parseSession` is defined.
Use code_references on this symbol before changing its signature.
Use code_diagnostics on the file I just edited.
```

Positions are 1-based. `root` defaults to the DSH workspace directory; files outside it are rejected.

## Design

- One short-lived language-server process per call; no background daemon to leak.
- JSON-RPC over stdio, no dependencies.
- Server selection by file extension, or explicit `language`.
- Timeouts and install hints instead of silent fallback.
- Path containment check before opening a file.
- Diagnostics use `publishDiagnostics`; a server that only supports pull diagnostics returns none.

## Real-server smoke

With `typescript@5.9.3` and `typescript-language-server@5.3.0`, definition and references were
smoke-tested against a small `.ts` file (1 definition, 2 references). `code_symbols` needs a project
context; for TypeScript, add a `tsconfig.json` and/or pass `file` so the server opens a project
file first, or it may answer `No Project`. The bundled
fake server keeps `npm test` independent of installed language servers.

## What it does not do

- No write, apply-edit, or rename application. `code_rename` is preview-only.
- No cross-repo index, embeddings, or remote service.
- No guarantee that diagnostics equal a clean test run.
- No claim of parity with Serena's full feature set.

## Provenance

Inspired by [Serena](https://github.com/oraios/serena); no source code copied. See `NOTICE.md`.
License: MIT.

## Tests

```bash
npm test
```

The test fixture is a fake LSP server, so `npm test` does not need TypeScript, Pyright, Go, or Rust
installed. A real-server smoke test is listed in `docs/SMOKE.md`; the TypeScript path was smoke-tested
with `typescript@5.9.3` and `typescript-language-server@5.3.0` (definition 1, references 2).
