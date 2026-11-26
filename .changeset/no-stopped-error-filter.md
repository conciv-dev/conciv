---
'@conciv/app': patch
---

The chat pane no longer hides a run error whose message is "stopped": nothing in the engine or its libraries raises one, so the filter was dead code.
