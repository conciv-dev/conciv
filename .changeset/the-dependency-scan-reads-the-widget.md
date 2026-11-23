---
'@conciv/unplugin': patch
---

On Vite, the dependency scan now reads the widget the plugin adds to the page, so a cold start (`vite --force`, or a first run) pre-bundles the widget's dependencies in one pass. Before, the scan never saw the widget, the optimizer found its dependencies only while the page loaded and bundled everything a second time, and a dependency found after that reloaded the open page. Your own `optimizeDeps.entries` and a build `input` that names files still decide what else is scanned.
