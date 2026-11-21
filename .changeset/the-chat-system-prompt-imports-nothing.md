---
'@conciv/harness': patch
'@conciv/core': patch
---

The chat system prompt moves to `@conciv/harness/claude/system-prompt`, a module that imports nothing, so reading conciv's config no longer loads the whole Claude harness.
