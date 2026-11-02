---
'@conciv/contract': patch
'@conciv/core': patch
---

Serve the sessions procedures as `conciv:sessions:*` hub functions beside oRPC, sharing one implementation, and publish the session list to the hub's `conciv:sessions` shared state after every sessions change. Publishes run one at a time so the last write is the latest list, and a chat turn publishes when it starts and when it ends so the running flag and title stay current.
