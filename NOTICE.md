# Notice

`dsh-code-intel` is a small, read-only semantic-code plugin for DeepSeek Harness.

It is inspired by the workflow of [Serena](https://github.com/oraios/serena) (oraios/serena),
which popularized LSP-backed symbol navigation for coding agents. Serena is not a dependency of this
package, and no Serena source code is copied here. This implementation speaks LSP directly, ships no
embeddings or hosted index, and does not implement Serena's write/refactor tools.

The language servers are separate programs installed by the user. Their licenses are their own.
