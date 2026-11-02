---
'@conciv/core': patch
---

Serve the meta procedures (models, commands, tools, engine) as `conciv:meta:*` hub functions beside oRPC, sharing one implementation. Over the hub, the harness command listing gets the engine's own MCP URL, the same one written to the Claude connect endpoint file.
