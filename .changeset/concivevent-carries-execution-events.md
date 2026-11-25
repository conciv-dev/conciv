---
'@conciv/backend-plugin-api': patch
---

`ConcivEvent` carries `session.execution.started`, `succeeded`, `failed` and `interrupted`, as opencode's `OpenCodeEvent` does, so a plugin reading the event stream gets them typed.
