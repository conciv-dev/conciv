---
'@conciv/backend-defaults': patch
---

`harnessEnv` is required in the chat plane deps: chat no longer falls back to `process.env` for the harness child env; the caller supplies it (core reads it from its ConfigProvider).
