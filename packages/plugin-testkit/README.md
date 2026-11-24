# @conciv/plugin-testkit

## Overview

Published test package for plugin authors. It depends on the plugin SDK, `@conciv/plugin-host`, `@conciv/db`, the UI
kits and the preset, never on core, the app, the harness kits or the CLI. Entries:

- `@conciv/plugin-testkit` (the package root): `PluginEngine`, the plugin's engine part run in memory through
  `plugin-host` (`PluginEngine.layer(options)` over `Instance.layer` with fakes), and `testEffect`, opencode's Effect test
  helper. Tests call tools and rpc on it.
- `@conciv/plugin-testkit/browser`: the fake app shell for browser tests. `mount(plugin, {engine, options, tools})`
  runs a plugin's window part with a fake `ctx` (`ctx.ui` from `@internal/plugin/ui` `createUi` with plain parts,
  `ctx.client` the SDK's `Conciv.make` over an oRPC link) and renders its server covers, panels, settings pages and
  the tool cards given in `tools`. `pluginEngine(options)` starts `PluginEngine` in the test's node process; the link
  sends `plugin.call` and `event.subscribe` there through browser commands.
- `@conciv/plugin-testkit/story`: `PluginShell`, the same shell around a story's children, with no vitest import.
- `@conciv/plugin-testkit/vitest`: `concivTest()`, the vite plugin that adds the four vitest projects below.

A test that needs a real agent turn uses `@conciv/core/testing` from the plugin's own `test/engine.ts`. Real-app plus
real-engine browser journeys live in the app's own tests (`apps/conciv/test/`) and the e2e consumer apps.

The author adds `@conciv/plugin-testkit` to devDependencies and `concivTest()` from `@conciv/plugin-testkit/vitest` to the plugins of the package's one `vite.config.ts`. Under vitest (vite's mode `test`) it adds four test projects: node (`*.test.ts`), happy-dom (`*.dom.test.ts(x)`), vitest browser mode (`*.browser.test.ts(x)`, Chromium) and perf (`*.perf.test.ts(x)`, browser mode in Chromium and Firefox). The perf project holds measurements with budgets, such as frame gaps; it runs only when `--project perf` asks for it, never in a run without `--project`.

Outside vitest (`vite build`, `vite dev`) `concivTest()` does nothing and loads nothing of the test stack. The browser
project serves `virtual:conciv-test.css`, a UnoCSS sheet built with `@conciv/uno-preset` from the kit's `dist` and the
sources of the package under test and its conciv plugins; `browser-setup.ts` imports it.

Coverage: in GitHub Actions `concivTest()` turns on V8 coverage for every project of the run (node, happy-dom and the Chromium browser project) and writes `coverage/coverage-summary.json` and `coverage/lcov.info` under the package, also when a test fails, next to the CI reporters (`test-results.json`). A run counts every workspace source file it executes, in any package: code loaded from a package's built `dist` maps back to that package's `src` through the source maps every package builds with, the CLI child that `cli()` starts is counted too (vitest's `autoAttachSubprocess`). Tests and stories are left out. CI merges every run's lcov by source file and credits each file to the package that owns it. The same numbers on request, locally: `node node_modules/@conciv/plugin-testkit/bin/conciv-test.js --coverage.enabled` from the package folder (add test files to narrow it).

Coverage, known limits:

- A plugin's server half that the engine imports in a node test counts on approximate lines. plugin-host loads a plugin with Node's own `import()` through module hooks (`?__conciv_reload=<version>`, `packages/plugin-host/src/plugin/source.node.ts`), so Node runs the dist file itself, but vitest remaps those hits against vite's re-transform of the file (`transformFile` with `isTransformedByVite`), whose code differs. The fix would be three lines in `@vitest/coverage-v8`'s worker `takeCoverage`: mark an entry whose path is not in `moduleExecutionInfo` as `isExtendedContext`, so the provider reads that file from disk with its own source map, as it does for a child process. That is a dependency patch and is not made.
- A plugin's page bundle reads 0. The app evaluates it with `new Function` (`packages/plugin/src/experimental/host.ts`, as opencode's host), so V8 gives the script no URL and vitest drops it. Counting it would need a `//# sourceURL=` on the evaluated code (opencode has none, so it is not added), a source map from the bundle's build, and the `new Function` wrapper length as the start offset.
- `@conciv/client` reads 0 of its own lines. It bundles `@tanstack/solid-query`, whose build carries `/* istanbul ignore file */`; the comment lands in client's `dist/index.js`, and the converter (`ast-v8-to-istanbul`) drops a whole file that holds a file-level ignore hint, client's own source with it. Rolldown keeps the hint with the `@__PURE__` annotations, so no build option removes it alone.
- e2e runs collect no coverage.

Browser mode opens a 1280x800 page (vitest's `browser.viewport`), the app's desktop size; a phone test sets its own size with `page.viewport`, and the kit puts the configured size back after each test.

A flame graph of a test run: set `CONCIV_TEST_CPU_PROF=<folder>` when running the `conciv-test` bin. The bin then starts vitest with `--cpu-prof --cpu-prof-dir=<folder>`, vitest passes those flags to every test worker, and each process writes a `.cpuprofile` into the folder when it exits. Open one in Chrome DevTools (Performance tab, Load profile) or in speedscope. Unset, nothing changes.

Source details: [src/README.md](./src/README.md).

## Invariants

- No helper exports beyond the entries above. Everything else in `dist` is loaded by path from the test projects.
- In happy-dom every file shares one document, so a test that leaves any element in `document.body` after cleanup fails in its own file, and the leftovers are removed so later files start on an empty page (`happy-dom-setup.ts`). Browser mode gives each file its own page.
- In browser mode the Playwright page's console errors, uncaught errors and responses with status 400 or more are collected per test, as opencode's `trackPageErrors`. `pageErrors()` on the test context reads them when the test asks; nothing fails on its own (`page-errors.ts`).
- The happy-dom and browser projects add `vite-plugin-solid`, and the browser project UnoCSS, only when the author's `vite.config.ts` has none: the projects extend that config, so a second copy compiled every file twice.
- `--project` with only kit project names (`node`, `happy-dom`, `browser`, `perf`) makes the kit add only those projects: vitest resolves every project's vite config before it filters, once per project with its own server, so `--project node` ran the author's config and plugins (the router generator among them) for the happy-dom and browser projects too. A filter with a wildcard, a `!` or any other name keeps all four, and vitest filters as before.
- `package.json`: exports point at the tsdown build in `dist`, with `.d.ts` from `tsc -p tsconfig.build.json`.

## Verification

- Typecheck and lint: `pnpm exec turbo run typecheck --filter=@conciv/plugin-testkit`, then `pnpm lint` in this folder.
- Behaviour is proven by the plugin tests that use the kit.
