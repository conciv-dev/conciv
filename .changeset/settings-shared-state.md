---
'@conciv/core': patch
---

Each settings file is now a Devframe shared state, read once when opened and written back on a debounce, exactly like Devframe. The engine no longer watches the global settings folder: a change made by another engine or by hand shows up after a restart.
