---
'@conciv/plugin-host': patch
'@conciv/core': patch
---

Starting the engine no longer changes the file permissions of the project database (`conciv.db` and its `-wal` and `-shm` files).
