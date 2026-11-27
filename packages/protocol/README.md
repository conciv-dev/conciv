# @conciv/protocol

## Overview

The oRPC contract (procedures plus zod schemas) shared by the engine and its clients, the event and session schemas
(`src/schema`), the execute tool's schemas, and the simulation drive contract.
`package.json` describes it as internal to `@conciv/it`; it is published with `publishConfig.access: public`. ESM only.

## Interface

- [src/README.md](./src/README.md): what each source file holds.
- `exports` (`package.json`): `.` (`src/protocol.ts`), one subpath per `src/schema/*` file, `./execute-schemas`,
  `./options` and `./simulation`, built by `vite build` (`vite.config.ts`).

## Invariants

- ESM only: `"type": "module"`, ESM output, attw `--profile esm-only` (`package.json`, `vite.config.ts`).
- The contract holds no transport: the browser's connection and the node rpc client live in `@conciv/client`.

## Side Effects

- `build` writes `dist/` (`vite.config.ts`).

## Verification

- `pnpm typecheck` in the package, and `pnpm lint` at the repo root
