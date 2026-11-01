# react/src

## Overview

The `ConcivWidget` React component, which mounts the conciv widget from `@conciv/embed` into an anchor `<div>`.

## Interface

- `index.ts:ConcivWidget` - renders a `<div>` and calls `createConciv({apiBase, settings, extensions}).mount(host)` on it.
- `index.ts:ConcivWidgetProps` - alias of `ConcivInit`; also re-exports the `ConcivInit`, `ConcivSettingsInit` and `ExtensionsInput` types from `@conciv/embed`.

## Invariants

- `index.ts:ConcivWidget` - remounts when `extensions` changes identity or when `apiBase`/`settings` change by value (`JSON.stringify` key).
- `index.ts:ConcivWidget` - the effect cleanup calls `handle.unmount()`.

## Side Effects

- `index.ts:ConcivWidget` - mounts the widget DOM inside the anchor element; a failed mount is logged with `console.error`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/react` from the repo root (turbo builds the package and its dependencies first) (builds the fixture with `vite.fixture.config.ts`, then runs vitest)
