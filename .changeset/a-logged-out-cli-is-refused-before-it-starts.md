---
'@conciv/protocol': patch
'@conciv/harness': patch
'@conciv/core': patch
'@conciv/chat': patch
---

A harness can now say whether its CLI is logged in, through a `login` check its capabilities declare. Claude reads it from the Agent SDK's account info, the way opencode does, and Codex from `codex login status`. A turn sent to a CLI that is not logged in is refused before the CLI starts, with a chat error that says how to log in, and the model lists carry the same login state.
