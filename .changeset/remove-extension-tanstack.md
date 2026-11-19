---
'@conciv/plugin-tanstack': patch
---

`@conciv/extension-tanstack` is removed; the TanStack inspector is the `@conciv/plugin-tanstack` plugin. Drop
`tanstack()` from `extensions` and list the plugin instead: `plugins: ['@conciv/plugin-tanstack']`.
