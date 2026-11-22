---
'@conciv/ai': patch
---

When the engine's process exits without stopping its runs (a shutdown deadline, a second Ctrl+C, a dev server that exits at once), every agent CLI it started is killed, so none outlives the engine.
