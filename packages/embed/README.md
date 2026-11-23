# @conciv/embed

The browser bundle that mounts the conciv widget on a host page.

## rpc transport

Every widget tab talks to the engine over ONE connection per `(tab, apiBase)`. The browser client
factory in `@conciv/contract` is the only place that picks the transport:

1. At boot (and again after a `rebind()` to a new engine base) it dials `/rpc-ws` with a bounded open
   timeout.
2. If the socket opens, that tab rides the websocket for core rpc AND every plugin's rpc
   for the rest of its life. Mid-session drops never change transport — the
   reconnecting wrapper re-dials the websocket and `ClientRetryPlugin` re-issues the calls.
3. Every chat turn rides the same socket: `chat.send` streams the run, and a resubscribe after a drop
   resumes it from its last event id.

## Interface

- `package.json:exports["."]` - `dist/mount.js` with types in `dist/mount.d.ts`.
- `vite.config.ts` - two Vite build environments, built in order by `builder.buildApp`.
  - `client`: the library build of `src/mount.ts` to `mount.js` (ES format, shared packages external). The page plugin's browser entries (`@conciv/plugin-page/client`, `@conciv/plugin-page/renderer`) and the private `@conciv/plugin-terminal` are bundled into the published widget (`INLINED_PREFIXES`), as opencode's app bundles `@opencode/gui-plugins`.
  - `widget`: one code-split ES build of `src/global-entry.ts` into chunks under `dist/widget/`, plus the classic-script loader `conciv-widget.global.js` that `import()`s its entry chunk relative to `document.currentScript.src`. Rolldown cannot code-split IIFE output, so the loader is what keeps a plain `<script src>` working. No source maps. Serving a loader means serving `dist/widget/` beside it, same origin (module chunks need CORS cross-origin).
- `vite.handle.config.ts` - IIFE `ConcivHandle` test bundle `conciv-handle.global.js` into `test/dist`.
- `playwright.config.ts:testDir` - `./test/e2e`.
- Source: [src](./src/README.md).

## Invariants

- `turbo.json:tasks.build` - depends on `^build` and outputs `dist/**`.

## Side Effects

- The package root (configs and manifest) has none. At runtime mounting sets `window.__CONCIV_*` globals, creates a shadow root on the host page and installs the page plugin's React bridge. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/embed` from the repo root (turbo builds the package and its dependencies first) (builds `vite.handle.config.ts`, then runs vitest and Playwright)
- The embed IT (`test/e2e/embed.it.test.ts`) needs the handle fixture `test/dist/conciv-handle.global.js`, which only the package's own `test` script builds (`vite.handle.config.ts`): `turbo run build --filter=@conciv/embed` does not build it.
