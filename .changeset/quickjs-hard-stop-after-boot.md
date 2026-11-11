---
'@conciv/ai': patch
---

A code-mode run that times out now always reports its own timeout with the logs it printed, even when its QuickJS worker is slow to start. The server's hard-stop deadline used to start when the run was queued, so a worker that took longer than the one-second grace to boot was killed before the run's own timeout fired and its logs were lost. The deadline now starts when the worker begins the run.
