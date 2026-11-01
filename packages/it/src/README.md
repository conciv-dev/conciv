# it/src

## Overview

Builds the single conciv unplugin instance that the bundler entries share, with the built-in server extensions and their client entries.

## Interface

- `plugin-instance.ts:unplugin` - `createConcivUnplugin` with `serverExtensions` terminal, test-runner, whiteboard, recorder, ios and design; their `/client` entries; `embedEntry`; `nativePageDir`; `dedupeEntry`.
- Subdirectories: [plugin](./plugin/README.md).

## Invariants

- None

## Side Effects

- `plugin-instance.ts` - resolves package paths with `import.meta.resolve` at module load.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/it` from the repo root (turbo builds the package and its dependencies first)
