# embed/src

## Overview

Mounts the conciv widget into a shadow root on the host page and starts the page plane. `createConciv` is the handle API used by the React wrapper and the plugin loader; `native-entry.ts` is the iOS native-page entry.

## Interface

- `mount.ts:createConciv` - returns a `ConcivHandle` with `mount(el)`, `unmount()`, `open()`, `close()`, `toggle()`, `rebind(apiBase)`.
- `mount.ts:ConcivInit` - `extensions`, `settings`, `apiBase`, `grabProvider`; `ExtensionsInput` is an array or a `() => Promise<AnyExtension[]>` loader.
- `mount.ts:mountConciv` - appends a `[data-conciv-script-root]` div to `document.body` and mounts the widget with the given extensions.
- `mount-impl.tsx:mountImpl` - creates the `[data-conciv-root]` element and shadow root, boots the app, returns `{ready, teardown, rebind}`.
- `navigation-storage.ts:makeNavigationStorage` - a `WebStorage` backed by `rpc.navigation.get`/`set`, with `restored` and `dispose`.
- `native-entry.ts` - mounts the widget with the iOS client extension on `[data-conciv-native-root]` (or `document.body`) and sets `window.__concivRebind`.

## Invariants

- `mount.ts:createConciv.mount` - does nothing without a `document` or when the state is not `unmounted`; a failed mount resets to `unmounted` and rethrows.
- `mount.ts:createConciv.rebind` - does nothing unless the state is `mounted`.
- `mount.ts:mountConciv` - does nothing inside a `data-conciv-capture` frame or when a `[data-conciv-script-root]` already exists; removes its element if the mount fails.
- `navigation-storage.ts:makeNavigationStorage` - the server value is not restored after a local write or after `dispose`; writes are debounced by 300 ms (`WRITE_DELAY_MS`) and stamped with a strictly increasing `updatedAt`.
- `native-entry.ts:readLauncher` - the launcher is `mascot` only when the `launcher` query parameter says so, otherwise `native`.

## Side Effects

- `mount-impl.tsx:mountImpl` - sets `window.__CONCIV_REACT_BRIDGE__`, `window.__CONCIV_PAGE_DRIVER__` and `window.__TSR_ROUTER__`, and restores or clears them on teardown.
- `mount-impl.tsx:mountImpl` - listens for the `conciv:rebind` window event.
- `mount-impl.tsx:makeDisconnect` - `POST <apiBase>/api/shutdown`, then reloads the page after 150 ms.
- `mount-impl.tsx:metaContent` - reads the `conciv-widget` meta tag when no `settings` are passed.
- `mount.ts:panelCommands` - opens an event-bus client (`PANEL_PLUGIN_ID`, reconnect every 500 ms, 60 retries) for `open`/`close`/`toggle`.
- `navigation-storage.ts:makeNavigationStorage` - calls `rpc.navigation.get` once and `rpc.navigation.set` on debounced writes.

## Verification

- Run: `cd packages/embed && pnpm test` (builds `vite.handle.config.ts`, then runs vitest and Playwright)
