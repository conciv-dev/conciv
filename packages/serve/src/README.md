# serve/src

## Overview

A wrapper over `@hono/node-server`'s `serve()` that listens with WebSocket support and closes live sockets gracefully on shutdown, and the oRPC transport (HTTP middleware and WebSocket route) the engine serves its router over.

## Interface

- `serve.ts:serveHono` - starts the server and resolves `{server, port, close}` once it is listening.
- `serve.ts:ServeHonoOptions` - `fetch`, `port` (default 0), `maxPayload` (default `WS_MAX_PAYLOAD_BYTES`), `gracefulCloseMs` (default 2000).
- `serve.ts:ServedHono` / `ServeFetch` - exported types.
- `serve.ts:upgradeWebSocket` - re-exported from `@hono/node-server`.
- `rpc.ts:rpcFetchMiddleware` / `rpcWebsocketRoute` / `RpcSocketGate` / `UpgradeWebSocket` / `RPC_PREFIX` ('/rpc') - the oRPC transport, the `./rpc` export; the socket path is `RPC_WS_PATH` from `@conciv/protocol/rpc-types`; both give each call `RpcContext.replied`: `rpcFetchMiddleware` from the node response (`c.env.outgoing`) `close` and its `writableFinished` (absent when the request has no node response), `rpcWebsocketRoute` per request frame, true once oRPC settled that frame without error

## Invariants

- `serve.ts:serveHono` - binds `127.0.0.1` only.
- `serve.ts:serveHono` - passes `overrideGlobalObjects: false`, so the host's global `Request` and `Response` are not replaced.
- `serve.ts:serveHono` - rejects if the server emits `error` before `listening`.
- `rpc.ts:rpcHandlerOptions` - refuses a call with `UNAUTHORIZED` when the context's `socket` trust does not allow its path; merges the request headers over the context headers (a socket's context starts with its upgrade request's `user-agent`) and sets `clientVersion` from `x-conciv-version` when it is a semver string (zod; anything else leaves it unset), for the HTTP and the websocket handler alike
- `serve.ts:closeLiveSockets` - closes sockets with code 1001 (`server shutting down`) and terminates any still open after `gracefulCloseMs`.

## Side Effects

- `serve.ts:serveHono` - binds a TCP port and creates a `ws` `WebSocketServer` in `noServer` mode.
- `serve.ts:closeServer` - closes the HTTP server and calls `closeAllConnections` when available.
- `rpc.ts:rpcWebsocketRoute` - closes the socket with 1011 on a rejected frame; a `{type: 'conciv:trust', token}` frame never reaches oRPC, it goes to the optional per-connection `gate` (dropped when there is none); when the gate closes the socket (a revoke), every open event-iterator call on it first fails with `UNAUTHORIZED`, every call's `signal` on that socket is aborted at the same moment (each request's signal is joined with the socket's revocation), so the procedure behind a stream ends even when it is waiting for its next item, and the close waits until those error frames are sent; an event-iterator call is no longer pulled once the socket holds more than `MAX_UNSENT_BYTES` (8 MiB) it has not sent yet: it fails with `SLOW_CONSUMER` instead of the engine buffering for a reader that stopped reading

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/serve` from the repo root (turbo builds the package and its dependencies first)
