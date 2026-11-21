---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

`requests()` keeps the whole model request: the system prompts, each tool with its JSON Schema input, the model, the effort and the model options, as plain data in node, happy-dom and browser mode. The kit's own harness now takes the system prompt (`systemPrompt: 'flag'`), so the prompt reaches the model.
