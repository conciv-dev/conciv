---
'@conciv/backend-defaults': patch
---

The engine refreshes each harness's model list once it is up, not while it boots, so the live probe no longer competes with engine start.
