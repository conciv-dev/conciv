# @conciv/storage-history

## Overview

A @tanstack/history RouterHistory whose entries and index persist in Web Storage, so a router using it survives a page reload. Installed through @conciv/it, not directly. Source: [src](./src/README.md).

## Invariants

- tsdown emits the JavaScript (`dts: false`); `tsc -p tsconfig.build.json` emits the declarations.

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Typecheck and lint: `cd packages/storage-history && pnpm typecheck`, then `pnpm lint` at the repo root
