---
'@conciv/protocol': patch
'@conciv/plugin-page': patch
'@conciv/serve': patch
'@conciv/core': patch
'@conciv/chat': patch
---

`CONCIV_UI_SELECTOR` and `EFFECTS_SURFACE_ATTR` move to `@conciv/protocol/page-types` (new exports there). `@conciv/extension` re-exports both from protocol, so old extensions keep their import; `@conciv/page` imports them from protocol.

The RPC transport moves to the new `@conciv/serve/rpc` subpath: `RPC_PREFIX`, `RpcSocketGate`, `UpgradeWebSocket`, `rpcFetchMiddleware` and `rpcWebsocketRoute`. `@conciv/serve` now depends on `@conciv/contract`, `@orpc/server`, `semver` and `zod`. `@conciv/extension/rpc-mount` no longer exports `RPC_PREFIX`, `RpcSocketGate`, `UpgradeWebSocket`, `rpcFetchMiddleware`, `rpcWebsocketRoute`, `rpcConnectionContext` or `rpcHandlerOptions`; it keeps `makeCompositeRpcRouter`, `CompositeRpcRouter` and `MountedExtensionRouter`. `@conciv/core`, `@conciv/chat` and `@conciv/extension` take the transport and its `UpgradeWebSocket` type from `@conciv/serve/rpc`, and the engine staleness probe now tracks both `@conciv/serve` entries.
