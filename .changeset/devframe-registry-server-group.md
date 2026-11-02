---
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/app': patch
'@conciv/extension': patch
---

The registry and server procedures are also served as conciv:registry:* and conciv:server:* hub functions beside oRPC, and the widget reads the tool catalog over the hub. A logged-in browser tab skips the approval ask on registry calls and on server reload and restart, as the widget origin does on oRPC today; any other hub caller, including the engine token, still gets the ask.

Plugin agent functions now reach agents: every hub function with an `agent` field joins the tool registry, so it shows in discover_tools, code mode and /api/mcp. `defineConcivFunction`'s `agent` takes conciv's tool fields (`name`, `approval`, `meta`) beside Devframe's own, so a plugin tool keeps its legacy name and an `approval: 'ask'` tool asks exactly like a legacy one. Devframe's own Terminals and Messages tools join code mode without a conciv approval.
