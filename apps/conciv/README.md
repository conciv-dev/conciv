# conciv

## Overview

The conciv app: a TanStack Solid Router UI over the `@conciv/contract` rpc surface.
Private, never published. `@conciv/embed` inlines it into the embed bundle; standalone
dev runs it against a core dev server: `pnpm dev`, then open
`http://localhost:3000/?core=http://127.0.0.1:<core-port>`.

Routes are the layout: `/` closed, `/panel/$sessionId/$view` panel, `/quick` quick
terminal layer, `/pip/$sessionId` picture-in-picture. Embedded runs use
`@conciv/storage-history` (db-persisted); standalone uses browser history.

Behavioral coverage lives in `packages/embed`'s real-browser ITs; this package only
unit-tests pure parsers plus the router-restore path (vitest browser project).

## Interface

- `./router` export (`package.json`): `src/router.tsx`
- `./settings` export (`package.json`): `src/data/settings.ts`
- `./shadow` export (`package.json`): `src/lib/shadow.ts`
- `./api-base` export (`package.json`): `src/lib/api-base.ts`
- `./styles.css` export (`package.json`): `src/styles.css`
- scripts (`package.json`): `dev` (vite, port 3000), `generate-routes` (`tsr generate`), `build`, `typecheck`, `lint` (oxlint), `test` (vitest), `test:perf`
- `vite.config.ts`: `tanstackRouter({target: 'solid', autoCodeSplitting: false})` plus `solidPlugin`
- `vitest.config.ts`: `unit` project (node, `test/**/*.test.ts`) and `browser` project (headless Chromium, `coreCommands` from `test/commands/core-control.js`)
- `uno.config.ts`: `presetConciv`, scanning `src` and several `../../packages` sources
- Subdirectories: [src](./src/README.md). `test/commands/` holds the command tests.

## Invariants

- `vitest.config.ts`: in `perf` mode only `test/calm-perf.browser.test.tsx` runs; otherwise that suite is excluded from the browser project
- `vitest.config.ts`: the browser project sets `fileParallelism: false`
- `vitest.config.ts`: the unit project excludes `*.browser.test.ts(x)`

## Side Effects

- None

## Verification

- Run: `cd apps/conciv && pnpm typecheck && pnpm lint && pnpm test`
