# it/src

## Overview

Builds the single conciv unplugin instance that the bundler entries share.

## Interface

- `plugin-instance.ts:unplugin` - `createConcivUnplugin` with `embedEntry` (the resolved `@conciv/embed`) and `nativePageDir` (its folder).
- Subdirectories: [plugin](./plugin/README.md).

## Invariants

- None

## Side Effects

- `plugin-instance.ts` - resolves package paths with `import.meta.resolve` at module load.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/it` from the repo root (turbo builds the package and its dependencies first)
