# plugin-testkit src

## Purpose

The engine a test makes, the mount that shows the app on it, and the vitest projects that wire both per place a test runs.

## Files

- `node.ts`, `browser.ts`: the two public entries.
- `engine.ts`: `createEngine` on `createHarnessEngine` from `@conciv/harness-testkit`, with the plugin names resolved from the package under test. An engine made inside a test stops when the test ends; one made at file level stops after the file (`node-setup.ts`).
- `browser-engine.ts`: the same `createEngine` for browser mode. Each call is a browser command, and the engine runs in Node (`test-projects.ts`). The browser project aliases `/node` to this file.
- `mount.ts`: renders `ConcivApp` bound to the engine's address, with browser storage seeded, the route opened and an in-memory draft store. `happy-dom.ts` and `browser.ts` give it the address lookup for their side.
- `dom-environment.ts`: the happy-dom environment, keeping Node's fetch, WebSocket and storage so the page reaches the engine over the real socket.
- `test-projects.ts`: the node, happy-dom and browser projects that the conciv vite plugin loads.

## Invariants

- The engine graph loads as plain Node modules (`server.deps.external` on the engine chunk), so `ws` and the server entries never get browser conditions.
- State is put in place only through the engine's own rpc (settings, real turns) and browser storage; no test-only endpoint.
