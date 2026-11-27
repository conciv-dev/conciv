# react/src

## Overview

The `ConcivWidget` React component (`react.ts`), which mounts the conciv widget from `@conciv/app` into an anchor `<div>`. It re-exports the `ConcivInit` and `ConcivSettingsInit` types.

## Invariants

- `react.ts:ConcivWidget` - remounts when `apiBase`/`settings` change by value (`JSON.stringify` key) or `plugins`/`grabProvider`/`engineToken` change by reference.
- `react.ts:ConcivWidget` - the effect cleanup calls `handle.unmount()`.

## Side Effects

- `react.ts:ConcivWidget` - mounts the widget DOM inside the anchor element; a failed mount is logged by the widget's own logger, and the rejection is dropped.

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/react` from the repo root (the package has no tests yet)
