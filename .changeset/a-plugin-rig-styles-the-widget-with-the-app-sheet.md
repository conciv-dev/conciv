---
'@conciv/plugin-testkit': patch
---

A plugin package whose vite config lists `UnoCSS()` before `concivTest()` now styles the widget with the app's full utility sheet, instead of the plugin's own on-demand sheet, which missed the kit classes (tool card dots and insets, the copy icon, the user message gap, the one-row composer).
