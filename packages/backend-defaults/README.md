# @conciv/chat

The conciv chat plane: turns, hydrate, transcript import, stop, compaction, boot recovery, the permission gate and the chat stores over the engine database tables (`src/db`), built on `@conciv/ai`.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- `package.json:exports["."]` - `dist/index.js` with types in `dist/index.d.ts`.
- Source: [src](./src/README.md).

## Invariants

- `package.json:type` - ESM only; the `attw` script checks the `esm-only` profile.

## Side Effects

- The package root (configs and manifest) has none. At runtime turns write the run and thread tables (`src/db`) and publish chat events to the session stream that core serves over oRPC. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/chat` from the repo root (turbo builds the package and its dependencies first); tests: `pnpm exec turbo run test --filter=@conciv/chat`
