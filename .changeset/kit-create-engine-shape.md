---
'@conciv/simulation': patch
'@conciv/plugin-testkit': patch
---

`createEngine(config, start)` and `createHarnessEngine(config, start)`: the first argument is the product's own `ConcivConfig`, the second only what is not product config. `engine.reply`, `engine.write`, `engine.stale` and `engine.version` replace the `replies`, `files`, `staleness` and `app` options.
