# test-runner/src/runners

## Overview

Every adapter is registered in runner/registry.ts. jest and node-test call `defineStubRunner`, so `create()` always throws. The vitest and playwright adapters call `defineChildRunner` with a child script and argv builders.

## Interface

- `jest` (`jest.ts`): stub adapter, id `jest`, capabilities {watch:false, uiServer:false, filterByName:true, failedOnly:true}
- `nodeTest` (`node-test.ts`): stub adapter, id `node-test`, capabilities {watch:false, uiServer:false, filterByName:true, failedOnly:false}
- Subdirectories:
  - [vitest](./vitest/README.md): Vitest adapter. Its child process loads the app's own `vitest/node` and drives it programmatically with a custom reporter, which streams run-start, test, file-end and run-end events live on fd 3.
  - [playwright](./playwright/README.md): Playwright adapter. Its child process resolves the app's Playwright CLI, runs it with `--reporter=json`, parses the JSON report into TestRows, and sends run-start, test and run-end (or list) messages on fd 3.

## Invariants

- `jest.create()` throws 'jest runner not implemented' (`jest.ts`)
- `nodeTest.create()` throws 'node-test runner not implemented' (`node-test.ts`)

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-test-runner` from the repo root (turbo builds the package and its dependencies first)
