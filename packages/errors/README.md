# @conciv/errors

## Overview

The error catalogs conciv throws from: one place for every core error code, message, why and fix.

## Invariants

- tsdown emits the JavaScript (`dts: false`); `tsc -p tsconfig.build.json` emits the declarations.

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Typecheck and lint: run the `typecheck` script in `packages/errors`, then `pnpm lint` at the repo root.
- Tests: none yet. The package depends on evlog alone, so it has no `vite.config.ts`: `@internal/vitest-config`
  throws from this package, and a dev dependency on it would close a loop.
