---
'@conciv/simulation': patch
'@conciv/backend-test-utils': patch
---

A test calls a plugin's own rpc: `engine.rpc.call(rpcId, method, input?)`, and `engine.rpc.failure(...)`, which answers the plugin rpc failure as `{type, message, data?}` and rejects when the call answers instead.
