# @conciv/oxlint-plugin

## Overview

Private, repo-local oxlint JS plugin (`@conciv/oxlint-plugin`) holding the conciv lint rules. The package exports `./src/plugin.js` and is wired into `.oxlintrc.json` through `jsPlugins`. Tests run oxlint against configs in `test/*.json` and the fixture files under `test/fixtures/`.

## Interface

- `package.json:exports["."]` - `./src/plugin.js` (plain JS, no build step).
- `package.json:scripts` - `test` (`vitest run`), `typecheck` (`tsc -p tsconfig.json --noEmit`, covers `test/*.ts`), `lint` (`oxlint src test/*.ts`).
- Subdirectory: [src](./src/README.md) - the twelve rules and `plugin.js`.
- Test fixtures (lint inputs only) live under `test/fixtures/`: core-purity, lucide-per-icon, packages, signal-ref, solid-test-render, solid-test-render-outside, src, test-file-budget, vocabulary, waits.

## Invariants

- `package.json:private` is `true`; the plugin is consumed in-repo by path, not published.
- Fixture files carry a `.txt` suffix, so neither tsc nor vitest picks them up. `test/run-lint.ts` copies them into a temp workspace without the suffix and runs oxlint there; `test/fixtures/solid-test-render-outside` lands at `fixtures/solid-test-render-outside`, outside any test directory.
- Each rule fixture set is paired with a single-rule config in `test/oxlintrc-*.json` that loads `../src/plugin.js` under the plugin name `conciv`.

## Side Effects

- The package root (configs and manifest) has none. At runtime rules resolve `lucide-solid` icon modules from disk and cache per directory. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/oxlint-plugin` from the repo root (turbo builds the package and its dependencies first)
