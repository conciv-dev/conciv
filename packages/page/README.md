# @conciv/page

## Overview

Package root for `@conciv/page`, inlined by `@conciv/embed`. Builds `src/index.ts` with tsdown.

## Interface

- `package.json:exports["."]` - `dist/index.js` with types in `dist/index.d.ts`.
- `tsdown.config.ts:external` - `@conciv/*`, `react-grab`, `bippy` and `solid-js` stay external.
- Source: [src](./src/README.md).

## Invariants

- None

## Side Effects

- None

## Verification

- Run: `cd packages/page && pnpm test`
