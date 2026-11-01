# @conciv/vitest-config

## Overview

Private workspace package (`private: true`) holding shared vitest CI settings, a Solid testing-library cleanup setup file, a Solid library vite config, and two CI command-line tools. It ships TypeScript source directly; there is no build step.

## Interface

- [src/README.md](./src/README.md): `ciTest`, `ciReporters`, `ciTestSolidBrowser`, `solidLibConfig`, shard planning and report summaries.
- `bin["conciv-ci-shards"]` -> `./src/ci-shards.ts`; `bin["conciv-ci-summary"]` -> `./src/ci-summary.ts` (`package.json`).
- Exports: `.` -> `./src/reporters.ts`, `./solid-cleanup` -> `./src/solid-cleanup-setup.ts`, `./vite-lib` -> `./src/vite-lib.ts`. `summary.ts` and `shards.ts` are not exported.
- Optional peers: `@solidjs/testing-library` ^0.8.10, `vite` ^8.0.16, `vite-plugin-solid` ^2.11.12.
- Scripts: `typecheck`, `lint` (`oxlint`), `test` (`vitest run`); the package's own tests use `ciTest()`.

## Invariants

- `private: true`: never published (`package.json`).
- Bins and exports point at `.ts` source, so consumers need a Node version that runs TypeScript directly (`tsconfig.json` `allowImportingTsExtensions`).

## Side Effects

- None at import of the package root beyond env reads in `ciTest()`; CLI effects (GitHub output files, turbo runs) are in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/vitest-config` from the repo root (turbo builds the package and its dependencies first)
