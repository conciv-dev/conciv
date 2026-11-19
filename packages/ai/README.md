# @conciv/ai

The chat primitives conciv is built from: messages, events, tools, usage and a testkit, on top of
TanStack AI.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Overview

- `./server` runs chat turns and holds the harness text adapters, `./client` is the browser chat session, `./testkit` scripts chat event streams for tests and stories. Source: [src](./src/README.md).
- `tsdown.config.ts` has two ESM builds (`dts: false`; `tsc -p tsconfig.build.json` emits the declarations): one for `src/server.ts`, `src/testkit.ts` and the QuickJS worker, one for `src/client.ts` alone.

## Invariants

- `package.json:type` - ESM only (`"module"`); the `attw` script checks the `esm-only` profile.
- The server build bundles nothing: every `@tanstack/ai-*` package stays a dependency the consumer resolves.
- The client build bundles `@tanstack/ai-client` and `@tanstack/ai-solid` with `NODE_ENV` fixed to `production`, so their devtools bridge is the no-op one even in a development Vite host. `solid-js`, `@tanstack/ai`, `@tanstack/ai-event-client` and `@tanstack/store` stay external, so the page loads one copy of each.

## Side Effects

- The package root (configs and manifest) has none. At runtime the server runtime writes runs and threads to drizzle SQLite tables and delivers them over SSE and WebSocket; the testkit schedules timers per chunk. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ai` from the repo root (turbo builds the package and its dependencies first)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/ai` from the repo root (turbo builds the package and its dependencies first)
