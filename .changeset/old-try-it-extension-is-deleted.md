---
'@conciv/app': patch
'@internal/frontend-defaults': patch
---

The old try-it extension (`@conciv/extension-try-it`) is deleted; `@conciv/plugin-try-it` replaces it. The widget's connect gate is gone with it: `defineExtension` no longer takes `connectGate`, the extension `connect` slot and its host API are removed, and a widget mounted without an `apiBase` boots in servers mode when it is given plugin entries.
