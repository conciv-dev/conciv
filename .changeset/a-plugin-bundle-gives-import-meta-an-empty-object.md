---
'@conciv/frontend-plugin-api': patch
---

`experimental()` gives `import.meta` an empty object in the plugin bundle, which the app evaluates with no module URL, so a dependency that reads `import.meta.url` (Excalidraw's font worker) takes its documented no-worker path without an `EMPTY_IMPORT_META` build warning.
