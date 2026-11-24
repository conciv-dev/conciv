# plugin-testkit src

## Purpose

The in-memory engine half a plugin test runs, and the vitest projects that wire each place a test runs.

## Files

- `index.ts` (the package root): `PluginEngine` and `testEffect`.
- `../bin/conciv-test.js`: the `conciv-test` bin; it starts `run-tests.ts`, which loads `@conciv/vitest-config/run-tests`.
- `plugin-engine.ts`: `PluginEngine.layer(options)`, `PluginSupervisor.layer` over `Instance.layer({replacements})` with
  fakes, and its helpers (`session`, `call`, `failure`, `write`, `skills`, `tools`, `events`). The fake sessions are
  rows in the migrated database's `sessions` table, so the session inbox and instruction state (which reference it)
  accept their writes.
- `effect.ts`: opencode's `testEffect`, ported to the vitest API.
- `browser.tsx` (export `./browser`): `mount` and `pluginEngine`; a plugin named by package name loads through
  `virtual:conciv-test-plugins`, and one with an engine part is refused.
- `story.tsx` (export `./story`): `PluginShell`.
- `shell/`: the fake shell. `context.tsx` the fake `Context` (one store for registries, contracts, toasts, dialogs and
  the composer; `overlay()` hosts carry `PLUGIN_OVERLAY_ATTR`, as the app's do), `client.ts` the `ConcivClient` over the link, `engine.ts` the browser half of `pluginEngine`,
  `app.tsx` the rendered shell.
- `engine-commands.ts`: the node half of `pluginEngine`, browser commands over a `ManagedRuntime` of
  `PluginEngine.layer`; `event.subscribe` reads the bus's public events.
- `plugin-directory.ts`: `pluginDirectory(name)`, the folder of a plugin installed in the package under test.
- `vitest.ts` (export `./vitest`): `concivTest()`, which imports `test-projects.ts` only when vite's mode is `test`.
- `test-projects.ts`: `kitTestConfig(config)`, the node, happy-dom, browser and perf projects, the
  `virtual:conciv-test-plugins` module (the conciv plugins the package under test lists), the
  `virtual:conciv-test.css` sheet, and the page error commands.
- `browser-commands.ts`: the types of the page error and engine commands and of the values the projects `provide`.
- `browser-setup.ts`, `happy-dom-setup.ts`, `fresh-profile.ts`, `page-errors.ts`: per-test cleanup, a fresh browser
  profile, the viewport reset and the collected page errors.

## Invariants

- The kit names no core, app, harness kit or CLI package.
- Browser commands carry JSON only.
