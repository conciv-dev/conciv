---
'@conciv/core': patch
---

The MCP endpoint now runs on `createMCPServer` from `@tanstack/ai-mcp`. The capability list, sandbox rules and stale-engine warning moved from the MCP server instructions into the `execute_typescript` tool description.

The MCP server reports the `@conciv/core` package version in its initialize response instead of `0.0.0`.
