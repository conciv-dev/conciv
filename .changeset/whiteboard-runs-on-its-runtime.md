---
'@internal/plugin-whiteboard': patch
---

The whiteboard's browser half makes its own Effect runtime in setup and disposes it on cleanup; the canvas, its change feed, collections, cursors and comment compose all run on it instead of the global default runtime.
