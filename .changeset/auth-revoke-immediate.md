---
'@conciv/core': patch
---

`conciv auth revoke` now locks a browser out of a running engine on its very next request: the engine checks the trusted browsers file on each request instead of a copy refreshed by file system events, and closes a revoked browser's open sockets within a quarter second.
