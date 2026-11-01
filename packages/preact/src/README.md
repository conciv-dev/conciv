# preact/src

## Overview

Single entry `index.ts`: a Preact component that renders an anchor `<div>` and mounts a `createConciv` handle from `@conciv/embed` on it, unmounting on cleanup.

## Interface

- `ConcivWidget(props: ConcivWidgetProps): JSX.Element` (`index.ts`): renders a `div` with `ref: setHost`, creates `createConciv({apiBase, settings, extensions})` and mounts it on the host.
- `ConcivWidgetProps` = `ConcivInit` (`index.ts`).
- Type re-exports `ConcivInit`, `ConcivSettingsInit`, `ExtensionsInput` from `@conciv/embed` (`index.ts`).

## Invariants

- Mounting waits until the ref host exists (`if (!host) return`).
- `apiBase` and `settings` are compared by `JSON.stringify({apiBase, settings})` (`configKey`); the stored `config` changes only when that key changes.
- `extensions` is compared by reference in the effect deps `[host, config, extensions]`; a new array remounts.
- The effect cleanup calls `handle.unmount()` before a remount and on unmount.

## Side Effects

- `handle.mount(host)` mounts the widget into the rendered div (`index.ts`).
- Logs `console.error('conciv widget failed to mount', error)` when the mount promise rejects.

## Verification

- Run: `cd packages/preact && pnpm test`
