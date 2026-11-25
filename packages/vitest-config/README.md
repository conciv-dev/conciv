# @conciv/vitest-config

## Overview

Private workspace package (`private: true`) holding the one set of shared vitest settings: `concivTest()`, the test projects every package runs, the isolated home of a run, the CI reporters and the test layout reader the lint rules use. It ships TypeScript source directly; there is no build step.

## Interface

- [src/README.md](./src/README.md): `concivTest`, `ciReporters`, `readTestKind`, `tempDir`, `isolatedEnv`.

## Invariants

- `private: true`: never published (`package.json`).
- Exports point at `.ts` source, so consumers need a Node version that runs TypeScript directly (`tsconfig.json` `allowImportingTsExtensions`).

## Side Effects

- None at import; the globalSetup `concivTest()` carries replaces the run's env with an isolated home (see [src/README.md](./src/README.md#side-effects)).
