---
'@conciv/ai': patch
---

Stop always ends a run, even when the harness adapter misses an abort that already happened; the run still ends aborted with its partial answer kept as stopped.
