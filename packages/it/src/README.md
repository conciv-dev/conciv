# it/src

## Overview

Builds the single conciv unplugin instance that the bundler entries in [plugin/](./plugin/README.md) share: `plugin-instance.ts` calls `createConcivUnplugin` with `embedEntry` (the resolved `@conciv/app`) and `widgetPageDir` (its folder).

## Invariants

- None

## Side Effects

- `plugin-instance.ts` - resolves package paths with `import.meta.resolve` at module load.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/it` from the repo root (turbo builds the package and its dependencies first)
