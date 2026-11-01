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

- The package root (configs and manifest) has none. At runtime `serveHono` binds a TCP port and creates a `ws` server; `closeServer` closes live sockets. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/serve` from the repo root (turbo builds the package and its dependencies first)
