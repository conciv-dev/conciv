# @internal/frontend-test-utils

Private, never published: renders a plugin's browser part on the fake engine of `@conciv/client/testing` or on a real engine from
`createEngine` of `@conciv/backend-test-utils`, the way
`@backstage/frontend-test-utils` does for Backstage.

- `renderInTestApp({engine, plugins, open})` mounts the plugins in the real plugin host of `@internal/frontend-app-api` with
  small fakes in place of the app shell: their pane panels as a tab strip, their dialogs, styles and toasts, the composer
  notes they claim, one fake session, an in-memory composer and in-memory storage. It resolves once every plugin has
  started or failed.
- `createExtensionTester({engine, plugins}).renderToolCards(...props)` renders the tool cards the plugins contribute, alone.
- `useFakeEngine(engine?)` disposes the engine when the test ends and fails the test if it was asked for anything no
  handler answers.
- `renderTestApp({engine, plugins, initialEntries, settings})` from `./app` mounts the real shell
  (`@internal/frontend-defaults`) with the given plugins (`builtin: true` passes one as a built-in) on the given engine,
  or with no engine (`engine: 'none'`). `servePluginBundle` from `./app` serves a plugin's built bundle as the engine
  does, so the shell loads it through its real loader.

Invariants: never depends on `@conciv/app`, the engine (`@conciv/backend`, `@conciv/backend-defaults`) or the
simulation; only `./app` reaches the shell; holds no module state: every engine, store and app is made inside the call that uses it.
