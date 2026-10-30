---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/core': patch
'@conciv/db': patch
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

`@conciv/ai/server` holds the server primitives with no conciv dependencies: the turn runner
(`runTurn`: `chat()` + `withSandbox` + caller middleware), the tool gate middleware, the WebSocket
and SSE turn delivery with resume, run control (run store types, cancel, durability, keyed locks,
an async queue), the live message fold, code mode and its isolate drivers, the local sandbox and
command policy helpers, and the debug logger types. `@conciv/ai/server-testkit` adds the node-side
test helpers (event fold, MCP client, socket and SSE turns, the chat store conformance suite).
`@conciv/ai` now bundles the patched `@tanstack/ai-sandbox-local-process`.

New `@conciv/chat` package: the chat plane moved out of `@conciv/core` (turns, hydrate, transcript
import, stop, compaction, boot recovery, the permission gate, the session bus) together with the chat
stores over `@conciv/db`'s tables (run store, thread queries, message and metadata stores). Core wires
it through `createChatPlane` and passes the read-only command policy in. `@conciv/core` and
`@conciv/db` no longer depend on `@tanstack/ai*`; the drizzle schema, migrations and the legacy
import run at open stay in `@conciv/db`.
