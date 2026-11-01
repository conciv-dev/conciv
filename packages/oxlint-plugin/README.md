# @conciv/oxlint-plugin

## Overview

Private, repo-local oxlint JS plugin (`@conciv/oxlint-plugin`) holding the conciv lint rules. The package exports `./src/plugin.js` and is wired into `.oxlintrc.json` through `jsPlugins`. Tests run oxlint against configs in `test/*.json` and the fixture files under `test/fixtures/`.

## Interface

- `package.json:exports["."]` - `./src/plugin.js` (plain JS, no build step).
- `package.json:scripts` - `test` (`vitest run`), `typecheck` (`tsc -p tsconfig.json --noEmit`, covers `test/**/*.ts` only), `lint` (`oxlint src test/*.ts`).
- Subdirectory: [src](./src/README.md) - the twelve rules and `plugin.js`.
- Test fixtures (lint inputs only) live under `test/fixtures/`: core-purity, lucide-per-icon, packages, signal-ref, solid-test-render, src, test-file-budget, vocabulary, waits.

## Invariants

- `package.json:private` is `true`; the plugin is consumed in-repo by path, not published.
- `vitest.config.ts` excludes `fixtures/**` and `test/fixtures/**` from test discovery, and `tsconfig.json` excludes `test/fixtures/**`, so fixture files are lint inputs only.
- Each rule fixture set is paired with a single-rule config in `test/oxlintrc-*.json` that loads `../src/plugin.js` under the plugin name `conciv`.

## Side Effects

- None

## Verification

- Run: `cd packages/oxlint-plugin && pnpm test`
