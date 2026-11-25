---
'@conciv/simulation': patch
'@conciv/plugin-testkit': patch
---

A node test runs the conciv CLI: `cli(args, {cwd?, env?})` from `@conciv/simulation` and `@conciv/plugin-testkit/node` runs the built `@conciv/cli` in a fresh, isolated home and resolves with what it printed and its exit code, even when the command fails. Pass `CONCIV_PORT` and `CONCIV_TOKEN` from the engine's address to reach the test's engine. A CLI that gives no result within 60 seconds is killed and the call is refused with a plain message. `@conciv/cli` is a new peer of `@conciv/simulation`.
