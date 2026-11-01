# test-runner/src/runners/playwright

## Overview

adapter.ts converts RunArgs into child argv (`--mode`, `--cwd`, `--pattern`, `--name`). The child does not stream events live. It waits for the whole `playwright test` run, then emits all events from the finished report. report.ts walks nested suites recursively and reads the first result of each spec's first test.

## Interface

- `playwright` (`adapter.ts`): child adapter, id `playwright`, capabilities {watch:false, uiServer:false, filterByName:true, failedOnly:false}. `buildListArgs` ignores failedOnly.
- `runChild()` (`run-child.ts`): child entry logic for `--mode run|list` and `--cwd`
- `parsePlaywrightReport(raw)` (`report.ts`): converts a Playwright JSON report into `TestRow[]`
- `child.ts`: entry point that calls `runChild()`

## Invariants

- `resolveCli` (`run-child.ts`) resolves `playwright/cli` and then `@playwright/test/cli` from the app's cwd, and otherwise throws 'playwright not found in the app (install @playwright/test)'
- `runTests`/`runList` (`run-child.ts`) throw `describeMissingReport` when stdout does not start with '{'. The message includes the exit code, the signal and the last 500 characters of stderr and stdout (`OUTPUT_TAIL_LENGTH`).
- `runChild` (`run-child.ts`) catches any error, sends `{type:'error', reason}` and exits with code 1; success exits with code 0
- Name filtering is passed to the CLI as `-g <name>` (`run-child.ts`)
- runId is always the fixed string `pw1`, and no `file-end` events are sent (`run-child.ts`)
- `toState` (`report.ts`): status `passed` becomes pass, `skipped` becomes skip, and any other status, including a missing result, becomes fail
- `parsePlaywrightReport` (`report.ts`) returns [] for invalid JSON or a schema mismatch. A spec without an `id` gets the id `${file}#${position}`.
- `runList` (`run-child.ts`) runs `test --list` and builds absolute paths with `join(cwd, f)`

## Side Effects

- `runCli` (`run-child.ts`) spawns `node <playwright cli> test ... --reporter=json` in the app's cwd with the full `process.env`. That process launches real browsers.
- `send` (`run-child.ts`) calls `writeSync` on fd 3
- `runChild` (`run-child.ts`) calls `process.exit`

## Verification

- Run: `cd packages/extensions/test-runner && pnpm test`
