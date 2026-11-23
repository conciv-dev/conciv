---
'@conciv/cli': patch
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/protocol': patch
'@conciv/plugin': patch
---

The engine no longer serves `tabs.list` and `tabs.get`. `conciv mcp serve`, `conciv tools tabs` and `--tab` read tabs from the page plugin over `plugin.call`, the project root from `location.get`, and the project name and branch from the project folder; an engine without the page plugin lists no tabs. The first reply for a tab leads with that session's instructions from `sessions.instructions`.
