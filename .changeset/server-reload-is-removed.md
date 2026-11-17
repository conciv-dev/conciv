---
'@conciv/cli': patch
'@conciv/core': patch
'@conciv/contract': patch
'@conciv/tools': patch
'@conciv/harness-init': patch
'@conciv/plugin': patch
---

The agent's `server_reload` tool is removed, and with it the `conciv tools server reload <file>` command (the whole `conciv tools server` group is gone; the dev-server methods answer through `conciv plugin call server <method>`). Instead, save the file: the dev server's own watcher pushes the hot update, and the page plugin's hot update wait (`page_hmr`, `conciv tools page hmr`) reports when it landed.

Removed published exports: `@conciv/contract` loses `contract.server` (the `server.reload` procedure and its `NO_BUNDLER` error), so `RpcClient` and the `@conciv/plugin` client no longer have a `server` group; `@conciv/tools/builtins` loses `BUILTIN_SERVER_TOOL`, `BUILTIN_SERVER_TOOLS`, `ServerToolContext`, `SERVER_TOOL_PREFIX` and `serverOperationOfTool`, and `builtinToolNames()` now answers only `tabs`. The agent guide no longer teaches `conciv tools server ...`.
