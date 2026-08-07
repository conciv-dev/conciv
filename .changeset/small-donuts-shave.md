---
'@conciv/harness-init': patch
'@conciv/harness': patch
'@conciv/cli': patch
---

Every harness now declares init as a capability (`'files' | 'none'`), backed by a per-harness init
contribution in the new dependency-light `@conciv/harness-init` package, which replaces
`@conciv/claude-connect`. The `conciv` CLI derives detection and install steps from those
contributions instead of a hand-listed marker table, and no longer depends on `@conciv/harness`, so
`npx @conciv/cli@latest init` stops installing every runtime agent SDK. This also makes gemini-cli
detectable and initializable like its sibling harnesses. `@conciv/harness` consumes
`@conciv/harness-init` for its own harness contributions; the old `./claude-connect-files` and
`./claude-connect-state` subpaths are gone.
