---
'@internal/frontend-defaults': patch
'@conciv/plugin-page': patch
'@conciv/app': patch
'@conciv/backend-plugin-api': patch
---

The agent's page mask timeout is settable: the app's `timings.page.taskTimeoutMs` reaches the built-in page plugin, and the kit's `mount({timings})` sets it in a test.
