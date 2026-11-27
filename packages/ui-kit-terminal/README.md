# @conciv/ui-kit-terminal

## Overview

Package internal to @conciv/it that provides Solid terminal components on xterm.js, built by tsdown into dist with declarations.

## Interface

- `exports['.']` (`package.json`): ./dist/ui-kit-terminal.js
- `scripts` (`package.json`): build (`tsdown`), typecheck, publint, attw; no `test` script
- `tsdown.config.ts`: entry src/ui-kit-terminal.tsx, with `unplugin-solid/rolldown`
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - terminal model and components

## Invariants

- `tsdown.config.ts`: its dependencies (@conciv/\*, @tanstack/pacer, @xterm/\*) and the solid-js peer are external (tsdown's default). The xterm CSS (`.css?inline`) is inlined as a string at build by `inlineImports()` (`@internal/build-plugins`)
- `peerDependencies` (`package.json`): solid-js

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Typecheck and lint: `cd packages/ui-kit-terminal && pnpm typecheck`, then `pnpm lint` at the repo root
