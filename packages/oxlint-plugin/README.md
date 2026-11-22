# @conciv/oxlint-plugin

## Overview

Private, repo-local oxlint JS plugin (`@conciv/oxlint-plugin`) holding the conciv lint rules. The package exports `./src/plugin.js` and is wired into `.oxlintrc.json` through `jsPlugins`. `src/playwright-test-in-e2e.test.ts` runs oxlint over a temp workspace to check the `playwright-test-in-e2e` rule.

## Interface

- `package.json:exports["."]` - `./src/plugin.js` (plain JS, no build step).
- `package.json:scripts` - `test` (`vitest run`), `typecheck` (`tsc -p tsconfig.json --noEmit`), `lint` (`oxlint`). The test config is in `vite.config.ts`.
- Subdirectory: [src](./src/README.md) - the rule modules and `plugin.js`.

## Invariants

- `package.json:private` is `true`; the plugin is consumed in-repo by path, not published.
- The test writes its workspace under `tempDir` and loads `src/plugin.js` by absolute path in a single-rule config.

## Side Effects

- The package root (configs and manifest) has none. At runtime rules resolve `lucide-solid` icon modules from disk and cache per directory. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/oxlint-plugin` from the repo root (turbo builds the package and its dependencies first)
