---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/core': patch
---

The turn-level tool ask that only the removed extension path fed is gone: a tool no longer carries `approval: 'ask'` into a turn or the MCP listing. Plugin tools ask through `ctx.permission.assert`, and a CLI `page_eval` still asks through `registry.call`.
