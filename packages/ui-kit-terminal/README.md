# @conciv/ui-kit-terminal

## Overview

Package internal to @conciv/it that provides Solid terminal components on xterm.js, built by tsdown into dist with declarations.

## Interface

- `exports['.']` (`package.json`): ./dist/ui-kit-terminal.js
- `scripts` (`package.json`): build (`tsdown && vite build`), typecheck, publint, attw; no `test` script
- `vite.config.ts`: the library build of src/ui-kit-terminal.tsx with `vite-plugin-solid`; `tsdown.config.ts` writes only its declarations
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - terminal model and components

## Invariants

- `vite.config.ts`: its dependencies (@conciv/\*, @tanstack/pacer, @xterm/\*) and the solid-js peer are external (read from `package.json`; an import with a `?` query is bundled). The xterm CSS (`.css?inline`) is inlined as a string by Vite's `?inline` (`vite.config.ts`, the library build; `tsdown` writes only the declarations)
- `peerDependencies` (`package.json`): solid-js

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Typecheck and lint: `cd packages/ui-kit-terminal && pnpm typecheck`, then `pnpm lint` at the repo root
