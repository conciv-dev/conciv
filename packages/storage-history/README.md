# @conciv/storage-history

## Overview

Package internal to @conciv/it that provides a @tanstack/history RouterHistory whose entries and index persist in Web Storage. Built with tsdown as ESM with type declarations.

## Interface

- `exports['.']` (`package.json`): ./dist/index.js with ./dist/index.d.ts
- `dependencies` (`package.json`): @tanstack/history
- `scripts` (`package.json`): build (tsdown), typecheck, lint, test, publint, attw --profile esm-only
- `tsdown.config.ts`: entry src/index.ts, esm, dts true
- `vitest.config.ts`: ciTest(), node environment, test/**/*.test.ts
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - `createWebStorageHistory`

## Invariants

- `description` (`package.json`): not installed directly; it arrives through @conciv/it

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Run: `cd packages/storage-history && pnpm test`
- Typecheck and lint: `cd packages/storage-history && pnpm typecheck && pnpm lint`
