# @conciv/chat

The conciv chat plane: turns, hydrate, transcript import, stop, compaction, boot recovery, the permission gate and the chat stores over `@conciv/db`'s tables, built on `@conciv/ai`.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- `package.json:exports["."]` - `dist/index.js` with types in `dist/index.d.ts`.
- Source: [src](./src/README.md).

## Invariants

- `package.json:type` - ESM only; the `attw` script checks the `esm-only` profile.

## Side Effects

- None

## Verification

- Run: `cd packages/chat && pnpm typecheck` (the package has no `test` script)
