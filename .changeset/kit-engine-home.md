---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

`engine.home` is the engine's conciv home, `createEngine(config, {home})` starts a second engine on it, and `cli(args, {engine})` runs on that home.
