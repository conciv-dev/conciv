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
- scripts (`package.json`): `dev` (vite, port 3000), `generate-routes` (`tsr generate`), `build`, `typecheck`, `lint` (oxlint), `test` (vitest), `test:perf` (`node test-perf.mjs`, the calm perf gate below)
- `vite.config.ts`: `tanstackRouter({target: 'solid', autoCodeSplitting: false})`, `UnoCSS` (`unocss/vite`) and `solidPlugin`
- `vitest.config.ts`: `unit` project (node, `test/**/*.test.ts`) and `browser` project (headless Chromium, `coreCommands` from `test/commands/core-control.js`)
- `uno.config.ts`: `presetConciv`, scanning `src` and several `../../packages` sources; the utilities reach the widget through `virtual:uno.css?inline` (`src/lib/widget-styles.ts`)
- Subdirectories: [src](./src/README.md). `test/commands/` holds the command tests.

## Invariants

- `vitest.config.ts`: in `perf` mode only `test/calm-perf.browser.test.tsx` runs; otherwise that suite is excluded from the browser project
- `vitest.config.ts`: the browser project sets `fileParallelism: false`
- `vitest.config.ts`: the unit project excludes `*.browser.test.ts(x)`

## Perf gate

`pnpm --filter @conciv/app test:perf` runs `test-perf.mjs`. It checks out `git merge-base HEAD origin/main` into a
scratch worktree beside the repo, installs and builds it, copies this branch's perf test, helpers, `test/commands/` and
`vitest.config.ts` into it, and runs the `perf` project there (Chromium and Firefox), which writes main's median p95 per
case and browser to a file. It then builds and runs the `perf` project on the branch against that file, and removes the
scratch worktree (also on failure, Ctrl-C or SIGTERM). Each case runs its scenario `PERF_SAMPLES` times, each on a fresh
session and pane; every sample is printed and must keep its sampled window and its count of frames over 33 ms; the
median p95 passes when it is at most 20 ms or at most main's median plus `PERF_MAIN_TOLERANCE_MS`. `PERF_SAMPLES = 5`
and `PERF_MAIN_TOLERANCE_MS = 1.5` come from this machine's measured spread on 2026-11-14 and must be re-measured, not
guessed, if changed. It needs `origin/main` locally (it never fetches) and fails without a branch run when main cannot
be built or measured. On the merge base itself it skips main and judges against the 20 ms budget alone, and says so.
The baseline uses this branch's test files against main's product code, so a branch whose perf helpers need product
code main lacks fails loudly at the baseline step. A run takes about 7 minutes on a warm turbo cache (417 s measured on 2026-11-14). It is not part of `pnpm test` or CI.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
