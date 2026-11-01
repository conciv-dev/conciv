# @conciv/serve

## Overview

Package root for `@conciv/serve`, internal to `@conciv/it`. Builds `src/serve.ts` with tsdown.

## Interface

- `package.json:exports["."]` - `dist/serve.js` with types in `dist/serve.d.ts`.
- `tsdown.config.ts:entry` - `src/serve.ts`, ESM, with type declarations.
- Source: [src](./src/README.md).

## Invariants

- None

## Side Effects

- None

## Verification

- Run: `cd packages/serve && pnpm test`
