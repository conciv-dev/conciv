---
'@conciv/plugin': patch
'@conciv/extension-compiler': patch
---

The plugin no longer rewrites `@conciv/*` dist imports to workspace source: hosts always get dist. The `CONCIV_E2E` switch is gone.
