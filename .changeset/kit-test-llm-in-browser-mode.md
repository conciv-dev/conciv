---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

`TestLLM` imports from `@conciv/plugin-testkit/node` in browser mode too: the reply builders live on a browser-safe `@conciv/harness-testkit/test-llm` entry.
