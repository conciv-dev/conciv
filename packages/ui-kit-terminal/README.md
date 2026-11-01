# @conciv/ui-kit-terminal

## Overview

Package internal to @conciv/it that provides Solid terminal components on xterm.js, built by Vite into dist with tsc declarations.

## Interface

- `exports['.']` (`package.json`): ./dist/index.js
- `scripts` (`package.json`): build (`vite build && tsc -p tsconfig.build.json`), typecheck, lint, test, publint, attw
- `vite.config.ts`: `solidLibConfig` with entry src/index.tsx
- `vitest.config.ts`: Playwright Chromium browser project over test/**/*.test.tsx with a control-server global setup
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - terminal model and components

## Invariants

- `vite.config.ts`: @conciv/_, solid-js, zod and @xterm/_ are external, except the xterm CSS which is bundled
- `peerDependencies` (`package.json`): solid-js

## Side Effects

- `vitest.config.ts`: reads VITEST_MAX_WORKERS (default 3); tests start a control server and Chromium
- `build` script (`package.json`): writes dist/

## Verification

- Run: `cd packages/ui-kit-terminal && pnpm test`
- Typecheck and lint: `cd packages/ui-kit-terminal && pnpm typecheck && pnpm lint`
