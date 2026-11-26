---
'@conciv/harness': patch
'@conciv/backend': patch
---

The chat system prompt now lives in core, in a module that imports nothing, so reading conciv's config no longer loads the whole Claude harness. `@conciv/harness/claude` no longer exports the unused `CHAT_SYSTEM_PROMPT`.
