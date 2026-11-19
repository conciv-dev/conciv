---
'@conciv/core': patch
'@conciv/chat': patch
'@conciv/embed': patch
'@conciv/plugin': patch
'@conciv/protocol': patch
---

The engine, the chat plane and the widget no longer load extensions; plugins replace them. Every plugin tool is a CLI command, and plugins hear how a run ended through `session.execution.succeeded` and the new `session.execution.failed` event.
