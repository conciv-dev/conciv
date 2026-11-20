# @conciv/plugin-testkit

## Overview

Published test package for plugin authors. It has two entries with one export each:

- `@conciv/plugin-testkit/node`: `createEngine(options)` starts conciv's real engine with the plugins and a scripted AI that answers with `replies` in order, built with the `TestLLM` helpers it also exports. A `harness` option passes a real adapter from `@conciv/harness` straight to the engine, whose chat stays scripted. `engine.gate()` holds the next model request until the test releases it.
- `@conciv/plugin-testkit/browser`: `mount({engine, seed, route})` shows the whole app on that engine and cleans up after the test. It returns nothing; the test drives the app through the UI.

The author adds `@conciv/plugin-testkit` to devDependencies and `conciv()` from `@conciv/unplugin/vite` to the package's one `vite.config.ts`. Under vitest, that plugin sets three test projects from `dist/test-projects.js`: node (`*.test.ts`), happy-dom (`*.dom.test.ts(x)`) and vitest browser mode (`*.browser.test.ts(x)`).

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
