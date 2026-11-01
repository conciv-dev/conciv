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

- The package root (configs and manifest) has none. At runtime the page plane replaces `console.*`, installs window error listeners and answers engine page queries against the host DOM. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/page` from the repo root (turbo builds the package and its dependencies first)
