---
'@conciv/plugin': patch
'@conciv/core': patch
'@conciv/chat': patch
'@conciv/ai': patch
---

A plugin's `context` and `compaction` session hooks, as opencode's, run before every model request of a turn and edit the system prompts, messages, model options and tools the harness receives.
