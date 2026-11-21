# @conciv/plugin-testkit

## Overview

Published test package for plugin authors. It has three entries with one export each:

- `@conciv/plugin-testkit/node`: `createEngine(config, start)` starts conciv's real engine. `config` is the product's own `ConcivConfig` (`plugins`, `permission`, `hubAccess`, `harness`, `port` and the rest, as a `conciv.config` file gives them); `start` holds what is not product config (`directory`, `timeouts`, `harnesses`, `env`, `fs`, `clock`). The AI is scripted: the test gives its replies with `engine.reply(...)`, built with the `TestLLM` helpers the entry also exports, and changes the engine after start with `engine.write`, `engine.setting`, `engine.stale` and `engine.version`. `engine.gate()` holds the next model request until the test releases it. `clock: 'test'` puts the engine's Effect clock on a test clock, and `engine.clock.advance(call)` moves it until that call settles.
- `@conciv/plugin-testkit/browser`: `mount({engine, plugins, seed, route})` shows the whole app on that engine and cleans up after the test. `plugins` names window plugins as the config does (a name, or `[name, options]`); with plugins and no engine the app opens in servers mode on its connect panel, as the embed does. `createEngine({}, {port: 'connect', token})` starts the engine on a connect port (4732 to 4741) with that token, so a servers-mode plugin such as try-it finds it. It returns nothing; the test drives the app through the UI.
- `@conciv/plugin-testkit/vitest`: `concivTest()`, the vite plugin that adds the three vitest projects below, with the kit's own settings and nothing from a private package.

The author adds `@conciv/plugin-testkit` to devDependencies and `concivTest()` from `@conciv/plugin-testkit/vitest` to the plugins of the package's one `vite.config.ts`. Under vitest (vite's mode `test`) it adds three test projects: node (`*.test.ts`), happy-dom (`*.dom.test.ts(x)`) and vitest browser mode (`*.browser.test.ts(x)`).

Outside vitest (`vite build`, `vite dev`) `concivTest()` does nothing and loads nothing of the test stack, so a package's build needs only the kit's own `dist`. For now `mount` and the happy-dom and browser projects work inside this repo only. Both need `@conciv/app`, which is not published, so the kit lists it (and `@conciv/uno-preset`, which the app's UnoCSS config loads) as devDependencies: `mount` imports the app, and under vitest `concivTest()` reads the app's `uno.config.ts` to build the projects. The engine side, `createEngine` from `@conciv/plugin-testkit/node` with its `TestLLM` replies, imports neither and works anywhere.

Source details: [src/README.md](./src/README.md).

## Invariants

- No helper exports. Everything else in `dist` is loaded by path from the test projects, never imported by a test.
- The engine always runs in Node: in the test process for node and happy-dom, and behind browser commands for browser mode.
- Browser commands carry JSON only, so in browser mode `engine.reply` refuses a streamed reply (an Effect `Stream`, such as `TestLLM.failAfter` or `TestLLM.hangAfter`); it is tested in node or happy-dom. A real harness adapter is `@conciv/harness-testkit`'s, not this kit's.
- In happy-dom every file shares one document, so a test that leaves any element in `document.body` after cleanup fails in its own file, and the leftovers are removed so later files start on an empty page (`happy-dom-setup.ts`). Browser mode gives each file its own page.
- In browser mode the Playwright page's console errors, uncaught errors and responses with status 400 or more are collected per test, as opencode's `trackPageErrors`. `pageErrors()` on the test context reads them when the test asks; nothing fails on its own (`page-errors.ts`).
- `package.json`: exports point at the tsdown build in `dist`, with `.d.ts` from `tsc -p tsconfig.build.json`.

## Verification

- Typecheck and lint: `pnpm exec turbo run typecheck --filter=@conciv/plugin-testkit`, then `pnpm lint` in this folder.
- Behaviour is proven by the plugin tests that use the kit.
