---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/core': patch
'@conciv/harness': patch
---

The agent learns its code-mode tools from one catalog, grouped by namespace within a budget, with only the changes sent after the first turn; the MCP `execute_typescript` description carries the same catalog text.

With no isolate driver, code mode is off as in opencode: every tool reaches the agent as its own direct tool and as its own MCP tool, and the catalog is in neither the system prompt nor the instruction state. `@conciv/ai/server` exports `loadIsolateDriver` and the `CodeDriver` type; `createChatServer` and `createChatPlane` take the `driver`.
