---
'@conciv/backend': patch
'@conciv/backend-app-api': patch
'@conciv/plugin-testkit': patch
---

The engine's file watcher is turned off by `CONCIV_DISABLE_FILEWATCHER`, read as Effect Config under the engine's ConfigProvider and false by default; a value that is not a boolean fails engine boot. Engines the plugin testkit boots set it to true, so stopping them no longer waits on the system file events service; a kit that needs file watching passes `fileWatcher: true`.
