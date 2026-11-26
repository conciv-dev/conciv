# @conciv/try

## Overview

CLI behind `npx @conciv/try --token <token>`. It boots a token-gated conciv engine on loopback, powered by the user's local coding agent, and paired with conciv.dev.

## Interface

- `bin["conciv-try"]` -> `./dist/bin.js`; `exports["."]` -> `dist/connect.js` (`package.json`). Source: [src/README.md](./src/README.md).

## Invariants

- The `build` script marks `dist/bin.js` executable (`package.json`).

## Side Effects

- `build` writes `dist/`. Runtime effects (network fetch, temp workspace, local HTTP server, SIGINT handler) are listed in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/try` from the repo root (turbo builds the package and its dependencies first)
