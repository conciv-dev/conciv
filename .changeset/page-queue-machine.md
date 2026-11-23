---
'@conciv/plugin-page': patch
'@conciv/plugin-tanstack': patch
---

The page queue keeps its state in a queue machine run by Effect, and the tanstack plugin's browser half runs on its own ManagedRuntime.
