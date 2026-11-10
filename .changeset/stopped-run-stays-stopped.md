---
'@conciv/ai': patch
'@conciv/client': patch
---

A stopped run stays stopped. A run stopped while it is still setting up is no longer announced as started, a client no longer joins a run it already saw end (one it just stopped), and a client that joined or replays a stopped run now sees it end as aborted instead of showing it as running with a Stop button that never goes away.
