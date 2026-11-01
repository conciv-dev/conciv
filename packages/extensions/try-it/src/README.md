# try-it/src

## Overview

`client.tsx` defines the `try-it` extension through `defineExtension` from `@conciv/extension`. Its `connectGate.preflight` probes the connect ports for a core holding the given token, and its component renders the connect pane only when the active slot is `connect`. The work is split into `client/` (Solid UI and probe hooks) and `shared/` (probe and step helpers).

## Interface

- `tryIt(config: {token})` (`client.tsx`): returns the `try-it` extension client definition; also the default export
- `connectGate.preflight` (`client.tsx`): calls `preflight(config.token, 2500, connectPorts())`
- Subdirectories:
  - [shared](./shared/README.md): Core health probe over the connect ports and the pure step-state function for the connect pane.
  - [client](./client/README.md): Solid connect pane plus the core-probe state machine and the Local Network Access permission hook.

## Invariants

- `Component` (`client.tsx`) renders `ConnectSlot` only when `useSlot() === 'connect'`
- Preflight timeout is fixed at 2500 ms (`client.tsx`)

## Side Effects

- `preflight` (`client.tsx` via `shared/probe.ts`) sends `GET http://127.0.0.1:<port>/t/<token>/health` to every port from `connectPorts()`

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-try-it` from the repo root (turbo builds the package and its dependencies first)
