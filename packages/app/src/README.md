# embed/src

## Overview

Mounts the conciv widget into a shadow root on the host page. `createConciv` is the handle API used by the React wrapper and the plugin loader; `native-entry.ts` is the iOS native-page entry.

## Interface

- `mount.ts:createConciv` - returns a `ConcivHandle` with `mount(el)`, `unmount()`, `open()`, `close()`, `toggle()`, `rebind(apiBase)`.
- `mount.ts:ConcivInit` - `plugins`, `settings`, `apiBase`, `grabProvider`, `engineToken`, `connect` (the `EngineConnector` that opens the engine connection for an address; `makeBrowserEngineConnection` of `@conciv/client` when absent), `timings` (forwarded to the app's `Platform.timings` and to the connection).
- `mount-impl.tsx:mountImpl` - the app makes the one engine connection of the mounted widget (`createBrowserEngine` of the shell), hands it to the shell as `Platform.engine`, opens a new one when the shell asks through `Platform.connect` (a rebind, a picked server) and disposes the previous one and, at teardown, the last.
- `mount.ts:mountConciv` - appends a `[data-conciv-script-root]` div to `document.body` and mounts the widget with the given plugin entries.
- `mount-impl.tsx:mountImpl` - creates the `[data-conciv-root]` element and shadow root, builds a `Platform` from `ConcivInit` (the api base from `init`, else `window.__CONCIV_API_BASE__`, the `conciv-api-base` meta tag or a loopback or same-origin `?core=`; servers mode when there is none and plugins are given) and renders `ConcivApp` from `@conciv/app`.
- `native-entry.ts` - owns the scope of the `@conciv/plugin-ios` native service (`@conciv/plugin-ios/client` `makeNativeService`), composes its `setup` in as the `ios` plugin and hands its `grabProvider` to `createConciv`, mounts the widget on `[data-conciv-native-root]` (or `document.body`), and on a `pagehide` that is not kept in the back-forward cache unmounts the widget and closes the scope.

## Invariants

- `mount-impl.tsx` unmount - removes the shadow root's listeners and disposes the app render; the app closes its own rpc socket before its query cache is torn down.
- `mount.ts:createConciv.mount` - does nothing without a `document` or when the state is not `unmounted`; a failed mount resets to `unmounted` and rethrows.
- `mount.ts:createConciv.rebind` - does nothing unless the state is `mounted`.
- `mount.ts:mountConciv` - does nothing inside a `data-conciv-capture` frame or when a `[data-conciv-script-root]` already exists; removes its element if the mount fails.
- `native-entry.ts:readLauncher` - the launcher is `mascot` only when the `launcher` query parameter says so, otherwise `native`.

## Side Effects

- `mount-impl.tsx:mountImpl` - sets `window.__TSR_ROUTER__` and restores the host's value on teardown. It names no plugin: the page plugin installs its React bridge from its own `beforeRegister`.
- `mount-impl.tsx:mountImpl` - a handle rebind waits until the widget is interactive, then dispatches the `conciv:rebind` window event that the app handles; nothing after teardown or in servers mode.
- `mount-impl.tsx:createShadowRoot` - attaches the open shadow root; while a selection starts inside the widget it sets a selection attribute on `document.documentElement` (styled by one `style[data-conciv-selection]` in `document.head`), and it stops editable-key events inside the widget from reaching the host page.
- `mount-impl.tsx:metaContent` - reads the `conciv-widget` meta tag when no `settings` are passed.
- `mount.ts:panelCommands` - opens an event-bus client (`PANEL_PLUGIN_ID`, reconnect every 500 ms, 60 retries) for `open`/`close`/`toggle`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/embed` from the repo root (turbo builds the package and its dependencies first) (builds `vite.handle.config.ts`, then runs vitest and Playwright)
