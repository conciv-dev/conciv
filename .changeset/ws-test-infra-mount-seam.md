---
'@conciv/extension': patch
'@conciv/serve': patch
---

Move the rpc mount seam (`makeCompositeRpcRouter`, `rpcFetchMiddleware`, `rpcWebsocketRoute`, `RPC_PREFIX`,
`RPC_WS_PATH`) from `@conciv/core` into `@conciv/extension/rpc-mount`, so extension fixtures and test harnesses
mount the same composite router over both transports instead of hand-rolling a second one. `@conciv/core`
imports the seam from there; behavior is unchanged.

`rpcWebsocketRoute(router, {upgrade, onError})` now takes its `upgradeWebSocket` adapter as an injected
argument instead of importing `@hono/node-server` directly, so every caller (core's own mount, the test
harnesses, extension fixtures) shares one `@hono/node-server` module instance for the upgrade — a second
instance silently refuses the upgrade. `@conciv/serve` re-exports `upgradeWebSocket` as the one sanctioned
source for that adapter; pass it (and an optional `onError` for rejected frames) at every call site.
