---
'@conciv/simulation': patch
'@conciv/backend-test-utils': patch
---

`engine.home` is the engine's conciv home, `createEngine(config, {home})` starts a second engine on it, and `cli(args, {engine})` runs on that home.
