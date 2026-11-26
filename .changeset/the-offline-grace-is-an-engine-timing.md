---
'@conciv/protocol': patch
'@conciv/client': patch
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

The offline grace is an engine connection timing: `offlineGraceMs` in `EngineConnectionTimings`, default 1000, read by the app's reachability; the kit mount shortens it.
