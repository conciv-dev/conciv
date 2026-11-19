---
'@conciv/core': patch
---

A stopped or deleted session's run now tells plugins it ended: the engine publishes `session.execution.interrupted` with reason `user`, or `shutdown` when the engine stops or sweeps a run cut by a crash, as it already publishes succeeded and failed.
