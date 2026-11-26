---
'@conciv/backend-plugin-api': patch
'@internal/plugin-whiteboard': patch
'@conciv/plugin-recorder': patch
'@conciv/plugin-test-runner': patch
'@conciv/plugin-tanstack': patch
---

A plugin's `./plugin-experimental` entry carries its types: the `experimental()` Vite build writes a `plugin-experimental.d.cts` beside the CommonJS bundle, and the first-party plugins point the entry's `types` condition at it.
