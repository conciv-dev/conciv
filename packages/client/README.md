# @conciv/client

## Overview

The browser's engine connection and data layer, used inside @conciv/it: the oRPC client over the engine's rpc
socket, TanStack Query utilities, the chat connection and session, engine reachability, and the fake engine for
tests. No UI. It ships `dist` and `skills`.

## Interface

- `exports` (`package.json`): `.` (the connection, rpc client, query utils, chat connection, reachability), `./chat`
  (the Solid chat session over `@tanstack/ai-solid`) and `./testing` (`createFakeEngine`, `FakeLLM` and story
  connections). No bin.
- `tsdown.config.ts`: bundles `@tanstack/ai`, `@tanstack/ai-solid`, `@tanstack/solid-query`, `@tanstack/query-core`
  and `@orpc/tanstack-query` into `.` and `./testing`; `./chat` inlines `@tanstack/ai-client` and `@tanstack/ai-solid`.
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - connection, chat connection, reachability
  - solid-query skill: [./skills/client/solid-query/SKILL.md](./skills/client/solid-query/SKILL.md) - @tanstack/solid-query and oRPC usage rules

## Invariants

- `type: module` (`package.json`): ESM only, attw profile esm-only
- `description` (`package.json`): internal to @conciv/it, not installed directly
- One TanStack Query copy at runtime: this bundle is it, carrying the TanStack/query#11230 patch from `patches/`. Everything outside packages/client imports TanStack Query from `@conciv/client` (`no-restricted-imports` in `.oxlintrc.json`); a direct import would resolve a second, unpatched copy with its own QueryClient context and onlineManager
- The fake engine (`./testing`) is built with oRPC's `implement(contract)` on the real `@conciv/protocol` contract; when a test needs something it cannot do, the fake is extended to match the real engine.

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/client` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/client && pnpm typecheck`, then `pnpm lint` at the repo root
