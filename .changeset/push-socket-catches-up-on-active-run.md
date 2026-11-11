---
'@conciv/core': patch
'@conciv/chat': patch
---

A push socket that opens or reconnects while a run is going now hears about that run, so the launcher turns busy for a run started from outside the widget before its push socket was admitted.
