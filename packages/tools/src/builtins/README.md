# tools/src/builtins

## Overview

`OpenInput` for the `open` card. The dev-server tools and `open` come from the engine's server plugin (`packages/plugin-host/src/core/tool/plugin/server.ts`).

## Interface

- `OpenInput` (`open-input.ts`): `{file: string (min 1), line?: coerced int >= 1, column?: coerced int >= 1}`; a column without a line is dropped; the `open` card parses a call's input with it.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/tools` from the repo root (turbo builds the package and its dependencies first)
