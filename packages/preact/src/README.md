# preact/src

## Overview

Single entry `preact.ts`: a Preact component that renders an anchor `<div>` and mounts a `createConciv` handle from `@conciv/app` on it, unmounting on cleanup. It re-exports the `ConcivInit` and `ConcivSettingsInit` types.

## Invariants

- Mounting waits until the ref host exists (`if (!host) return`).
- `apiBase` and `settings` are compared by `JSON.stringify({apiBase, settings})` (`configKey`); `plugins`, `grabProvider` and `engineToken` are compared by reference; the stored `config` changes only when the key or one of those references changes.
- The effect cleanup calls `handle.unmount()` before a remount and on unmount.

## Side Effects

- `handle.mount(host)` mounts the widget into the rendered div (`preact.ts`).
- Logs `console.error('conciv widget failed to mount', error)` when the mount promise rejects.

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/preact` from the repo root (the package has no tests yet)
