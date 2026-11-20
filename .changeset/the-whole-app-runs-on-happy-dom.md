---
'@conciv/plugin-testkit': patch
---

The whole app runs in a happy-dom test over a real engine: the engine runs in a child process per test file, and the kit's happy-dom environment gives the page Node's WebSocket, a loaded font set, and element sizes from the window size. The environment ships as `@conciv/plugin-testkit/dom-environment`; vitest's `environment` option takes a path, so a consumer points it at `fileURLToPath(import.meta.resolve('@conciv/plugin-testkit/dom-environment'))`.
