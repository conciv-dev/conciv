# @internal/uno-preset

## Overview

Private shared UnoCSS preset reused by other packages' `uno.config.ts` files, built with tsc into `dist`. The lint's `unocss/order` rule reads the repo-root `uno.config.ts` (`.oxlintrc.json` `settings.unocss.configPath`), which loads this preset from its source, so the lint needs no build of it. Source: [src/README.md](./src/README.md).

## Invariants

- `exports['.']` (`package.json`): `types` from `./src/uno-preset.ts`, `import` from `./dist/uno-preset.js`; private; peer `unocss`.
- The `package.json` description still says presetMini; the code uses presetWind4 (`src/uno-preset.ts`).

## Side Effects

- `build` script (`vite build`, `vite.config.ts`): writes `dist/uno-preset.js`, which plain `node` scripts import (the
  source's `./x.js` specifiers do not resolve to `.ts` without a bundler)

## Verification

- Typecheck: `pnpm exec turbo run typecheck --filter=@internal/uno-preset` from the repo root (the package has no `test` script)
