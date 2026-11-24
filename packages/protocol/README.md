# @conciv/protocol

Wire types shared by the conciv vite-plugin and widget.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Overview

Package root for the wire types package. It builds one ESM entry point per subpath from src with tsdown, and tsc emits the declarations.

## Interface

- `exports` (`package.json`): one subpath per src module, no root entry
- `dependencies` (`package.json`): @tanstack/ai and zod
- `scripts` (`package.json`): build (`tsdown && tsc -p tsconfig.build.json`), typecheck, lint, test, publint, attw
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - schemas, types and wire constants

## Invariants

- `entry` (`tsdown.config.ts`): every package.json export needs a matching tsdown entry, since tsdown emits .js and tsc emits .d.ts (dts: false)

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/protocol` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/protocol && pnpm typecheck`, then `pnpm lint` at the repo root
