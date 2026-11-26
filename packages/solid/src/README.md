# solid/src

## Overview

Exports the `ConcivWidget` Solid component (`solid.ts`). It creates a detached div, creates and mounts a `createConciv` handle from `@conciv/app` into it, and remounts whenever any `ConcivInit` field (apiBase, settings, plugins, grabProvider, engineToken) changes. It re-exports the `ConcivInit` and `ConcivSettingsInit` types.

## Invariants

- `ConcivWidget` (`solid.ts`): returns null when solid-js/web `isServer` is true
- `ConcivWidget` (`solid.ts`): the createEffect builds the init from every `ConcivInit` prop and tracks each; a change unmounts the previous handle before `createConciv` runs again
- `ConcivWidget` (`solid.ts`): mount() rejections are swallowed

## Side Effects

- `ConcivWidget` (`solid.ts`): document.createElement('div') plus createConciv(init).mount(el), which mounts the widget into the DOM
- `ConcivWidget` (`solid.ts`): onCleanup calls handle.unmount()

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/solid` from the repo root (the package has no tests yet)
