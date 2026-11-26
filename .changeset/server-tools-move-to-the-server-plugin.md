---
'@conciv/cli': patch
'@conciv/backend': patch
'@conciv/protocol': patch
'@conciv/harness': patch
---

The dev-server commands `conciv tools server config`, `urls`, `resolve`, `graph` and `transform`, and `conciv tools open`, are gone: use `conciv plugin call server <method>` with the input as `--data '<json>'`, for example `conciv plugin call server graph --data '{"file":"src/app.ts"}'` or `conciv plugin call server open --data '{"file":"src/app.ts","line":7}'`. `conciv tools server reload <file>` stays. `conciv tools server restart` is gone and nothing replaces it: the agent's `server_restart` tool asks first, and a person restarts their own dev server in their terminal. The engine's RPC procedures `server.config`, `server.urls`, `server.resolve`, `server.graph`, `server.transform`, `server.restart` and `editor.open` are removed; the same methods, except `restart`, answer through `plugin.call` with rpc id `server`. The agent's `server_*` tools and `open` now come from the engine's server plugin, and the agent guide teaches `conciv plugin call server graph` and `transform`.

When a session's stored permissions cannot be read, an outside agent is no longer offered the server tools or `open`: they are plugin tools now and plugin tools are withheld in that state, as the skill tool already was.
