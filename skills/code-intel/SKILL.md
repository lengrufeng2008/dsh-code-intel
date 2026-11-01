---
name: code-intel
description: Semantic code navigation in DSH through local language servers: definitions, references, workspace symbols, and diagnostics. Use when grep is too coarse, when a symbol's real definition matters, or when an edit needs a precise impact check. Read-only.
whenToUse: "A code navigation or impact question that needs language-server precision: go to definition, find references, search a symbol, or collect diagnostics."
---

# Code intelligence

This is a small, local, read-only port of the semantic code workflow popularized by Serena. It speaks
the Language Server Protocol directly and does not use embeddings, a hosted index, or an API key.

## Tools

| Tool | Use |
|---|---|
| `code_definition` | Where is this symbol defined? |
| `code_references` | Who uses it? Check the impact before editing. |
| `code_symbols` | Search classes, functions, methods, and variables across the workspace. |
| `code_diagnostics` | Compiler/type errors for one open file. |
| `code_hover` | Type/documentation at a symbol. |
| `code_rename` | Preview rename edits; never writes. |

Positions are **1-based** for both line and character. `root` defaults to the workspace directory.
The tools only read files. `code_rename` is preview-only; it does not apply edits.

## Servers

| Language | Server | Install |
|---|---|---|
| TypeScript / JavaScript | `typescript-language-server` | `npm i -g typescript-language-server typescript@5.9` |
| Python | `pyright-langserver` | `pip install pyright` |
| Go | `gopls` | `go install golang.org/x/tools/gopls@latest` |
| Rust | `rust-analyzer` | `rustup component add rust-analyzer` |
| C / C++ | `clangd` | install LLVM clangd |

If a server is missing, the tool returns the command and the install hint; it does not silently fall
back to a guess.

## Workflow

1. Use `code_symbols` to find the exact symbol when the name is ambiguous. If the server reports
`No Project`, pass a `file` in the project or add the project config (`tsconfig.json`).
2. Use `code_definition` before reading a large file.
3. Use `code_references` before editing a public symbol.
4. Use `code_diagnostics` after an edit; a language server's diagnostics are not a substitute for
   the project's tests.
5. If the language server is unavailable, say so and fall back to `grep` plus direct file reads.

## Limits

- No rename application, no apply-edit, no semantic refactor. `code_rename` returns a preview; applying
  it is a separate, reviewable write.
- A language server can be stale while indexing; retry a symbol search once before concluding.
- Diagnostics are per file and depend on the server's project configuration (`tsconfig`,
  `pyproject.toml`, `go.mod`).
- This is not a code-security scanner and not a replacement for tests.
