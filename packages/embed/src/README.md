# embed/src

## Overview

Mounts the conciv widget into a shadow root on the host page. `createConciv` is the handle API used by the React wrapper and the plugin loader; `global-entry.ts` is the plain `<script src>` entry that mounts it with `mountConciv`.

## Interface

- `mount.ts:createConciv` - returns a `ConcivHandle` with `mount(el)`, `unmount()`, `open()`, `close()`, `toggle()`, `rebind(apiBase)`.
- `mount.ts:ConcivInit` - `plugins`, `settings`, `apiBase`, `engineToken`, `timings` (forwarded to the app's `Platform.timings`).
- `mount.ts:mountConciv` - appends a `[data-conciv-script-root]` div to `document.body` and mounts the widget with the given plugin entries.
- `mount-impl.tsx:mountImpl` - creates the `[data-conciv-root]` element and shadow root, builds a `Platform` from `ConcivInit` (the api base from `init`, else `window.__CONCIV_API_BASE__`, the `conciv-api-base` meta tag or a loopback or same-origin `?core=`; servers mode when there is none and plugins are given) and renders `ConcivApp` from `@conciv/app`.
- `global-entry.ts` - calls `mountConciv()`: the widget for a plain `<script src>` page, such as core's `/widget` page.

## Invariants

- `mount-impl.tsx` unmount - removes the shadow root's listeners and disposes the app render; the app closes its own rpc socket before its query cache is torn down.
- `mount.ts:createConciv.mount` - does nothing without a `document` or when the state is not `unmounted`; a failed mount resets to `unmounted` and rethrows.
- `mount.ts:createConciv.rebind` - does nothing unless the state is `mounted`.
- `mount.ts:mountConciv` - does nothing inside a `data-conciv-capture` frame or when a `[data-conciv-script-root]` already exists; removes its element if the mount fails.

## Side Effects

- `mount-impl.tsx:mountImpl` - sets `window.__TSR_ROUTER__` and restores the host's value on teardown. It names no plugin: the page plugin installs its React bridge from its own `beforeRegister`.
- `mount-impl.tsx:mountImpl` - a handle rebind waits until the widget is interactive, then dispatches the `conciv:rebind` window event that the app handles; nothing after teardown or in servers mode.
- `mount-impl.tsx:createShadowRoot` - attaches the open shadow root; while a selection starts inside the widget it sets a selection attribute on `document.documentElement` (styled by one `style[data-conciv-selection]` in `document.head`), and it stops editable-key events inside the widget from reaching the host page.
- `mount-impl.tsx:metaContent` - reads the `conciv-widget` meta tag when no `settings` are passed.
- `mount.ts:panelCommands` - opens an event-bus client (`PANEL_PLUGIN_ID`, reconnect every 500 ms, 60 retries) for `open`/`close`/`toggle`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/embed` from the repo root (turbo builds the package and its dependencies first) (builds `vite.handle.config.ts`, then runs vitest and Playwright)
