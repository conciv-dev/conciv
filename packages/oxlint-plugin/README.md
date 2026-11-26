# @internal/oxlint-plugin

## Overview

Private, repo-local oxlint JS plugin (`@internal/oxlint-plugin`) holding the conciv lint rules. The package exports `./src/plugin.js` (plain JS, no build step) and is wired into `.oxlintrc.json` through `jsPlugins`. The rules: [src](./src/README.md).

## Invariants

- `package.json:private` is `true`; the plugin is consumed in-repo by path, not published.

## Side Effects

- The package root (configs and manifest) has none. At runtime rules resolve `lucide-solid` icon modules from disk and cache per directory. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@internal/oxlint-plugin` from the repo root (turbo builds the package and its dependencies first)
