# @conciv/bundle-size

## Overview

Private CI tool that measures the gzip size of published package dists and the apps/site Cloudflare worker, and compares them to a main-branch baseline. It has no build step: the bin runs the TypeScript source directly.

## Interface

- `bin.conciv-bundle-size` (`package.json`): maps to ./src/cli.ts; there is no exports field
- `scripts` (`package.json`): typecheck (tsc --noEmit), lint (oxlint), test (vitest run)
- `vitest.config.ts`: spreads `ciTest()` from @conciv/vitest-config
- `tsconfig.json`: noEmit, allowImportingTsExtensions, lib ES2024, types node
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - the measuring CLI and library

## Invariants

- `private: true` (`package.json`): never published
- `tsconfig.json`: typechecks only src/**/\*.ts and test/**/*.ts with noEmit, so the bin must run .ts directly

## Side Effects

- None at the package root; see the src contract

## Verification

- Run: `cd packages/bundle-size && pnpm test`
- Typecheck and lint: `cd packages/bundle-size && pnpm typecheck && pnpm lint`
