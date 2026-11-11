# @conciv/ai

The chat primitives conciv is built from: messages, events, tools, usage and a testkit, on top of
TanStack AI.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- `package.json:exports` - `./server` (`dist/server.js`), `./client` (`dist/client.js`), `./testkit` (`dist/testkit.js`).
- `tsdown.config.ts` - two builds, both ESM with type declarations: one for `src/server.ts`, `src/testkit.ts` and the QuickJS worker, one for `src/client.ts` alone.
- `vitest.config.ts` - spreads `ciTest()` from `@conciv/vitest-config`.
- Source: [src](./src/README.md).

## Invariants

- `package.json:type` - ESM only (`"module"`); the `attw` script checks the `esm-only` profile.
- `tsdown.config.ts:noExternal` - the server build bundles the `@tanstack/ai-(acp|claude-code|code-mode|codex|opencode|sandbox|sandbox-local-process)` packages into the output.
- The client build bundles `@tanstack/ai-client` and `@tanstack/ai-solid` with `NODE_ENV` fixed to `production`, so their devtools bridge is the no-op one even in a development Vite host. `solid-js`, `@tanstack/ai`, `@tanstack/ai-event-client` and `@tanstack/store` stay external, so the page loads one copy of each.

## Side Effects

- The package root (configs and manifest) has none. At runtime the server runtime writes runs and threads to drizzle SQLite tables and delivers them over SSE and WebSocket; the testkit schedules timers per chunk. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ai` from the repo root (turbo builds the package and its dependencies first)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/ai` from the repo root (turbo builds the package and its dependencies first)
