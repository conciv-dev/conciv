---
'@conciv/plugin': patch
---

Boot the engine reliably under `next dev --webpack`: instrumentation.ts now compiles in the first server build, so a slow dev watcher scan can no longer make Next skip `register()` for the whole process.
