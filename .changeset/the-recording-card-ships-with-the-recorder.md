---
'@conciv/plugin-recorder': patch
'@conciv/app': patch
---

The thread card for the recorder tools now ships with the recorder plugin and draws through `ctx.ui`, so it shows only
in projects that load the plugin. A failed recorder call draws the app's own failed-tool card.
