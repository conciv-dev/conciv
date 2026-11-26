---
'@conciv/backend': patch
'@conciv/backend-defaults': patch
'@conciv/types': patch
'@conciv/harness': patch
'@conciv/skills': patch
---

A tool a plugin adds or removes while a chat turn runs now shows up, or goes away, at the next step of that same turn. Before every model step the turn waits for a plugin reload in progress, then offers the tools as they are after it.

If you build a `TurnPlan` yourself (the value `TurnHooks.plan` returns), the four tool fields `codeMode`, `search`, `asking` and `direct` move behind one async `tools()` function that returns them, for example `tools: async () => ({codeMode, search, asking, direct})`. It is called before every model step. `TurnHooks.plan` itself stays synchronous. The chat plane's `capabilities(sessionId)` now returns a promise.

`HarnessChatDeps.hasTools` is removed, because the tools can change between steps of one turn. A harness that needs to know whether tools ride a model step reads that step's `options.tools` in its adapter's `chatStream`. Codex now does this: it auto-approves its tanstack MCP server for each step that offers tools.
