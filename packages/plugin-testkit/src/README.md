# plugin-testkit src

## Purpose

The engine a test makes, the mount that shows the app on it, and the vitest projects that wire both per place a test runs.

## Files

- `node.ts`, `browser.ts`: the two public entries.
- `engine.ts`: `createEngine` on `createHarnessEngine` from `@conciv/harness-testkit`, with the plugin names resolved from the package under test. An engine made inside a test stops when the test ends; one made at file level stops after the file (`node-setup.ts`).
- `browser-engine.ts`: the same `createEngine` for browser mode. Each call is a browser command, and the engine runs in Node (`test-projects.ts`). The browser project aliases `/node` to this file.
- `mount.ts`: renders `ConcivApp` bound to the engine's address, with browser storage seeded and an in-memory draft store. A given route opens in memory; without one the app keeps its navigation in the engine, as the embed does. One mount per test; a reload journey belongs in an e2e app with a real `page.reload()`. `happy-dom.ts` and `browser.ts` give it the address lookup for their side.
- `dom-environment.ts`: the happy-dom environment, keeping Node's fetch, WebSocket and storage so the page reaches the engine over the real socket.
- `test-projects.ts`: the node, happy-dom and browser projects that the conciv vite plugin loads.

## Invariants

- The engine graph loads as plain Node modules (`server.deps.external` on the engine chunk), so `ws` and the server entries never get browser conditions.
- In browser mode every engine and session call crosses as a browser command and carries plain JSON. What cannot cross fails at once with a plain message: a harness adapter, a streamed reply (in `replies`, `fallback`, `push` or `always`), and `serve`, whose reply is a function.
- A session handle is only an id over its engine, so a session reached by id works the same as one the test made.
- State is put in place only through the engine's own rpc (settings, real turns) and browser storage; no test-only endpoint.
