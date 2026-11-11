# @conciv/client

## Overview

Client data layer used inside @conciv/it: typed oRPC query utilities, a chat connection, and push and reachability helpers, with no UI. It ships `dist` and `skills`.

## Interface

- `exports['.']` (`package.json`): ./dist/index.js; no bin; `files` dist and skills
- `tsdown.config.ts`: entry src/index.ts, esm, bundles @tanstack/ai and @tanstack/ai-solid, and bundles @tanstack/solid-query, @tanstack/query-core and @orpc/tanstack-query into the JS while the d.ts keeps importing them
- `src/index.ts` re-exports the TanStack Query surface the widget and extensions use (useQuery, useInfiniteQuery, useMutation, useMutationState, useQueryClient, useIsFetching, QueryClient, QueryClientProvider, keepPreviousData, CreateMutationResult, QueryKey) and `createTanstackQueryUtils`
- `vitest.config.ts`: node project `client` over test/**/*.test.ts
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - query utils, chat connection, push channel, reachability
  - solid-query skill: [./skills/client/solid-query/SKILL.md](./skills/client/solid-query/SKILL.md) - @tanstack/solid-query and oRPC usage rules

## Invariants

- `type: module` (`package.json`): ESM only, attw profile esm-only
- `description` (`package.json`): internal to @conciv/it, not installed directly
- One TanStack Query copy at runtime: this bundle is it, carrying the TanStack/query#11230 patch from `patches/`. Everything outside packages/client imports TanStack Query from `@conciv/client` (`no-restricted-imports` in `.oxlintrc.json`); a direct import would resolve a second, unpatched copy with its own QueryClient context and onlineManager

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/client` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/client && pnpm typecheck && pnpm lint`
