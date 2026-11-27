# Plugin bundler hooks

Status: ruled 2026-11-27 by the maintainer. Lands on main on its own, before the design plugin uses it.

## Why

The design plugin needs build-time access to the host's source: it stamps every JSX element with a stable id
(`data-conciv-key`, `data-conciv-instance`, `data-conciv-site`) so the Conciv Object Model can join the Figma,
DOM, CSSOM and source trees, and it serves the component preview as a virtual module. Today a plugin has no way to
reach the host's bundler; only `@conciv/unplugin` does, and it holds no plugin code.

## Rulings

1. A plugin's bundler part is a `ctx.bundler` domain the plugin uses inside its `effect` (and `setup` on the promise
   entry), as opencode contributes everything through ctx domains (`packages/plugin/src/effect/command.ts`
   `transform: Transform<CommandEditor>`, `CommandEditor.add`) and as our own `ctx.tool` and `ctx.skill` do (Decision
   D1). It is not a property on the plugin definition, not a new export, not a new `define`, and not a per-plugin line
   in the host's bundler config. Static hooks could not reach state the plugin creates in `effect` (the design plugin
   keeps a key map per dev server), and module state is banned:

   ```ts
   export default Plugin.define({
     id: 'design',
     effect: (ctx) =>
       Effect.gen(function* () {
         const keys = new Map<string, string>()
         yield* ctx.bundler.transform((editor) => editor.add({transform: (code, id) => stamp(keys, code, id)}))
       }),
   })
   ```

2. A plugin that never calls `ctx.bundler.transform` changes nothing, and with no registration the host's build is
   byte-for-byte what it is today.
3. `editor.add` takes only unplugin's bundler-neutral hooks: `transform`, `resolveId`, `load`. No Vite, webpack,
   rspack or esbuild type appears in the plugin API, and unplugin runs the hooks the same way in every bundler it
   supports. Dev-server routes are out: unplugin has no bundler-neutral server hook.
4. The code of any plugin lives only in `packages/plugins/<name>`. `@conciv/unplugin` only calls the engine's chain;
   it knows no plugin by name.

## Shape

- `@conciv/backend-plugin-api`: `Context` (effect and promise entries, `src/effect/plugin.ts` and the promise twin
  `src/promise/plugin.ts`) gains `readonly bundler: BundlerDomain`, typed in `src/effect/bundler.ts` and
  `src/promise/bundler.ts` as every other domain (subpath `./effect/bundler`), with
  `BundlerDomain = {transform: Transform<BundlerEditor>}` and `BundlerEditor = {add(hooks: BundlerHooks): void}`.
  `BundlerHooks` is a plain object of the three hooks, typed in this package without importing `unplugin` types into
  the public API. On the Effect entry every hook returns an Effect with an `unknown` error channel, as opencode's
  Effect entry types every plugin callback: `transform(code, id)` returns `Effect<{code, map?} | string | null |
  undefined>`, `resolveId(id, importer)` returns `Effect<string | null | undefined>`, `load(id)` returns
  `Effect<{code, map?} | string | null | undefined>`, and `transform` returns `Effect<Registration, never, Scope>`.
  The promise twin types the same hooks promise-style (a value or a promise of it) and `transform` returns
  `Promise<Registration>`; `fromPromise` (`src/promise/adapter.ts`) adapts each added hook to its Effect form.
- Registrations live with the plugin's scope, as every other domain transform: they go when the plugin stops,
  reloads or is disabled, and `Registration.dispose` removes one early. The engine's plugin registry keeps them in
  one `State.create` (`backend-app-api/src/core/state.ts`), the same store `ctx.skill` and `ctx.agent` use.
- Where the chain runs: unplugin already boots the engine in the dev server's own process
  (`packages/unplugin/src/core/boot.ts`, `start` from `@conciv/backend/start`). The engine's plugin registry
  (`backend-app-api/src/core/plugin.ts`) runs the chain over the registrations in plugin load order, and the `Engine` that
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
  and a virtual module through `resolveId` + `load`, registered with `ctx.bundler` in its `setup`: the served module
  shows the transform after the source stamp, and an import of the virtual id resolves. A plugin that registers no
  hooks leaves the output unchanged. Fold into the
  existing `vite.it.test.ts` journey where it fits.
- Nothing is added to product code for the test (AGENTS.md "No code exists for tests").

## Opencode

opencode never compiles a host app's code, so it has no bundler hooks; the hook set is unplugin's own. The way a
plugin contributes them is opencode's: a ctx domain with a `transform(editor => editor.add(...))` registration, as its
`command` domain.
