---
'@conciv/ai': patch
---

execute_typescript on the QuickJS driver boots one worker thread when the driver is created and builds a fresh QuickJS runtime per execution, so `return 1` takes a few milliseconds instead of booting a new worker each call. A worker whose run failed, timed out or was stopped is discarded, and ending all runs terminates every worker.
