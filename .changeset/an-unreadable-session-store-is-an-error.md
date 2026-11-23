---
'@conciv/harness': patch
---

Reading the Codex and opencode session stores no longer blocks the server, and a store that exists but cannot be read is now reported as an error instead of being treated as empty.
