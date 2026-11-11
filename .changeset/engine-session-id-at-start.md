---
'@conciv/core': patch
---

The engine now creates the rows for a configured session id and harness session id before start resolves, and a failure there rejects start with a message naming the id instead of only logging it.
