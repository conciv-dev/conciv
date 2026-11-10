---
'@conciv/protocol': patch
'@conciv/harness': patch
'@conciv/core': patch
---

Harness history can list sessions across every project: `HarnessHistory.list` takes a scope (`{cwd}` or `{everywhere: true}`) and every `HarnessSessionMeta` carries the cwd the harness recorded for it.
