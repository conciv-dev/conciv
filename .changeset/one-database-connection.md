---
'@conciv/backend-defaults': patch
---

The engine and its plugin host now share one connection to the project database. A plugin host write that waits inside its transaction no longer freezes the engine or makes its own writes fail with "database is locked".
