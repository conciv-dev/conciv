---
'@conciv/plugin-test-runner': patch
'@conciv/plugin-tanstack': patch
---

The test-runner panel follows the live run and opens a failing test in your editor on its own Effect runtime, disposed when the plugin unloads. The TanStack plugin defines itself with `Plugin.define` like every other plugin.
