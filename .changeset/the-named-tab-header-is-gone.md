---
'@conciv/types': patch
'@conciv/cli': patch
'@conciv/backend-defaults': patch
---

The `conciv-named-tab` header is gone: its only reader went with the refuse-and-retry path, so the CLI no longer sends it, the engine no longer parses it, and `@conciv/types` drops `CONCIV_NAMED_TAB_HEADER`.
