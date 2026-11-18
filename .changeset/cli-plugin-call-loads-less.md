---
'@conciv/cli': patch
---

Every `conciv` command starts faster and installs less: the CLI ships its pure-JS dependencies bundled into its dist (only the native `@ast-grep/napi` is still installed), so a command such as `conciv plugin call` uses about a third of the CPU it did; the MCP server stack loads only for `conciv mcp serve`, and the agent-connection code only for `conciv mcp connect|disconnect|list`.
