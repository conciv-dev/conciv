---
'@conciv/backend-app-api': patch
'@conciv/backend': patch
---

The plugin host's and core's internal service names no longer carry the name of the project they were ported from. No behaviour change. The environment variable that overrides the file watcher's native binding path is renamed to `CONCIV_PARCEL_WATCHER_PATH`.
