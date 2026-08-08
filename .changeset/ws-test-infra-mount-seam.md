---
'@conciv/extension': patch
---

Move the rpc mount seam (`makeCompositeRpcRouter`, `rpcFetchMiddleware`, `rpcWebsocketRoute`, `RPC_PREFIX`, `RPC_WS_PATH`) from `@conciv/core` into `@conciv/extension/rpc-mount`, so extension fixtures and test harnesses mount the same composite router over both transports instead of hand-rolling a second one. `@conciv/core` imports the seam from there; behavior is unchanged.
