---
'@conciv/backend': patch
'@conciv/backend-defaults': patch
'@conciv/app': patch
'@conciv/backend-plugin-api': patch
'@conciv/types': patch
'@conciv/backend-app-api': patch
'@conciv/plugin-testkit': patch
---

The engine, the chat plane and the widget no longer load extensions; plugins replace them. Every plugin tool is a CLI command, and plugins hear how a run ended through `session.execution.succeeded` and the new `session.execution.failed` event.
