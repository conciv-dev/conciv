---
'@conciv/cli': patch
'@conciv/contract': patch
'@conciv/core': patch
---

The hub, the engine's MCP replies and the code reply formatter build a finished page queue's notice with one shared `queueNoticePart` from `@conciv/contract`, instead of three copies.
