# @conciv/ui-kit-terminal

## Overview

Package internal to @conciv/it that provides Solid terminal components on xterm.js, built by Vite into dist with tsc declarations.

## Interface

- `exports['.']` (`package.json`): ./dist/ui-kit-terminal.js
- `scripts` (`package.json`): build (`vite build`), typecheck, publint, attw; no `test` script
- `vite.config.ts`: `libConfig` from `@internal/vite-config` with entry src/ui-kit-terminal.tsx
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - terminal model and components

## Invariants

- `vite.config.ts`: @conciv/\*, solid-js and @xterm/\* are external, except the xterm CSS which is bundled
- `peerDependencies` (`package.json`): solid-js

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Typecheck and lint: `cd packages/ui-kit-terminal && pnpm typecheck`, then `pnpm lint` at the repo root
