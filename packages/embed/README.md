# @conciv/embed

The browser bundle that mounts the conciv widget on a host page.

## rpc transport

Every widget tab talks to the engine over ONE connection per `(tab, apiBase)`. The browser client
factory in `@conciv/contract` is the only place that picks the transport:

1. At boot (and again after a `rebind()` to a new engine base) it dials `/rpc-ws` with a bounded open
   timeout.
2. If the socket opens, that tab rides the websocket for core rpc AND every extension router
   (`ext.<slug>`) for the rest of its life. Mid-session drops never change transport — the
   reconnecting wrapper re-dials the websocket and `ClientRetryPlugin` re-issues the calls.
3. If the socket does not open, the tab sticks to fetch/SSE and logs a warning naming the base, so an
   active fallback is never silent.

There is no connection-error state today: if fetch/SSE also fails, the tab has no dedicated recovery UI
(tracked in #350).

No user-agent sniffing is involved anywhere.

## ws-blocked networks

Some corporate proxies drop websocket upgrades. Such a tab falls back to fetch/SSE automatically and
keeps working, with one accepted regression: browsers cap a single origin at six HTTP connections, so
the widget's long-lived streams starve once several tabs are open against the same engine. On the
websocket transport that limit does not apply.

To pin a transport explicitly — for a blocked network, or to reproduce the fetch path — set
`widget.transport`:

```ts
conciv({widget: {transport: 'fetch'}}) // never probe, always fetch/SSE
conciv({widget: {transport: 'websocket'}}) // never probe, always /rpc-ws
```

`auto` (the default) is the boot probe described above.

## Interface

- `package.json:exports["."]` - `dist/mount.js` with types in `dist/mount.d.ts`.
- `vite.config.ts` - library build of `src/mount.ts` to `mount.js` (ES format, shared packages external).
- `vite.global.config.ts` - IIFE `ConcivWidget` bundle `conciv-widget.global.js` from `tests/fixtures/global-entry.ts`.
- `vite.native.config.ts` - IIFE `ConcivWidgetNative` bundle `conciv-widget-native.global.js` from `src/native-entry.ts`.
- `vite.handle.config.ts` - IIFE `ConcivHandle` test bundle `conciv-handle.global.js` into `tests/dist`.
- `playwright.config.ts:testDir` - `./tests/e2e`.
- Source: [src](./src/README.md).

## Invariants

- `turbo.json:tasks.build` - depends on `^build` and outputs `dist/**`.

## Side Effects

- The package root (configs and manifest) has none. At runtime mounting sets `window.__CONCIV_*` globals, creates a shadow root on the host page and starts the page plane. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/embed` from the repo root (turbo builds the package and its dependencies first) (builds `vite.handle.config.ts`, then runs vitest and Playwright)
