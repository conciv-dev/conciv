# @conciv/try

## Overview

CLI behind `npx @conciv/try --token <token>`. It boots a token-gated conciv core on loopback, powered by the user's local coding agent, and paired with conciv.dev.

## Interface

- [src/README.md](./src/README.md): `runCli`, `runConnect`, workspace seeding and the connect system prompt.
- `bin["conciv-try"]` -> `./dist/bin.js`; `exports["."]` -> `dist/connect.js` (`package.json`).
- Dependencies: `@clack/prompts`, `citty`, `@conciv/core`, `@conciv/extension-terminal`, `@conciv/harness`, `@conciv/protocol`.
- Scripts: `build` (`tsdown && chmod +x dist/bin.js`), `typecheck`, `lint` (`oxlint`), `test` (`vitest run`), `publint`, `attw`.

## Invariants

- The `build` script marks `dist/bin.js` executable (`package.json`).

## Side Effects

- `build` writes `dist/`. Runtime effects (network fetch, temp workspace, local HTTP server, SIGINT handler) are listed in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `cd packages/try && pnpm test`
