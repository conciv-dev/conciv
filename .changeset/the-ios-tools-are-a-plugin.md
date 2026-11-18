---
'@conciv/embed': patch
---

The iOS tools `ios_build`, `ios_run`, `ios_screenshot` and `ios_logs` have a plugin, `@conciv/plugin-ios`, on the plugin SDK: build and run ask permission, screenshot and logs run in code mode. The native page no longer sets the unused `window.__concivRebind`.
