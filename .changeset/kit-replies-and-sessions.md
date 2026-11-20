---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

The test engine takes replies after start (`push`, `always`, `serve`, a `fallback` option) and waits for model requests (`wait`), as opencode's test model. More reply kinds: several tool calls in one step, text with usage, `complete` with a finish reason and usage, and reasoning. Each session gets `messages`, `rename`, `compact`, `model`, `effort`, `remove` and an `approve` reply kind, on the rpcs the widget calls; `sessions()` lists sessions and `sessionById` reaches one the test did not make. The recorded request type is now `RecordedRequest`.
