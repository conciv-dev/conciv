---
'@conciv/app': patch
---

The engine `createEngine` makes carries its `address` (`apiBase` and `token`, type `EngineAddress` from `@conciv/plugin-testkit/node`), in node, happy-dom and browser mode, so a test can call an engine route. `mount` reads the address from the engine it is given.
