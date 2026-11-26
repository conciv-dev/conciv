---
'@conciv/backend-plugin-api': patch
'@conciv/ui-kit-chat': patch
'@conciv/app': patch
---

Plugins draw a tool call's row by adding a render to `ToolRegistry` from `@conciv/frontend-plugin-api`; the most recently loaded plugin wins a tool name. A call no plugin draws reads "Called <tool>" with its input. A failed call opens on the error card, a permission ask waits in the dock above the composer, and each finished call shows the time the engine took, also after a reload. The old `ToolCall` registry is gone.
