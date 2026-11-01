# serve/src

## Overview

A wrapper over `@hono/node-server`'s `serve()` that listens with WebSocket support and closes live sockets gracefully on shutdown.

## Interface

- `serve.ts:serveHono` - starts the server and resolves `{server, wss, port, close}` once it is listening.
- `serve.ts:ServeHonoOptions` - `fetch`, `port` (default 0), `hostname` (default `127.0.0.1`), `maxPayload` (default `WS_MAX_PAYLOAD_BYTES`), `gracefulCloseMs` (default 2000).
- `serve.ts:ServedHono` / `ServeFetch` - exported types.
- `serve.ts:upgradeWebSocket` - re-exported from `@hono/node-server`.

## Invariants

- `serve.ts:serveHono` - passes `overrideGlobalObjects: false`, so the host's global `Request` and `Response` are not replaced.
- `serve.ts:serveHono` - rejects if the server emits `error` before `listening`.
- `serve.ts:closeLiveSockets` - closes sockets with code 1001 (`server shutting down`) and terminates any still open after `gracefulCloseMs`.

## Side Effects

- `serve.ts:serveHono` - binds a TCP port and creates a `ws` `WebSocketServer` in `noServer` mode.
- `serve.ts:closeServer` - closes the HTTP server and calls `closeAllConnections` when available.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/serve` from the repo root (turbo builds the package and its dependencies first)
