---
'@internal/frontend-defaults': patch
'@conciv/backend-plugin-api': patch
---

A plugin can see and stop the routed session's run: `MountedSession.run.status()` reads `'running'` while a turn is going and `'idle'` once it ends, and `run.interrupt()` stops it as the composer's Stop button does, answering `interrupted: false` when nothing was running.
