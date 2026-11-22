---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

A test restarts the engine: `engine.restart()` stops it and boots it again on the same project folder, state, token and address, so the open chat loses the engine and reconnects.
