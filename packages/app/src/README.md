# app/src

## Overview

Mounts the conciv widget into a shadow root on the host page. `createConciv` (`mount.ts`) is the handle the framework wrappers and the plugin loader use; `mountConciv` is the plain-script entry; `native-entry.ts` is the iOS native-page entry; `builtins.ts` lists the browser plugins the widget ships.

- `mount-impl.tsx:mountImpl` builds a `Platform` (the api base from `init`, else `window.__CONCIV_API_BASE__`, the `conciv-api-base` meta tag or a loopback or same-origin `?core=`; servers mode when there is none and plugins are given), makes the one engine connection of the mounted widget (`createBrowserEngine` of `@internal/frontend-defaults`) and renders `ConcivApp` from `@internal/frontend-defaults`.
- `native-entry.ts` owns the scope of `@conciv/plugin-ios/builtins` `builtins`, composes its built-ins list in, hands its `grabProvider` and `apiBase` to `createConciv` with the `?conciv_auth_token=` query of the page url as the engine token, and mounts the widget on `[data-conciv-native-root]` (or `document.body`).
- Outside a production build, `builtins.ts` adds the `conciv.simulation.ui` built-in (`@internal/frontend-defaults/drive`), the widget half of drive mode; it runs only when the engine lists that plugin.

## Invariants

- `mount-impl.tsx` teardown - removes the shadow root's listeners, disposes the app render, then disposes the engine connection and removes the host element, even when the render's dispose throws.
- `mount.ts:createConciv.mount` - does nothing without a `document` or when the state is not `unmounted`; a failed mount resets to `unmounted` and rethrows.
- `mount.ts:createConciv.rebind` - does nothing unless the state is `mounted`.
- `mount.ts:mountConciv` - does nothing inside a `data-conciv-capture` frame or when a `[data-conciv-script-root]` already exists; removes its element if the mount fails.
- `native-entry.ts:readLauncher` - the launcher is `mascot` only when the `launcher` query parameter says so, otherwise `native`.
- `native-entry.ts` - on a `pagehide` that is not kept in the back-forward cache it unmounts the widget and closes the native service's scope.

## Side Effects

- `mount-impl.tsx:mountImpl` - restores the host's `window.__TSR_ROUTER__` after the render and on teardown. It installs no plugin bridge: the page plugin installs its React bridge from its own `beforeRegister` (`packages/plugins/page/src/renderer.tsx:33`).
- `mount-impl.tsx:mountImpl` - a handle rebind waits until the widget is interactive, then dispatches the `conciv:rebind` window event that the app handles; nothing after teardown or in servers mode.
- `mount-impl.tsx:createShadowRoot` - attaches the open shadow root; while a selection starts inside the widget it sets a selection attribute on `document.documentElement` (styled by one `style[data-conciv-selection]` in `document.head`), and it stops editable-key events inside the widget from reaching the host page.
- `mount-impl.tsx:metaContent` - reads the `conciv-widget` meta tag when no `settings` are passed.
- `mount.ts:panelCommands` - opens an event-bus client (`PANEL_PLUGIN_ID`, reconnect every 500 ms, 60 retries) for `open`/`close`/`toggle`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
