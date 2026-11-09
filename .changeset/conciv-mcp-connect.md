---
'@conciv/cli': patch
---

`conciv mcp` is now a group: `conciv mcp connect <agent>`, `conciv mcp disconnect <agent>` and `conciv mcp list` manage which agents (claude, codex, gemini-cli, opencode) can use your conciv tabs, and `conciv mcp serve --agent <agent>` is the MCP server each agent runs. `conciv init` offers to connect every detected agent that is not connected yet. Every connected agent can be disconnected from the widget, opencode included; conciv refuses a disconnected agent at once, and a disconnect from the widget or the terminal voids the Allow every open tab held, so each tab asks again. `conciv tools` run from inside an agent names that agent instead of a generic caller.
