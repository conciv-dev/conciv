# test-runner/src/runners/vitest

## Overview

adapter.ts converts RunArgs into child argv (`--mode`, `--cwd`, `--pattern`, `--name`, `--failed`). run-child.ts resolves vitest from the app cwd, calls `createVitest('test', {watch:true, run:false, root, dir, reporters:[reporter]})` and then `standalone()`. In run mode it filters specs by pattern and by name and runs them; in list mode it globs the specs.

## Interface

- `vitest` (`adapter.ts`): child adapter, id `vitest`, capabilities {watch:false, uiServer:false, filterByName:true, failedOnly:true}
- `runChild()` (`run-child.ts`): child entry logic
- `child.ts`: entry point that calls `runChild()`

## Invariants

- `loadVitest` (`run-child.ts`) throws 'vitest/node did not expose createVitest' when the module export fails `VitestNodeModuleSchema`
- `runTests` (`run-child.ts`) sets the global test name pattern from `--name` and resets it after the run. It passes `allTestsRun = patterns.length === 0`.
- `runTests` ignores `--failed` even though the adapter sends it and declares the `failedOnly:true` capability (`run-child.ts`)
- `runList` (`run-child.ts`) applies `.filter(() => !failedOnly)`, so `list` with failedOnly returns an empty file list instead of only the failed files
- `toState` (`run-child.ts`) maps `passed` to pass and `failed` to fail; everything else becomes skip
- The runId is `r<n>`, where n is a per-process counter incremented in `onTestRunStart` (`run-child.ts`)
- On any error, `runChild` (`run-child.ts`) sends `{type:'error', reason}` and exits with code 1

## Side Effects

- `loadVitest` (`run-child.ts`) dynamically imports the app's `vitest/node`, resolved with `createRequire(join(cwd,'noop.js'))`, and runs the app's test suite
- `send` (`run-child.ts`) calls `writeSync` on fd 3
- `runChild` (`run-child.ts`) calls `process.exit`

## Verification

- Run: `cd packages/extensions/test-runner && pnpm test`
