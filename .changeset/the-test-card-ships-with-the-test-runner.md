---
'@conciv/plugin-test-runner': patch
'@conciv/embed': patch
---

The thread card for the test-runner tools now ships with the test-runner plugin and draws through `ctx.ui`, so it shows
only in projects that load the plugin. The plugin no longer exports `./view`.
