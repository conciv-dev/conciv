---
'@internal/frontend-defaults': patch
'@internal/vitest-config': patch
---

The app's UnoCSS scan covers only the app, the kits, tools and the core cards; it scans no plugin, and every plugin ships its own sheet. A browser test's generated sheet covers the shell's scan plus the source of the package under test, so a plugin's own suite keeps that plugin's classes.
