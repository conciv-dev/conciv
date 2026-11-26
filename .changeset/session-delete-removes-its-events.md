---
'@conciv/backend': patch
---

Deleting a session also removes its plugin host events, so they no longer pile up in the project database.
