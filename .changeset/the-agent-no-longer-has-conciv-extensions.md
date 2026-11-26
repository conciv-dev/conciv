---
'@conciv/backend': patch
'@conciv/harness': patch
---

The agent no longer has the `conciv_extensions` tool or the `conciv-extensions` skill. `concivExtensionsToolDef` is gone from `@conciv/tools/defs`, the `ExtensionsCard` is gone from `@conciv/tools/cards`, and code mode no longer binds `external_conciv_extensions`. Plugins are taught by the built-in conciv skill.
