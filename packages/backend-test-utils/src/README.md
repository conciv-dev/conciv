# backend-test-utils/src

## Purpose

The engine-test entry for plugin and engine authors: a vitest `test` whose `createEngine` fixture starts the `@internal/engine-kit` engine on `@conciv/backend-defaults/backend`'s `createBackend` and stops every engine it started when the test ends. The kit is bundled into this package's build.

## Invariants

- No module state: each engine belongs to the test that made it, and a test whose engine fails to stop fails with every stop error.
- `browser.ts` is the `browser` export condition of `.`: the same `test` for vitest browser mode. Each engine runs in node; the page holds its id and reaches it through vitest browser commands, and the fixture sends `concivStopEngine` for each one when the test ends. Only data crosses: a function reply other than `hang()`, `start.harness` or a plugin object is refused with a message.
- `vitest.ts` (`./vitest`) is the node half: `engineCommands()` gives the command handlers and a `close` that stops what is left. `@internal/vitest-config`'s browser project loads it from the package under test, so the engines belong to that project's config, not to a module.
