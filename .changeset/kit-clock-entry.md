---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

The engine clock's advance loop lives once, in the new `@conciv/harness-testkit/clock` entry: the node clock and the browser-mode clock both run it, each with its own step.
