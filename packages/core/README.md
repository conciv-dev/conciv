# @conciv/core

The conciv engine: a Hono server (served through `@conciv/serve`) exposing `/health`, `/rpc/*`, `/rpc-ws` and `/api/mcp`, with a harness registry seam.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Overview

Package root for @conciv/core, the engine that @conciv/it installs. Node entries are built with tsdown and a Solid tool-card browser bundle with vite.

## Interface

- Exports `.` and `./start` (`package.json`): dist/start.js
- Exports `./app`, `./config`, `./runtime` (`package.json`)
- `scripts` (`package.json`): build (`tsdown && tsc -p tsconfig.build.json`), typecheck (`tsconfig.json`), lint, publint, attw
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - engine entry and app composition

## Invariants

- `entry` (`tsdown.config.ts`): only src/start.ts, config.ts, app.ts and runtime.ts are Node entries, plus src/sessions/search-index-worker.ts built as dist/search-index-worker.js, the session search index's `node:worker_threads` entry

## Side Effects

- `build` (`package.json`): writes dist/

## Verification

- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
