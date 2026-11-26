# @internal/uno-preset

## Overview

Private shared UnoCSS preset reused by other packages' `uno.config.ts` files, built with tsc into `dist`. The repo's lint task builds it first, since the `unocss/order` rule loads each folder's `uno.config.ts`, which imports this `dist`. Source: [src/README.md](./src/README.md).

## Invariants

- `exports['.']` (`package.json`): `types` from `./src/uno-preset.ts`, `import` from `./dist/uno-preset.js`; private; peer `unocss`.
- The `package.json` description still says presetMini; the code uses presetWind4 (`src/uno-preset.ts`).

## Side Effects

- `build` script (`tsc -p tsconfig.build.json`): writes `dist/`

## Verification

- Typecheck: `pnpm exec turbo run typecheck --filter=@internal/uno-preset` from the repo root (the package has no `test` script)
