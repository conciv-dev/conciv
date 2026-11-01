# terminal/src/shared

## Overview

`protocol.ts` defines the extension name constant and the open-request and state schemas. `server.ts` uses them to validate RPC inputs and outputs, and the client imports them for naming and RPC URLs.

## Interface

- `TERMINAL_NAME` (`protocol.ts`): the string 'terminal'
- `TerminalOpenRequestSchema` / `TerminalOpenRequest` (`protocol.ts`): optional `cols`, `rows`, `model`
- `TerminalStateSchema` / `TerminalState` (`protocol.ts`): `{alive: boolean, busy: boolean}`

## Invariants

- `TerminalOpenRequestSchema` requires `cols` and `rows` to be integers from 2 to 500 and `model` to be 1-200 characters, all optional (`protocol.ts`)

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-terminal` from the repo root (turbo builds the package and its dependencies first)
