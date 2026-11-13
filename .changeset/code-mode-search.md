---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/plugin-host': patch
---

Code-mode tools can be found with a `search` function inside the sandbox, and `@conciv/ai/server` exports `describeInput`, which turns a tool's input schema into its TypeScript type text and its parameter names.
