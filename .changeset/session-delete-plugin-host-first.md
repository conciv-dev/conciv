---
'@conciv/backend': patch
---

Deleting a session does the plugin host's part first, so if that part fails the session is still there and the delete can be tried again.
