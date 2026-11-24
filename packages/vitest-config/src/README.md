# vitest-config/src

## Overview

Shared CI tooling for the monorepo: vitest config factories (reporters, coverage, timeouts, worker cap), a Solid library vite config, and the CLI logic that plans GitHub Actions shard matrices from package timings, runs turbo for a shard, and turns vitest / Playwright JSON reports and coverage into a Markdown job summary for the shards.

## Interface

- `ciTest()` (`reporters.ts`): `{reporters, coverage (v8, json-summary, reportsDirectory 'coverage', enabled on CI only), testTimeout/hookTimeout/teardownTimeout 30_000, maxWorkers?, globalSetup: [setup/conciv-home-setup.ts]}`; calling it makes nothing.
- `tempDir(prefix)` (`temp-dir.ts`, export `./temp-dir`): makes a folder inside one `conciv-test-*` folder per test file, which an `afterAll` registered when the module loads removes once that file is done, passed or failed. Every test that needs a temp folder takes it from here.
- `ciReporting()` (`reporters.ts`): `{reporters: ciReporters(), coverage}`, the root-only part of `ciTest()` (vitest reads reporters and coverage only at the root). A package on `concivTest()` puts it at the root of its own `test`; `ciTest()` is not used there because its `globalSetup` sets a `CONCIV_HOME` the kit's engines never read (they get their home explicitly).
- `ciReporters()` (`reporters.ts`): `['default']` locally; on CI adds `github-actions` (jobSummary off) and `json` -> `test-results.json`.
- `TANSTACK_AI_SOLID_DEPS` (`reporters.ts`).
- `solidLibConfig({entry, external})`, `SolidLibBuild` (`vite-lib.ts`, export `./vite-lib`): solid plugin, ES lib output `index.js`, sourcemaps, `emptyOutDir`.
- CLI `conciv-ci-shards <plan|run|report|coverage|summarize> [--task test|e2e] [--timings F] [--output F] [--coverage DIR] [--untested DIR] [--coverage-output DIR]` (`ci-shards.ts`). `TASKS.test` runs turbo `typecheck lint test --continue=dependencies-successful` over `packages/` and `apps/`; `TASKS.e2e` runs `typecheck test:e2e --continue` over `e2e/` and `apps/site`.
- `planShards(packages, timings, sizing?)`, `planE2eShards`, `plannedPackages`, `e2ePackages`, `parseTimings`; constant `E2E_SHARD_SIZING`; types `WorkspacePackage`, `ShardPlan`, `E2eShardPlan`, `ShardSizing` (`shards.ts`).
- `parseSummaries`, `mergeSummaries`, `mergeLcov(reports, keep?, untested?)`, `rebaseLcov`, `isWorkspaceSource`, `coverageByPackage(files, root)`, `coverageOnlySummary`, `loadSummaries(roots)`, `renderSummary(packages, options?)`; types `PackageSummary`, `CaseResult`, `CaseStatus`, `CaseAnnotation`, `Coverage`, `RenderOptions` (`summary.ts`).
- Subdirectories:
  - setup: [./setup/README.md](./setup/README.md) - the conciv home globalSetup `ciTest()` carries

## Invariants

- A package heavier than one shard's target (`ShardSizing.splitHeavy`, on for the test plan, off for e2e) is planned as parts `name#i/N`, each a separate shard entry: `run` gives a part its own turbo `test` with vitest `--shard=i/N`, and runs the package's other tasks (typecheck, lint) in part 1 only. A part count never exceeds the shard count, and no shard gets two parts of one package, so parts never overwrite each other's `test-results.json` or `coverage/`. Reports are named by the package, never the part, so `mergeSummaries` adds the parts' times back up and the timings file keeps the whole package time. `coverage` copies each package's `coverage/lcov.info` into one folder per shard, its `SF` paths made relative to the repo root (`rebaseLcov`); an empty set writes nothing and exits 0. `summarize --coverage <dir>` merges every lcov by source file (`mergeLcov`: hits summed per line, a line counts once), keeps workspace sources only (`isWorkspaceSource`: no `dist`, no `node_modules`, nothing outside the repo), credits each file to the package that owns it (`coverageByPackage`), adds a row for a package that has coverage but no tests (`coverageOnlySummary`), and with `--coverage-output <dir>` writes the one merged `lcov.info`. `--untested <dir>` adds the lcov of `untested-sources.config.ts`, a coverage run with no test files that lists every workspace `src` `.ts`, `.tsx` and `.js` file at 0 (it carries the site's `@brand-assets` alias, which `apps/site/src/lib/brand-assets.ts` globs through); a file from it counts only when no package run loaded that file, so a source nothing runs still counts in its package and the total. CI runs it in `shard-1`. The timings file is written from the test reports only (`shards.ts`, `summary.ts`, `ci-shards.ts`).
- Unknown `--task` throws `unknown --task X; expected test or e2e` (`taskConfig`); `run` throws when `SHARD_PACKAGES` is empty; an unknown subcommand prints usage and sets `process.exitCode = 2` (`ci-shards.ts`).
- Timings files over `MAX_TIMINGS_BYTES` (1,000,000) are ignored; report files over `MAX_REPORT_BYTES` (20,000,000) are skipped with a stderr warning (`ci-shards.ts`).
- `readPackage` throws when package.json lacks a string name or the name fails `VALID_PACKAGE_NAME`; `parseTimings` keeps only finite non-negative numbers (`shards.ts`).
- Shard count is `max(ceil(total / targetMs), minShards, 1)`, raised to `bootstrapShards` without timings, capped by `maxShards` and the number of entries the packages can make; packages are bin-packed heaviest first (`planShards`).
- `plannedPackages` excludes `PACKAGES_WITH_DEDICATED_JOBS`; `e2ePackages` keeps packages with a `test:e2e` script.
- `VITEST_MAX_FORKS` becomes `maxWorkers` only when it is an integer >= 1 (`forkCap`, `reporters.ts`).
- Report discovery skips `node_modules`, `dist`, `.turbo`, `.git`, `test`, `src` (`SKIPPED_DIRS`); a file that failed without failed assertions becomes a synthetic failed case (`crashedWithoutAssertions`); failure messages are cut at `MAX_FAILURE_CHARS` (8,000) with ANSI stripped; Playwright reports are detected by an array `suites` and mapped through `PLAYWRIGHT_STATUS` (`summary.ts`).

## Side Effects

- Reads `GITHUB_ACTIONS` and `VITEST_MAX_FORKS`; on CI the json reporter writes `test-results.json` and coverage goes to `coverage/` (`reporters.ts`).
- `temp-dir.ts` creates its `conciv-test-*` folder and registers its `afterAll` on import.
- `plan` appends `matrix=<json>` to `$GITHUB_OUTPUT` and prints it; `run` spawns `pnpm exec turbo run <tasks> --filter=<pkg>...` with `execFileSync` and inherited stdio; `report` writes `--output` (default `shard-report.json`); `summarize` appends to `$GITHUB_STEP_SUMMARY` (or stdout) and writes measured timings to `--timings` and merged lcov files to `--coverage-output` (`ci-shards.ts`).
- `summary.ts` walks directories, reads `test-results.json` and package.json files, and caches owner lookups in the module-level `packageByDir` map; `discoverPackages` reads workspace package.json files (`shards.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@internal/vitest-config` from the repo root (turbo builds the package and its dependencies first)
