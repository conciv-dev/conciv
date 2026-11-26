---
'@conciv/plugin-recorder': patch
'@internal/plugin-whiteboard': patch
---

The Recorder's capture control runs on the shared machine driver, and the whiteboard's collection writes, drawing and export are Effect programs run once at the database boundary instead of promise chains.
