# @conciv/plugin-testkit

## Overview

Published test package for plugin authors. It has three entries with one export each:

- `@conciv/plugin-testkit/node`: `createEngine(options)` starts conciv's real engine with the plugins and a scripted AI that answers with `replies` in order, built with the `TestLLM` helpers it also exports. A `harness` option passes a real adapter from `@conciv/harness` straight to the engine, whose chat stays scripted. `engine.gate()` holds the next model request until the test releases it. `clock: 'test'` puts the engine's Effect clock on a test clock, and `engine.clock.advance(call)` moves it until that call settles.
- `@conciv/plugin-testkit/browser`: `mount({engine, seed, route})` shows the whole app on that engine and cleans up after the test. It returns nothing; the test drives the app through the UI.
- `@conciv/plugin-testkit/vitest`: `concivTest()`, the vite plugin that adds the three vitest projects below, with the kit's own settings and nothing from a private package.

The author adds `@conciv/plugin-testkit` to devDependencies and `concivTest()` from `@conciv/plugin-testkit/vitest` to the plugins of the package's one `vite.config.ts`. Under vitest (vite's mode `test`) it adds three test projects: node (`*.test.ts`), happy-dom (`*.dom.test.ts(x)`) and vitest browser mode (`*.browser.test.ts(x)`).

Outside vitest (`vite build`, `vite dev`) `concivTest()` does nothing and loads nothing of the test stack, so a package's build needs only the kit's own `dist`. For now `mount` and the happy-dom and browser projects work inside this repo only. Both need `@conciv/app`, which is not published, so the kit lists it (and `@conciv/uno-preset`, which the app's UnoCSS config loads) as devDependencies: `mount` imports the app, and under vitest `concivTest()` reads the app's `uno.config.ts` to build the projects. The engine side, `createEngine` from `@conciv/plugin-testkit/node` with its `TestLLM` replies, imports neither and works anywhere.

Source details: [src/README.md](./src/README.md).

## Invariants

- No helper exports. Everything else in `dist` is loaded by path from the test projects, never imported by a test.
- The engine always runs in Node: in the test process for node and happy-dom, and behind browser commands for browser mode.
- Browser commands carry JSON only, so in browser mode `createEngine` refuses a `harness` and a streamed reply; those are tested in node or happy-dom.
- In browser mode the Playwright page's console errors, uncaught errors and responses with status 400 or more are collected per test, as opencode's `trackPageErrors`. `pageErrors()` on the test context reads them when the test asks; nothing fails on its own (`page-errors.ts`).
- `package.json`: exports point at the tsdown build in `dist`, with `.d.ts` from `tsc -p tsconfig.build.json`.

## Verification

- Typecheck and lint: `pnpm exec turbo run typecheck --filter=@conciv/plugin-testkit`, then `pnpm lint` in this folder.
- Behaviour is proven by the plugin tests that use the kit.
