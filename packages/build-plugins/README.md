# @internal/build-plugins

## Overview

Rolldown plugins the tsdown library builds share: the plugin UnoCSS sheet and the Vite-style inline imports.

## Invariants

- Private to conciv and never published: its exports point at `src`, nothing builds it, and the packages that use it
  inline it into their own builds.

- `inlineSheet(packageUrl)` answers `virtual:uno.css?inline` with the utilities-only sheet
  (`presetConciv({sheet: 'plugin'})`) over the package's `src/**/*.{ts,tsx}`, tests, specs and stories left out.
- `inlineImports()` answers the Vite-style inline imports a library build meets: `?worker&inline` becomes a module
  whose default export starts the worker from its bundled source (a blob URL, a data URL when that throws), `.css?inline`
  the file's text, any other `?inline` a base64 data URL. The ids are virtual (`\0conciv-inline:`), so the module lands
  under `dist/_virtual`, never `dist/node_modules`. A library also lists `/\?(?:worker&)?inline$/` in
  `deps.alwaysBundle`, or tsdown keeps a dependency's inline import external.

## Side Effects

- `inlineImports()` runs one extra Rolldown build per inline worker.

## Verification

- Typecheck and lint: run the `typecheck` script in `packages/build-plugins`, then `pnpm lint` at the repo root.
- No tests of its own: a clean build of ui-kit-chat, solid-diffs, ui-kit-terminal and the plugin packages, then the
  app and the Next.js e2e host build, exercise every branch.
