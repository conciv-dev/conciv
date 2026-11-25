---
'@conciv/backend-plugin-api': patch
'@conciv/backend': patch
'@conciv/backend-defaults': patch
---

A plugin's `context` and `compaction` session hooks, as opencode's, run before every model request of a turn and edit the system prompts, messages, model options and tools the harness receives.
