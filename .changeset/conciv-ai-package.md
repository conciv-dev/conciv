---
'@conciv/ai': patch
'@conciv/chat': patch
'@conciv/client': patch
'@conciv/core': patch
'@conciv/db': patch
'@conciv/harness': patch
'@conciv/harness-testkit': patch
'@conciv/protocol': patch
'@conciv/try': patch
---

New `@conciv/ai` package: the chat primitives conciv is built from, on top of TanStack AI. Three
entries, with the message, part and event types living in `@conciv/protocol`:

- `@conciv/ai/server`: `createChatServer`, which runs every turn through `chat()` with the library's
  persistence (`withPersistence`, streaming snapshots), locks, the local-process sandbox and its
  command policy, code mode with `discover_tools`, WebSocket and SSE delivery with resume, stop and
  hydrate; plus the CLI text adapters (`claudeCode`, `codex`, `opencode`, `acp`, `makeTextAdapter`).
  The patched `@tanstack/ai-sandbox` and `@tanstack/ai-code-mode` ship inside its dist.
- `@conciv/ai/client`: `createChat` and `createChatSession`, the Solid chat session on the library's
  `useChat` (connection, hydration, stop, approvals). The widget's chat runs on it.
- `@conciv/ai/testkit`: the story connection and chunk builders for stories and tests.

`bippy` stays held at its current version.

New `@conciv/chat` package: the conciv chat plane on top of `@conciv/ai/server` (`createChatPlane`):
the Drizzle chat stores over `@conciv/db`'s tables, transcript import, compaction with a divider that
keeps the history, boot recovery, approvals as the library's deny-and-retry flow with once and
session grants, `conciv_ui` questions, and the code-mode capabilities with the result cap. Tools that
need approval stay ordinary tool calls outside code mode. Core wires the plane and keeps sessions,
slash commands and the session bus; `@conciv/core`, `@conciv/db`, `@conciv/harness` and
`@conciv/protocol` no longer depend on `@tanstack/ai*`.

The widget posts "Approved: <title>" after an approval and refreshes hydration on stop and on a run
error. Approval tools called over RPC from outside the widget (the `conciv` CLI, curl) are refused
with the same ask, and a retry after approving runs.

The agent prompts and the `react-introspection` skill name `discover_tools`; `external_catalog` is
gone. `@conciv/harness-testkit` builds on the `@conciv/ai` event types and chunk builders and reaches
tools through `/api/mcp` with `discover_tools`. `discover_tools` carries each tool's
output shape and declared error codes.
