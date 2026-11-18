---
'@conciv/plugin': patch
'@conciv/core': patch
'@conciv/chat': patch
---

A plugin's `context` session hook, as opencode's, sees the system prompt of each chat turn and what it adds to `system` is part of the system prompt the harness receives.
