# Plugin bundler hooks

Status: ruled 2026-11-27 by the maintainer. Lands on main on its own, before the design plugin uses it.

## Why

The design plugin needs build-time access to the host's source: it stamps every JSX element with a stable id
(`data-conciv-key`, `data-conciv-instance`, `data-conciv-site`) so the Conciv Object Model can join the Figma,
DOM, CSSOM and source trees, and it serves the component preview as a virtual module. Today a plugin has no way to
reach the host's bundler; only `@conciv/unplugin` does, and it holds no plugin code.

## Rulings

1. A plugin's bundler part is one optional property on the existing plugin definition, not a new export, not a new
   `define`, and not a per-plugin line in the host's bundler config:

   ```ts
   export default Plugin.define({
     id: 'design',
     effect: (ctx) => ...,
     bundler: {transform, resolveId, load},
   })
   ```

2. `bundler` is optional. A plugin without it changes nothing, and with no plugin carrying it the host's build is
   byte-for-byte what it is today.
3. `bundler` takes only unplugin's bundler-neutral hooks: `transform`, `resolveId`, `load`. No Vite, webpack, rspack
   or esbuild type appears in the plugin API, and unplugin runs the hooks the same way in every bundler it supports.
   Dev-server routes are out: unplugin has no bundler-neutral server hook.
4. The code of any plugin lives only in `packages/plugins/<name>`. `@conciv/unplugin` only reads the property and
   runs it; it knows no plugin by name.

## Shape

- `@conciv/backend-plugin-api`: the `Plugin` interface (effect and promise entries, `src/effect/plugin.ts` and the
  promise twin `src/promise/plugin.ts`) gains `readonly bundler?: Bundler`. `Bundler` is a plain object of the three
  hooks, typed in this package without importing `unplugin` types into the public API. On the Effect entry every hook
  returns an Effect with an `unknown` error channel, as opencode's Effect entry types every plugin callback:
  `transform(code, id)` returns `Effect<{code, map?} | string | null | undefined>`, `resolveId(id, importer)` returns
  `Effect<string | null | undefined>`, `load(id)` returns `Effect<{code, map?} | string | null | undefined>`. The
  promise twin types the same hooks promise-style (a value or a promise of it), and `fromPromise`
  (`src/promise/adapter.ts`) adapts each present hook to its Effect form.
- Where the chain runs: unplugin already boots the engine in the dev server's own process
  (`packages/unplugin/src/core/boot.ts`, `start` from `@conciv/backend/start`). The engine's plugin registry
  (`backend-app-api/src/core/plugin.ts`) runs the chain over the running plugins in load order, and the `Engine` that
  `start` returns exposes it as `bundler: {transform, resolveId, load}`, promise-returning. unplugin only awaits the
  engine and calls those three; it keeps no copy, chains nothing and holds no module state.
- Order: conciv's own `data-tsd-source` stamp (`core/vite.ts` `stampJsxSource`) runs first, then each plugin's
  `transform` in plugin load order, each seeing the previous output. `resolveId` and `load`: the first plugin that
  returns a value wins.
- Timing: a hook call that arrives before the engine has booted awaits the boot, so the first page load gets every
  plugin's transform. An engine that fails to boot leaves the build as it is today, with one logged error.
- A plugin hook that throws fails only that module's transform with the plugin id in the message; other plugins and
  the widget keep working.
- Scope: dev only, where unplugin boots the engine. `vite build` and test mode (`testing`) run no plugin hooks, as
  the source stamp does not run in test mode today.

## Tests

- `packages/unplugin/test/it`: a dev server on the existing fixture app with one test plugin carrying a `transform`
  and a virtual module through `resolveId` + `load`: the served module shows the transform after the source stamp,
  and an import of the virtual id resolves. A plugin without `bundler` leaves the output unchanged. Fold into the
  existing `vite.it.test.ts` journey where it fits.
- Nothing is added to product code for the test (AGENTS.md "No code exists for tests").

## Opencode

opencode has no equivalent: it never compiles a host app's code. The pattern followed is unplugin's own hook set.
