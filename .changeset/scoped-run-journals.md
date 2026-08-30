---
'@conciv/core': patch
---

Scope each server's run journals to its own state root (`<stateRoot>/.conciv/runs`) instead of the host-global `/tmp/tanstack-runs`. Two conciv servers on one machine no longer share journal files keyed by run id, so a fresh run can never replay output an earlier server left behind under the same run id.
