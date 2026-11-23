---
'@conciv/plugin-recorder': patch
---

The app and the embed scan every plugin's source through one glob, naming no plugin. The recorder's player styles reach the page through the Style registry instead of a hand-injected style element, and the page plugin no longer builds its own UnoCSS sheet.
