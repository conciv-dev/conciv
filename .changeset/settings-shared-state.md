---
'@conciv/core': patch
---

Each settings file is now a Devframe shared state, read once when opened and written back on a debounce. Watching the shared global settings folder is one handler: a saved value that differs from the one in memory replaces it, so a change another engine saved shows up in this one, and the engine's own write echoing back is skipped.
