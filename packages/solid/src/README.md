# solid/src

## Overview

Exports the `ConcivWidget` Solid component. It creates a detached div, creates and mounts a conciv embed handle into it, and remounts whenever apiBase, settings or extensions change. It re-exports the embed init types.

## Interface

- `ConcivWidget(props: ConcivWidgetProps): JSX.Element` (`index.ts`): a div holding the mounted widget, or null on the server
- `ConcivWidgetProps` type (`index.ts`): alias of ConcivInit
- Re-exported types `ConcivInit`, `ConcivSettingsInit`, `ExtensionsInput` (`index.ts`): from @conciv/embed

## Invariants

- `ConcivWidget` (`index.ts`): returns null when solid-js/web `isServer` is true
- `ConcivWidget` (`index.ts`): the createEffect tracks only apiBase, settings and extensions; a change unmounts the previous handle before `createConciv` runs again
- `ConcivWidget` (`index.ts`): mount() rejections are swallowed

## Side Effects

- `ConcivWidget` (`index.ts`): document.createElement('div') plus createConciv(init).mount(el), which mounts the embed widget into the DOM
- `ConcivWidget` (`index.ts`): onCleanup calls handle.unmount()

## Verification

- Run: `cd packages/solid && pnpm test`
- Typecheck and lint: `cd packages/solid && pnpm typecheck && pnpm lint`
