# vitest-config/src/setup

## Overview

The globalSetup the shared vitest config carries. `ciTest()` (`../reporters.ts`) lists `conciv-home-setup.ts` by absolute path, so every package that spreads `ciTest()` runs it without importing it.

## Interface

- `conciv-home-setup.ts` (the globalSetup `ciTest` carries, by absolute path): at the start of a run it empties and recreates `<project root>/test-results/conciv-home` and sets it as the main process `CONCIV_HOME`. Workers inherit the main process env when vitest spawns them, and browser commands run in the main process, so every engine a test starts without its own home writes there and never the real home. Folders a vitest config or browser command needs for the run go under it too: the harness config points its fixture harness homes at `test-results/conciv-home/harness-homes/*` and the core config points the fixture harness homes of its `node` project, the one that runs `core-api.it.test.ts`, at `test-results/conciv-home/harness-homes/node/*`, and the app's hub CLI browser command makes its root with `mkdtempSync` under `CONCIV_HOME`. The setup returns vitest's teardown, which removes the folder, harness homes included, when the run ends, passed or failed, and then removes `test-results` too when nothing else is left in it (a plain `rmdirSync`: Playwright's output folder, or anything else in it, keeps it and is never touched; a `test-results` that is gone or still holds something is left quietly, and an empty one that cannot be removed fails the teardown): vitest calls every project's teardowns from `close()` after the run has settled, projects and setup files in reverse order, so a config's own globalSetup listed after `...ciTest().globalSetup` tears down first while the home still exists. A run killed by a signal skips the teardown and leaves the folder inside the package (gitignored); the next run empties it at the start. Several projects of one package empty the same folder one after another before any worker of the run starts.

## Side Effects

- `conciv-home-setup.ts` empties and recreates `<project root>/test-results/conciv-home`, sets `process.env.CONCIV_HOME` and returns the teardown that removes the folder and then `test-results` when it is empty.

## Verification

- Run: `pnpm exec turbo run test --filter=@internal/vitest-config` from the repo root
