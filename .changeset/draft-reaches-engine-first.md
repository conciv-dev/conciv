---
'@conciv/app': patch
---

A change to a session's draft now reaches the engine before this browser's own copy is written, not after it. A grabbed element removed just before the page closed came back on the next load in another browser (the removal sat behind two device-copy writes, about 10 ms, and never left the page); the device copy is still written, in parallel.
