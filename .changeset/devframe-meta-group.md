---
'@conciv/core': patch
'@conciv/client': patch
'@conciv/app': patch
---

Serve the meta procedures (models, commands, tools, engine) as `conciv:meta:*` hub functions beside oRPC, sharing one implementation. Over the hub, the harness command listing gets the engine's own MCP URL, the same one written to the Claude connect endpoint file. The widget now reads models, commands, tools and the engine probe over the hub with the same query keys, and an engine probe the hub answered with an error no longer marks the engine unreachable.
