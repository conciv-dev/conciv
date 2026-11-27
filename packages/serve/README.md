# @conciv/serve

## Overview

The engine's HTTP and WebSocket server: a `@hono/node-server` `serve()` wrapper that always binds `127.0.0.1`, keeps the host's global `Request`/`Response`, and closes live sockets gracefully, plus the oRPC transport the engine serves its router over. Installed with `@conciv/it`, not directly. Source: [src](./src/README.md).

## Invariants

- The server binds `127.0.0.1` only; there is no option to bind another interface.
- `vite build` emits the JavaScript and the declarations (`vite.config.ts`).

## Side Effects

- The package root (configs and manifest) has none. At runtime `serveHono` binds a TCP port and creates a `ws` server; `closeServer` closes live sockets. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/serve` from the repo root (turbo builds the package and its dependencies first)
