---
'@conciv/ai': patch
---

New `@conciv/ai` package: the chat primitives the platform is built from, on top of TanStack AI.
`@conciv/ai/messages` (message and part types, model-message converters), `@conciv/ai/events`
(`defineChatEvent` plus the approval, run lifecycle and code-mode tool events), `@conciv/ai/tools`
(`defineTool`), `@conciv/ai/usage` (`UsageSnapshot` and the token-usage mapping) and
`@conciv/ai/testkit` (story connection and chunk builders). The UI kits, extensions, tools,
protocol, widget and harness testkit now import these instead of `@tanstack/ai*`.
