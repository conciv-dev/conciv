---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

`TestLLM` imports in browser mode too: `import {createEngine, TestLLM} from '@conciv/plugin-testkit/node'` is the same line in node, happy-dom and browser mode. It comes from the new browser-safe `@conciv/harness-testkit/test-llm` entry.
