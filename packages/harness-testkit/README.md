# @conciv/harness-testkit

## Overview

Package root for `@conciv/harness-testkit`. `package.json` exports the TypeScript sources directly; there is no build step.

## Interface

- `package.json:exports` - `.` (`src/testkit.ts`), `./until`, `./rpc-mounts`, `./rpc-websocket-client`.
- `vitest.config.ts` - `ciTest()` with the `node` environment.
- Source: [src](./src/README.md).

## Invariants

- None

## Side Effects

- None

## Verification

- Run: `cd packages/harness-testkit && pnpm test`
