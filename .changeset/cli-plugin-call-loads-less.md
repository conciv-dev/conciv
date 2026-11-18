---
'@conciv/cli': patch
---

Every `conciv` command starts faster: the MCP server stack loads only for `conciv mcp serve`, the agent-connection code only for `conciv mcp connect|disconnect|list`, and es-toolkit is read from its array and string entries instead of its whole root.
