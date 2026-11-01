# @conciv/client

## Overview

Client data layer used inside @conciv/it: typed oRPC query utilities, a chat connection, and push and reachability helpers, with no UI. It ships `dist` and `skills`.

## Interface

- `exports['.']` (`package.json`): ./dist/index.js; no bin; `files` dist and skills
- `tsdown.config.ts`: entry src/index.ts, esm, bundles @tanstack/ai and @tanstack/ai-solid
- `vitest.config.ts`: node project `client` over test/**/*.test.ts
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - query utils, chat connection, push channel, reachability
  - solid-query skill: [./skills/client/solid-query/SKILL.md](./skills/client/solid-query/SKILL.md) - @tanstack/solid-query and oRPC usage rules

## Invariants

- `type: module` (`package.json`): ESM only, attw profile esm-only
- `description` (`package.json`): internal to @conciv/it, not installed directly

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/client` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/client && pnpm typecheck && pnpm lint`
