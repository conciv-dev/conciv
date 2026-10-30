---
'@conciv/ai': patch
'@conciv/harness': patch
'@conciv/protocol': patch
---

New `@conciv/ai` package: the chat primitives the platform is built from, on top of TanStack AI.
`@conciv/ai/messages` (message and part types, model-message converters), `@conciv/ai/events`
(`defineChatEvent` plus the approval, run lifecycle and code-mode tool events), `@conciv/ai/tools`
(`defineTool`), `@conciv/ai/usage` (`UsageSnapshot` and the token-usage mapping) and
`@conciv/ai/testkit` (story connection and chunk builders). The UI kits, extensions, tools,
protocol, widget and harness testkit now import these instead of `@tanstack/ai*`.

`@conciv/ai/adapters` owns the CLI text adapters: `TextAdapter`, `makeTextAdapter`, the `claudeCode`,
`codex`, `opencode` and `acp` factories with their option, permission and model-list exports, and
`@conciv/ai/testkit` adds `runAdapterTurn`. `@conciv/harness` and `@conciv/protocol` build on it and
no longer depend on `@tanstack/ai*`; `@conciv/ai` now bundles the `@tanstack/ai-*` CLI adapters
(keeping `@tanstack/ai` and `@tanstack/ai-sandbox` external), which harness did before.
`makeTextAdapter` moved from `@conciv/harness` to `@conciv/ai/adapters`.
