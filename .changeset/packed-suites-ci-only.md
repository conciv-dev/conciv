---
'@conciv/mascot': patch
'@conciv/mascot-react': patch
'@conciv/extension-tanstack': patch
---

The packed install tests (pack the package, install the tarball like an npm user) run only in the Packed CI workflow, through a `test:packed` script; `pnpm test` never packs. npm publish now waits on that workflow.
