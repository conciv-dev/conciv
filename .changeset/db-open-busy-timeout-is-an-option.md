---
'@conciv/db': patch
---

openDb takes busyTimeoutMs for how long it waits on another opener's migration lock, defaulting to the 5 s it used before.
