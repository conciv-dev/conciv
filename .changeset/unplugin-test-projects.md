---
'@conciv/unplugin': patch
---

In test mode, `conciv()` sets the node, happy-dom and browser mode test projects from `@conciv/plugin-testkit` when the package lists the kit, and starts no engine of its own. A package's one `vite.config.ts` then holds its whole test config.
