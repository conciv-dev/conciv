---
'@conciv/simulation': patch
---

An `engine.event()` wait opened before `engine.restart()` stays open and resolves from the restarted engine; `stop()` still ends it.
