---
'@conciv/app': patch
---

The chat pane no longer re-suspends the router match when you switch sessions: the harness meta query is created once at app scope and the pane reads a plain derived accessor, so the pane root is never detached and re-inserted (which reset the transcript's scroll position and flashed the loading pane).
