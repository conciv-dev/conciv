# @conciv/app

The shipped widget: the shell from `@internal/frontend-defaults` plus the browser plugins conciv ships, and the
bundle that mounts it on a host page.

## rpc transport

Every widget tab talks to the engine over ONE connection per `(tab, apiBase)`. `@conciv/client` is the only place
that opens it:

1. At boot (and again after a `rebind()` to a new engine base) it dials `/rpc-ws` with a bounded open
   timeout.
2. If the socket opens, that tab rides the websocket for core rpc AND every plugin's rpc
   for the rest of its life. Mid-session drops never change transport: the
   connection re-dials the websocket and `ClientRetryPlugin` re-issues the calls.
3. Every chat turn rides the same socket: `chat.send` streams the run, and a resubscribe after a drop
   resumes it from its last event id.

## Interface

- `package.json:exports["."]` - `dist/mount.js` with types in `dist/mount.d.ts`.
- `src/builtins.ts` - the browser plugins the widget ships (the page renderer and the terminal), listed in one place.
- `vite.config.ts` - two Vite build environments, built in order by `builder.buildApp`.
  - `client`: the library build of `src/mount.ts` to `mount.js` (ES format, shared packages external). `@internal/frontend-defaults`, the page plugin's browser entries (`@conciv/plugin-page/client`, `@conciv/plugin-page/renderer`) and the private `@internal/plugin-terminal` are bundled in (`INLINED_PREFIXES`).
  - `widget`: one code-split ES build of `test/fixtures/global-entry.ts` and `src/native-entry.ts` into shared chunks under `dist/widget/`, plus the classic-script loaders `conciv-widget.global.js` and `conciv-widget-native.global.js` that `import()` their entry chunk relative to `document.currentScript.src`. Rolldown cannot code-split IIFE output, so the loader is what keeps a plain `<script src>` working. No source maps. Serving a loader means serving `dist/widget/` beside it, same origin (module chunks need CORS cross-origin).
- Source: [src](./src/README.md).

## Invariants

- `turbo.json:tasks.build` - its inputs add the sources of the packages whose UnoCSS classes the widget css is generated from (frontend-defaults, frontend-app-api, the ui-kits, the plugins), so a class edit there rebuilds the widget.
- The shared Ark/Solid/`@conciv/*` packages stay external (`EXTERNAL_PREFIXES`); a second bundled copy splits the Solid/Ark context. Guarded by `test/unit/mount-impl.unit.test.ts`.

## Side Effects

- The package root (configs and manifest) has none. At runtime mounting creates a shadow root on the host page and sets `window.__TSR_ROUTER__` back to the host's value. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
