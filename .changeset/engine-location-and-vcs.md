---
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/protocol': patch
'@conciv/cli': patch
'@conciv/plugin': patch
'@conciv/app': patch
---

The engine answers opencode's `location.get` (its folder and project) and `vcs.get` (its current branch) and no longer answers `tabs.list`. The app reads its folder from `location.get`, and the hub's `list_tabs` builds its listing from `location.get`, `vcs.get`, the page plugin's tabs and `sessions.get`.
