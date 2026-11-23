---
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/plugin': patch
'@conciv/app': patch
---

The engine answers opencode's `location.get` (its folder and project), and the app reads its folder from it instead of from `tabs.list`.
