# @conciv/storage-history

## Overview

A @tanstack/history RouterHistory whose entries and index persist in Web Storage, so the widget's router survives a page reload. Installed through @conciv/it, not directly. Source: [src](./src/README.md).

## Invariants

- tsdown emits the JavaScript (`dts: false`); `tsc -p tsconfig.build.json` emits the declarations.

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/storage-history` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/storage-history && pnpm typecheck`, then `pnpm lint` at the repo root
