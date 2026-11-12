---
'@conciv/harness': patch
'@conciv/protocol': patch
---

The Claude harness reads a session's model, token usage and cost from its transcript (`history.transcriptUsage({cwd, nativeId})`), looked up by the harness session id in the project folder first, then in every project folder.
