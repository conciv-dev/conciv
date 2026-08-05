---
'@conciv/cli': patch
---

The CLI keeps its scoped name `@conciv/cli`. npm rejects the unscoped name `conciv` as too similar to the existing `config` and `concat` packages, so install it with `npx @conciv/cli@latest init`. The command you run afterwards is still `conciv`.
