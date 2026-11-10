---
'@conciv/ai': patch
---

execute_typescript on the QuickJS driver keeps one warm worker thread and builds a fresh QuickJS runtime per execution, so a warm `return 1` takes a few milliseconds instead of booting a new worker each call. A worker whose run failed, timed out or was stopped is discarded, and ending all runs terminates every worker.
