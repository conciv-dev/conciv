---
'@conciv/plugin-ios': patch
'@conciv/embed': patch
---

The iOS tools `ios_build`, `ios_run`, `ios_screenshot` and `ios_logs` have a plugin, the new package `@conciv/plugin-ios`, on the plugin SDK (`plugins: [['@conciv/plugin-ios', {projectRoot, bundleId}]]`): build and run ask permission, screenshot and logs run in code mode. The native page no longer sets the unused `window.__concivRebind`.
