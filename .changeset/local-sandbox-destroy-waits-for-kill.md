---
'@conciv/ai': patch
---

Stopping a run now waits until a CLI process that ignored the stop request has actually been killed, instead of returning while it is still alive.
