---
'@conciv/types': patch
'@conciv/plugin-page': patch
'@conciv/serve': patch
'@conciv/backend': patch
'@conciv/backend-defaults': patch
---

`CONCIV_UI_SELECTOR` and `EFFECTS_SURFACE_ATTR` move to `@conciv/types/page-types` (new exports there). `@conciv/extension` re-exports both from protocol, so old extensions keep their import; `@conciv/page` imports them from protocol.

The RPC transport moves to the new `@conciv/serve/rpc` subpath: `RPC_PREFIX`, `RpcSocketGate`, `UpgradeWebSocket`, `rpcFetchMiddleware` and `rpcWebsocketRoute`. `@conciv/serve` now depends on `@conciv/protocol`, `@orpc/server`, `semver` and `zod`. `@conciv/extension/rpc-mount` no longer exports `RPC_PREFIX`, `RpcSocketGate`, `UpgradeWebSocket`, `rpcFetchMiddleware`, `rpcWebsocketRoute`, `rpcConnectionContext` or `rpcHandlerOptions`; it keeps `makeCompositeRpcRouter`, `CompositeRpcRouter` and `MountedExtensionRouter`. `@conciv/backend`, `@conciv/backend-defaults` and `@conciv/extension` take the transport and its `UpgradeWebSocket` type from `@conciv/serve/rpc`, and the engine staleness probe now tracks both `@conciv/serve` entries.
