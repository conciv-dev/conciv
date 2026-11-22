---
'@conciv/plugin-testkit': patch
---

`session.tool(name).call` keeps one MCP client per engine session, lists the tools once and again only when a name is missing, and closes the clients when the engine stops or restarts.
