---
'@conciv/client': patch
'@conciv/backend-plugin-api': patch
---

The plugin client (`Conciv`, `ConcivClient`, plugin rpc, `ServerRef`, `Servers`, `PluginInfo`) moves from `@conciv/backend-plugin-api` to `@conciv/client/plugin`, so browser code imports no backend package. `@conciv/backend-plugin-api/rpc` is gone: a plugin's shared `rpc.ts` imports `@conciv/protocol/schema/rpc`.
