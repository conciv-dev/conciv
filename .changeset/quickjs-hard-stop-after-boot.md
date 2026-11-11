---
'@conciv/ai': patch
---

Code-mode runs on the QuickJS worker now keep three separate clocks. A boot deadline of 30 seconds covers a run from the moment it is queued until its worker starts it; a run whose worker never starts in that time ends with a `WORKER_NOT_STARTED` error instead of waiting forever. The run's own timeout then runs inside the worker as before, so a run that times out reports its timeout with the logs it printed, even when its worker was slow to start. The server's hard stop, the timeout plus one second of grace, now starts when the worker begins the run rather than when the run is queued, so a slow worker start no longer kills a run before its own timeout fires.
