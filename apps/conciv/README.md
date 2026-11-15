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
`vitest.config.ts` into it, and builds the branch. Only then does it measure, back to back, in Chromium and Firefox:
main, the branch, main again. Each run writes its own file of per-case medians and per-sample checks. It removes the
scratch worktree at the end (also on failure, Ctrl-C or SIGTERM).

Each case runs its scenario `PERF_SAMPLES` times, each on a fresh session and pane; every sample is printed and must keep
its sampled window and its count of frames over 33 ms. The branch's median p95 passes when it is at most 20 ms or at
most main's two-run median (the mean of main's medians before and after the branch) plus `PERF_MAIN_TOLERANCE_MS`. The
test asserts the same rule against main before the branch alone; the script's per-case `test:perf: PASS|FAIL` lines
judge with both main runs, decide the exit code, and say so when the two disagree. A branch run that exits non-zero
while none of its in-test median checks failed is red: the records do not explain that failure. `PERF_SAMPLES = 5` and
`PERF_MAIN_TOLERANCE_MS = 1.5` come from this machine's measured spread on 2026-11-14 and must be re-measured, not
guessed, if changed. They were measured in Chromium only; Firefox uses the same constants until it is measured on an
idle machine, and Firefox reports frame gaps in whole milliseconds.

When either main run breaks a per-sample check (the sampled window or the count of frames over 33 ms, on any sample of
any case, in either browser), the gate prints `main itself failed ... on <browser> before the branch, so this session
cannot judge the branch` (or `after the branch`) with that run's samples and exits non-zero: that exit is neither a pass nor
a regression. Before the branch, nothing runs on the branch; after the branch, the gate says the branch's lines above
are not a verdict. Main's median alone being over 20 ms is not a refusal. A branch that breaks a per-sample check while
both main runs held is red.

It needs `origin/main` locally (it never fetches) and fails without a branch run when main cannot be built or measured.
On the merge base itself it skips main and judges against the 20 ms budget alone, and says so. The baseline uses this
branch's test files against main's product code, so a branch whose perf helpers need product code main lacks fails
loudly at the baseline step. A run takes about 6 to 9 minutes on a warm turbo cache (an estimate: the earlier main, branch shape took 259 to 417 s on 2026-11-14 and 2026-11-15, and the third run adds one more perf run of both browsers). It is not part of `pnpm test` or CI.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
