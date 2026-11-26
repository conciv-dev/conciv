# @conciv/types

Wire types shared by the engine, the widget, the CLI and the plugins.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Overview

Package root for the wire types package. It builds one ESM entry point per subpath from src with tsdown, and tsc emits the declarations.

## Interface

- `exports` (`package.json`): one subpath per src module, no root entry
- `dependencies` (`package.json`): @tanstack/ai, effect and zod
- `scripts` (`package.json`): build (`tsdown && tsc -p tsconfig.build.json`), typecheck, publint, attw
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - schemas, types and wire constants

## Invariants

- `entry` (`tsdown.config.ts`): every package.json export needs a matching tsdown entry, since tsdown emits .js and tsc emits .d.ts (dts: false)

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Typecheck and lint: `cd packages/types && pnpm typecheck`, then `pnpm lint` at the repo root
