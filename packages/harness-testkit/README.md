# @conciv/harness-testkit

## Overview

Package root for `@conciv/harness-testkit`. `package.json` exports the TypeScript sources directly; there is no build step.

## Interface

- `package.json:exports` - `.` (`src/testkit.ts`), `./until`, `./rpc-mounts`, `./rpc-websocket-client`.
- `vitest.config.ts` - `ciTest()` with the `node` environment.
- Source: [src](./src/README.md).

## Invariants

- None

## Side Effects

- The package root (configs and manifest) has none. At runtime `setup` creates a `conciv-kit-*` temp state root and boots an engine; `cleanup` removes it. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness-testkit` from the repo root (turbo builds the package and its dependencies first)
