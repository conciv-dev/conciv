---
'@conciv/harness': patch
---

The opencode harness declares `permissionGate: 'none'`: it passes no permission callback, and opencode's own asks do not reach conciv.
