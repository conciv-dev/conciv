---
'@conciv/harness': patch
---

The opencode and codex session lists wait a moment for a busy database instead of coming back empty with "database is locked" when another program holds a short lock on it.
