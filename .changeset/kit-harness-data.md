---
'@conciv/simulation': patch
'@conciv/plugin-testkit': patch
---

Models, commands and several harnesses are data a test gives: `models` and `commands` set what the kit's harness lists, and `harnesses` runs several scripted harnesses (the first is the engine's), all answering from the one `replies` queue. The engine refuses, before it starts, a repeated harness id, an empty `harnesses`, and options that would be ignored together (`harnesses` with `harness`, `models` or `commands`; `models` or `commands` with a `harness` adapter).
