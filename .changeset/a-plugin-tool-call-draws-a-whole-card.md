---
'@conciv/backend-plugin-api': patch
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

A built-in plugin's `ToolCall` can now draw a tool's whole card, while the call runs and after it finishes, with its duration and page capture, by giving a `card` instead of a body `render`.
