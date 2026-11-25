---
'@conciv/simulation': patch
---

`session.tool(name).call` now reaches a direct tool (a plugin tool with `codemode: false`): when the engine lists a tool by that name on `/api/mcp`, the kit calls it by its own name instead of through `execute_typescript`, and returns its reply as the tool gave it.
