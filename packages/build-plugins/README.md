# @internal/build-plugins

## Overview

The rolldown plugin the plugins' tsdown builds share: the plugin UnoCSS sheet.

## Invariants

- Private to conciv and never published: its exports point at `src`, nothing builds it, and the packages that use it
  inline it into their own builds.

- `inlineSheet(packageUrl)` answers `virtual:uno.css?inline` with the utilities-only sheet
  (`presetConciv({sheet: 'plugin'})`) over the package's `src/**/*.{ts,tsx}`, tests, specs and stories left out.

## Side Effects

- None: it reads the package's source files when the sheet is loaded.

## Verification

- Typecheck and lint: run the `typecheck` script in `packages/build-plugins`, then `pnpm lint` at the repo root.
- No tests of its own: the plugin packages' builds and their e2e files exercise it.
