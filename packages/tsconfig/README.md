# @conciv/tsconfig

## Overview

Private workspace package (`private: true`) holding the shared TypeScript presets every workspace package extends. It ships JSON only; there is no build step.

## Interface

- `tsconfig.base.json`: strict ES2024 settings for Node code without JSX; typecheck-only (`noEmit`, incremental into `.tsbuildinfo` beside the extending config).
- `tsconfig.web.json`: base plus the DOM libs, for browser code without JSX.
- `tsconfig.solid.json`: web plus Solid JSX (`jsx: preserve`, `jsxImportSource: solid-js`).
- `tsconfig.react.json`: web plus React JSX (`jsx: react-jsx`).
- `tsconfig.build.json`: declaration emit from `src` into `dist`, without stories, tests, fixtures and the dev-only `src/scripts`. A package's `tsconfig.build.json` is `{"extends": ["./tsconfig.json", "@conciv/tsconfig/tsconfig.build.json"]}`.

## Invariants

- Every path uses `${configDir}`, so it resolves against the package that extends the preset, not this directory.
- `tsconfig.base.json` owns the include every preset inherits: `src/**/*`, `test/**/*` and the package root's `*.ts`. A package's `tsconfig.json` is `extends` plus the `compilerOptions` it needs, with no `include` of its own.
- `tsconfig.build.json` extends nothing: listed after a package's `tsconfig.json`, it only switches emit on and must not reset that package's libs or JSX.

## Side Effects

- None.

## Verification

- Run: `pnpm exec turbo run typecheck --filter=<package>` for any package that extends a preset.
