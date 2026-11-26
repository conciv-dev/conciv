---
'@internal/frontend-defaults': patch
'@internal/vitest-config': patch
---

The app's UnoCSS scan covers only the app, the kits, tools, the core cards and the two plugins it imports (page, terminal); the embed build still scans every plugin it ships. A browser test's generated sheet also covers the source of every conciv plugin installed in the package under test, so a suite that mounts a plugin outside the app's scan keeps that plugin's classes.
