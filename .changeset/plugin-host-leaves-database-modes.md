---
'@conciv/backend-app-api': patch
'@conciv/backend': patch
---

Starting the engine no longer changes the file permissions of the project database (`conciv.db` and its `-wal` and `-shm` files).
