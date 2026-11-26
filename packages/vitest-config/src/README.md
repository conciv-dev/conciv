# vitest-config/src

## Overview

The one set of vitest defaults every package uses, through `concivTest()` in its `vite.config.ts`, and the test layout reader.

## Interface

- `concivTest({environment?})` (`conciv-test.ts`, export `./conciv-test`): a vite plugin that, in vite's mode `test`, sets the defaults (reporters from `ciReporters()`, v8 coverage enabled on CI over `src` and `dist` with `test/**` excluded, test and hook timeout 30 s, `expect.poll` 5 s every 50 ms, `maxWorkers` from `VITEST_MAX_FORKS`, globalSetup `isolated-home.ts`) and, at the root (`test.name` unset), two projects: `unit` (`test/unit/**/*.unit.test.{ts,tsx,js}`, the package's `environment`, default `node`; `happy-dom` adds the Solid plugin) and `it` (node, `test/it/**/*.it.test.{ts,tsx,js}`). `browser: true` adds the `browser` and `perf` projects over `test/e2e`. Tests are collected only from those folders.
- `unit-setup.ts`: the `unit` project's setup file. When the file runs with a DOM (the happy-dom environment, or a node file with a first-line `// @vitest-environment happy-dom`) it loads the jest-dom matchers, sets Testing Library's poll timeout, runs its `cleanup` after each test and fails a test that leaves elements in `document.body`; in node it does nothing.
- `ciReporters()` (`reporters.ts`, export `.`): `['default']` locally; on CI adds `github-actions` (jobSummary off) and `json` -> `test-results.json`. `browserOptimizeDeps`, `TANSTACK_AI_SOLID_DEPS` are storybook's.
- `readTestKind(filename)`, `isDomTestFile`, `isNewLayerTestFile` (`test-layout.ts`, export `./test-layout`): the kind a test file's name and folder agree on (`test/unit/x.unit.test.ts` is `unit`, `test/it/x.it.test.ts` is `it`, `test/e2e/x.e2e.test.tsx` and `x.perf.e2e.test.tsx` are `e2e`), else `undefined`.
- `tempDir(prefix)` (`temp-dir.ts`, export `./temp-dir`): a folder inside one `conciv-test-*` folder per test file, removed once that file is done.
- `isolatedEnv(source, home, temporary)` (`isolated-env.ts`, export `./isolated-env`): the env with provider keys, secrets, `CONCIV_*` and agent shell variables removed and HOME, XDG and TMPDIR pointed at the given folders.

## Side Effects

- `isolated-home.ts` (globalSetup): makes a `conciv-test-home-*` folder under the OS temp dir, replaces `process.env` with `isolatedEnv` of it (keeping the Playwright browsers folder) and removes it when the run ends. A nested run (marked by `VITEST_ISOLATED_HOME`) keeps its parent's home.
- `temp-dir.ts` creates its folder and registers its `afterAll` on import.
