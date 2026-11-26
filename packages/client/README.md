# @conciv/client

## Overview

The browser's engine connection and data layer, used inside @conciv/it: the oRPC client over the engine's rpc
socket (`EngineClient`), the one client every reader uses (`ConcivClient`, with plugins' typed rpc as `PluginClient`),
TanStack Query utilities, the chat connection and session, and engine reachability. No UI. The fake engine for tests
is `@internal/test-utils`. It ships `dist` and `skills`.

## Interface

- `exports` (`package.json`): `.` (the client, connection, rpc client, query utils, chat connection, reachability)
  and `./chat` (the Solid chat session over `@tanstack/ai-solid`). No bin.
- `tsdown.config.ts`: bundles `@tanstack/ai`, `@tanstack/ai-solid`, `@tanstack/solid-query`, `@tanstack/query-core`
  and `@orpc/tanstack-query` into `.`; `./chat` inlines `@tanstack/ai-client` and `@tanstack/ai-solid`.
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - connection, chat connection, reachability
  - solid-query skill: [./skills/client/solid-query/SKILL.md](./skills/client/solid-query/SKILL.md) - @tanstack/solid-query and oRPC usage rules

## Invariants

- `type: module` (`package.json`): ESM only, attw profile esm-only
- `description` (`package.json`): internal to @conciv/it, not installed directly
- One TanStack Query copy at runtime: this bundle is it, carrying the TanStack/query#11230 patch from `patches/`. Everything outside packages/client imports TanStack Query from `@conciv/client` (`no-restricted-imports` in `.oxlintrc.json`); a direct import would resolve a second, unpatched copy with its own QueryClient context and onlineManager

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/client` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/client && pnpm typecheck`, then `pnpm lint` at the repo root
