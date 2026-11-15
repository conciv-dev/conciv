---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/plugin-host': patch
---

Code-mode tools can be found with a `search` function inside the sandbox, and `@conciv/ai/server` exports `describeSchemas`, which turns a tool's input and output schemas into their TypeScript type text and the input's parameter names.
