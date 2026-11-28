# @conciv/errors

## Overview

The error catalogs conciv throws from: one place for every core error code, message, why and fix.

## Invariants

- `tsdown` emits the JavaScript and the declarations (`tsdown.config.ts`).

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Typecheck and lint: run the `typecheck` script in `packages/errors`, then `pnpm lint` at the repo root.
- Tests: the `test` script (`vitest run`) runs `test/unit` through a plain `vitest.config.ts` with no `concivTest()`.
  The package depends on evlog alone: `@internal/vitest-config` throws from this package, and a dev dependency on it
  would close a loop.
