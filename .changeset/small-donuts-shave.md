---
'@conciv/harness-init': patch
'@conciv/harness': patch
'conciv': patch
---

Extract the claude connect plugin files and their install state into a new dependency-light
`@conciv/claude-connect` package. The `conciv` CLI generates those files during `init` and no longer
depends on `@conciv/harness`, so `npx @conciv/cli@latest init` stops installing every runtime agent SDK.
`@conciv/harness` consumes the same package for its claude connect flow; its
`./claude-connect-files` and `./claude-connect-state` subpaths are gone.
