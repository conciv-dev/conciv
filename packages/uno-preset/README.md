# @conciv/uno-preset

## Overview

Private shared UnoCSS preset reused by other packages' uno.config files, built with tsc into dist. The package.json description still says presetMini; the code uses presetWind4.

## Interface

- `exports['.']` (`package.json`): ./dist/index.js; private; peer unocss
- `build` script (`package.json`): `tsc -p tsconfig.build.json`
- `vitest.config.ts`: node environment with `ciTest()`
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - `presetConciv` and its tokens and rules

## Invariants

- `tsconfig.build.json`: rootDir src, outDir dist

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Run: `cd packages/uno-preset && pnpm test`
- Typecheck and lint: `cd packages/uno-preset && pnpm typecheck && pnpm lint`
