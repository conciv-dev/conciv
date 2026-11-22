---
'@conciv/app': patch
'@conciv/plugin-page': patch
'@conciv/plugin-testkit': patch
'@conciv/plugin': patch
---

The agent's page mask timeout is settable: the app's `timings.page.taskTimeoutMs` reaches the built-in page plugin, and the kit's `mount({timings})` sets it in a test.
