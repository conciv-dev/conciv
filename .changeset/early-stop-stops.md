---
'@conciv/backend': patch
---

A Stop pressed right after sending, while the turn is still being prepared, now stops it: the turn ends Stopped instead of going on to answer. A Stop that arrives before the engine has received the message at all can still be missed.
