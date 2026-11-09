---
'@conciv/extension': patch
'@conciv/plugin': patch
---

`makeViteBridge` moves from `@conciv/plugin/vite` to `@conciv/extension/vite`, so extensions can build a Vite bundler bridge without depending on the plugin.
