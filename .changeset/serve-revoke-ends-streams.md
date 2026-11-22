---
'@conciv/serve': patch
---

A browser whose login is revoked no longer leaves its event streams running on the engine. The revoke now aborts every call on that browser's socket, so a subscription that was waiting for its next event ends, the socket closes, and a stopped engine no longer keeps its process alive.
