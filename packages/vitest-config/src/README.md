# vitest-config/src

## Overview

Shared CI tooling for the monorepo: vitest config factories (reporters, coverage, timeouts, worker cap), a Solid cleanup setup file, a Solid library vite config, and the CLI logic that plans GitHub Actions shard matrices from package timings, runs turbo for a shard, and turns vitest / Playwright JSON reports and coverage into a Markdown job summary.

## Interface

- `ciTest()` (`reporters.ts`): `{reporters, coverage (v8, json-summary, reportsDirectory 'coverage', enabled on CI only), testTimeout/hookTimeout/teardownTimeout 30_000, maxWorkers?}`.
- `ciReporters()` (`reporters.ts`): `['default']` locally; on CI adds `github-actions` (jobSummary off) and `json` -> `test-results.json`.
- `ciTestSolidBrowser()` (`reporters.ts`): `ciTest()` plus `setupFiles: ['@conciv/vitest-config/solid-cleanup']`.
- `browserOptimizeDeps(alsoInclude = [])`, `TANSTACK_AI_SOLID_DEPS` (`reporters.ts`).
- `solid-cleanup-setup.ts` (export `./solid-cleanup`): registers `afterEach(cleanup)` from `@solidjs/testing-library`.
- `solidLibConfig({entry, external})`, `SolidLibBuild` (`vite-lib.ts`, export `./vite-lib`): solid plugin, ES lib output `index.js`, sourcemaps, `emptyOutDir`.
- CLI `conciv-ci-shards <plan|run|report|summarize> [--task test|e2e] [--timings F] [--output F]` (`ci-shards.ts`). `TASKS.test` runs turbo `typecheck lint test --continue=dependencies-successful` over `packages/` and `apps/`; `TASKS.e2e` runs `test:e2e --continue --concurrency=1` over `e2e/` and `apps/site`.
- CLI `conciv-ci-summary [--details] [--title T] [roots...]` (`ci-summary.ts`): summary from `test-results.json` files; roots default to `packages`.
- `planShards(packages, timings, sizing?)`, `planE2eShards`, `discoverPackages(rootDir, groupDirs)`, `plannedPackages`, `e2ePackages`, `parseTimings`; constants `PACKAGE_GROUPS`, `PACKAGES_WITH_DEDICATED_JOBS` (`['conciv-storybook']`), `E2E_HARNESS_PACKAGE`, `TARGET_SHARD_MS` (150_000), `DEFAULT_PACKAGE_MS` (5_000), `E2E_SHARD_SIZING`; types `WorkspacePackage`, `ShardPlan`, `E2eShardPlan`, `ShardSizing` (`shards.ts`).
- `parseReport`, `parseCoverage`, `parseSummaries`, `mergeSummaries`, `loadSummaries(roots)`, `renderSummary(packages, options?)`; types `PackageSummary`, `CaseResult`, `CaseStatus`, `CaseAnnotation`, `Coverage`, `RenderOptions` (`summary.ts`).

## Invariants

- Unknown `--task` throws `unknown --task X; expected test or e2e` (`taskConfig`); `run` throws when `SHARD_PACKAGES` is empty; an unknown subcommand prints usage and sets `process.exitCode = 2` (`ci-shards.ts`).
- Timings files over `MAX_TIMINGS_BYTES` (1,000,000) are ignored; report files over `MAX_REPORT_BYTES` (20,000,000) are skipped with a stderr warning (`ci-shards.ts`).
- `readPackage` throws when package.json lacks a string name or the name fails `VALID_PACKAGE_NAME`; `parseTimings` keeps only finite non-negative numbers (`shards.ts`).
- Shard count is `max(ceil(total / targetMs), minShards, 1)`, raised to `bootstrapShards` without timings, capped by `maxShards` and package count; packages are bin-packed heaviest first; `chromium` is set when a member depends on `playwright`, `@playwright/*` or `@vitest/browser*` (`planShards`, `usesBrowser`).
- `plannedPackages` excludes `PACKAGES_WITH_DEDICATED_JOBS`; `e2ePackages` keeps packages with a `test:e2e` script.
- `VITEST_MAX_FORKS` becomes `maxWorkers` only when it is an integer >= 1 (`forkCap`, `reporters.ts`).
- Report discovery skips `node_modules`, `dist`, `.turbo`, `.git`, `test`, `src` (`SKIPPED_DIRS`); a file that failed without failed assertions becomes a synthetic failed case (`crashedWithoutAssertions`); failure messages are cut at `MAX_FAILURE_CHARS` (8,000) with ANSI stripped; Playwright reports are detected by an array `suites` and mapped through `PLAYWRIGHT_STATUS` (`summary.ts`).

## Side Effects

- Reads `GITHUB_ACTIONS` and `VITEST_MAX_FORKS`; on CI the json reporter writes `test-results.json` and coverage goes to `coverage/` (`reporters.ts`).
- Registers a global `afterEach(cleanup)` (`solid-cleanup-setup.ts`).
- `plan` appends `matrix=<json>` to `$GITHUB_OUTPUT` and prints it; `run` spawns `pnpm exec turbo run <tasks> --filter=<pkg>...` with `execFileSync` and inherited stdio; `report` writes `--output` (default `shard-report.json`); `summarize` appends to `$GITHUB_STEP_SUMMARY` (or stdout) and writes measured timings to `--timings` (`ci-shards.ts`).
- `ci-summary.ts` appends to `$GITHUB_STEP_SUMMARY` or writes to stdout.
- `summary.ts` walks directories, reads `test-results.json`, `coverage/coverage-summary.json` and package.json files, and caches owner lookups in the module-level `packageByDir` map; `discoverPackages` reads workspace package.json files (`shards.ts`).

## Verification

- Run: `cd packages/vitest-config && pnpm test`
