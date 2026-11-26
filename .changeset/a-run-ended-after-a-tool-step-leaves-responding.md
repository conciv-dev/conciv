---
'@conciv/backend': patch
---

A run that ends right after a tool step now closes with a finished event, so the pane leaves "Responding…", and a model call's own end is no longer read as the end of the run.
