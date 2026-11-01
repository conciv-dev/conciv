# @conciv/core

The conciv engine: a Hono server (served through `@conciv/serve` and `@hono/node-server`) exposing `/health`, `/rpc/*`, `/api/mcp` and the chat and push routes, with a harness registry seam.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Overview

Package root for @conciv/core, the engine that @conciv/it installs. Node entries are built with tsdown and a Solid tool-card browser bundle with vite.

## Interface

- Exports `.` and `./start` (`package.json`): dist/start.js
- Exports `./app`, `./config`, `./runtime` (`package.json`)
- Export `./cards` (`package.json`): dist/cards.js with `browser` and `import` conditions
- `peerDependencies` (`package.json`): solid-js
- `scripts` (`package.json`): build (`tsdown && vite build && tsc -p tsconfig.cards.build.json`), typecheck (tsconfig.json and tsconfig.cards.json), lint, test, publint, attw
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - engine entry, app composition, page bus, tool registry
  - `test/rpc/`: type test for the page error map (`page-error-map.test-d.ts`)

## Invariants

- `entry` (`tsdown.config.ts`): only src/start.ts, config.ts, app.ts and runtime.ts are Node entries
- `build.lib` (`vite.config.ts`): src/cards.tsx builds to cards.js with `emptyOutDir: false` so it does not wipe tsdown output
- `rollupOptions.external` (`vite.config.ts`): solid-js, zod, @conciv/_, lucide-solid, rrweb_, @tanstack/* and @orpc/* stay external
- `test.include` (`vitest.config.ts`): only `test/**/*.test.ts`, run with `--expose-gc`

## Side Effects

- `build` (`package.json`): writes dist/
- `uno.config.ts`: scans src/**/*.{ts,tsx} with `presetConciv`

## Verification

- Run: `cd packages/core && pnpm test`
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
