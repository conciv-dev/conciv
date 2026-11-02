---
'@conciv/contract': patch
'@conciv/core': patch
---

Serve the sessions procedures as `conciv:sessions:*` hub functions beside oRPC, sharing one implementation, and publish the session list to the hub's `conciv:sessions` shared state after every sessions change.
