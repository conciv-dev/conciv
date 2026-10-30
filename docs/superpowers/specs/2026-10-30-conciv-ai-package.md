# `@conciv/ai`: one package that owns @tanstack/ai

Status: signed off 2026-10-30. Part of the deps-latest lane
(`docs/superpowers/plans/2026-10-29-deps-latest.md`). Companion spec:
`2026-10-29-approvals-deny-and-retry.md`.

## Decisions already made (user, 2026-10-29)

- Direction: stay on TanStack AI's documented setup for CLI agents: `chat()` + `withSandbox` +
  the CLI text adapters + `useChat` (the setup of the `sandbox-web` and `ts-react-chat` examples).
  No `@tanstack/ai-harness`: its docs never use a CLI as a session's main adapter (only as
  `codingAgents()` tools under an API-model lead, `docs/harness/coding-agents.md`), and its
  `permissions()` plugin cannot see a CLI's own tool calls ("The agent owns the loop",
  `docs/adapters/claude-code.md` Limitations).
- Rewriting our side from scratch is fine.
- Encapsulate @tanstack/ai in ONE package that provides the primitives the platform is built from.
  No other package imports `@tanstack/ai*`.

## Today

About 300 files in 17 packages import `@tanstack/ai*` (ai-client 155, ai 121, ai-solid 46, the rest
under 10 each). About 75% are message/part TYPES used for rendering (ui-kit-chat, ui-kit-chat-tools,
extension cards). Runtime use is concentrated in `packages/core/src/chat/*` and `packages/db`
(chat plane), `packages/harness` (CLI adapters), `packages/client` (`useChat`, transports), and one
`toolDefinition` in `packages/tools`. Full map: the research report kept in the session scratchpad.

## The package

`packages/ai`, name `@conciv/ai`, published (it is a dependency of published packages). It holds
our own code built on @tanstack/ai, not re-exports. A file whose only job is to re-export library
names is a barrel and is not allowed. Each subpath export is a concrete module with our names and
our shapes.

| Subpath | Runtime | Holds |
|---|---|---|
| `@conciv/ai/messages` | any | `ChatMessage`, `ChatPart`, `ToolCallPart`, `ToolResultPart`, `ThinkingPart`, `ToolCallState`, `ModelMessage`, `ContentPart`, `SendContent`, `QueuedMessage`; `toModelMessages`, `toChatMessages`, `isContentParts` |
| `@conciv/ai/events` | any | `ChatEvent`; `defineChatEvent(name, schema)` returning `{create, parse}` (zod-validated); our events defined with it: approval asked, run lifecycle, ui answer, code-mode child tool events |
| `@conciv/ai/tools` | any | `defineTool` (on `toolDefinition`), the type extensions author against |
| `@conciv/ai/usage` | any | `UsageSnapshot` and the token-usage mapping |
| `@conciv/ai/session` | browser (Solid) | `createChatSession(...)` returning a `ChatSession`: messages, status, send (with interrupt), stop, queue, cancelQueued, reload, plus ours: pending approvals, stopping, session running, hydrated, refresh, interrupt-and-flush. Built on ai-solid `useChat` and the ai-client transports. ui-kit-chat binds to `ChatSession`, never to `useChat` |
| `@conciv/ai/server` | node | server PRIMITIVES with no conciv dependencies: the turn runner (`chat()` + `withSandbox` + caller-supplied middleware), the gate middleware shape, delivery transports (WebSocket/SSE, resume), run control (run store interface, cancel, durability, locks, queues), code mode, the sandbox definition helpers, the debug logger types. Typed with `@conciv/ai` primitives and generic parameters only |
| `@conciv/ai/adapters` | node | `TextAdapter`, `makeTextAdapter`, and one factory per CLI (`claudeCode`, `codex`, `opencode`, `acp`) with their model lists and permission types. `packages/harness` builds its `chatConfig` from these |
| `@conciv/ai/testkit` | any | fake `ChatSession`, scripted connection, chunk builders (text, reasoning, tool call, approval), used by stories and tests |

Types are named aliases of the library types at first (`type ChatMessage = UIMessage`), owned by
us, so they can diverge later without touching consumers.

## Boundary

- `packages/ai` is the only package with `@tanstack/ai*` in its manifest. Every other manifest
  drops them.
- oxlint `no-restricted-imports` forbids `@tanstack/ai*` outside `packages/ai`, so a new import
  fails lint. Lands with the oxlint 1.90 lane.
- Layering (decided 2026-10-30, after the first move attempt hit a cycle: the chat plane imports
  db, harness, protocol, extension, tools and contract, which all depend on `@conciv/ai`):
  `@conciv/ai` is the bottom layer and depends on nothing in conciv. A new package
  `packages/chat` (`@conciv/chat`) holds the chat orchestration (turns, hydrate, transcript import,
  stop, compaction, boot recovery, gate wiring, approvals, the session bus, the chat stores over
  db's tables). It depends on `@conciv/ai`, db, harness, protocol, extension, tools and contract,
  and imports no `@tanstack/ai*`. `packages/core` keeps the app (sessions, extensions, RPC, the page
  bridge) and wires `createChatPlane` from `@conciv/chat`; it owns no chat internals.
- `packages/protocol` keeps conciv-only vocabulary (session ids, harness capability types, RPC
  shapes) typed with `@conciv/ai` primitives.
- The sandbox policy content (read-only command list, extra allows) is product and stays in core;
  core passes it to the chat plane.

## Order of work

1. Create `packages/ai` with the `messages`, `events`, `tools`, `usage` and `testkit` subpaths. Move
   every type import to them (UI kits, extensions, tools, protocol, apps/conciv, harness-testkit).
   Mechanical, about 250 files.
2. `session`: build `ChatSession`; move `packages/client`'s `useChat` usage and ui-kit-chat's
   `UseChatReturn` onto it.
3. `adapters`: move the CLI adapter construction; `packages/harness` keeps the per-CLI product
   knowledge (history, commands, connect, tty) and builds on `@conciv/ai/adapters`.
4. `server` and `@conciv/chat`: (a) move the chat plane out of core and db into `@conciv/chat`,
   behaviour unchanged, with every `@tanstack/ai` call it makes going through new
   `@conciv/ai/server` primitives; (b) implement the approvals spec
   (`2026-10-29-approvals-deny-and-retry.md`) in `@conciv/chat` on those primitives.
5. Drop `@tanstack/ai*` from every other manifest; turn on the lint rule.

Steps 1 to 3 run in parallel lanes. Step 4 depends on 1. Step 5 is last.

## Acceptance

- `git grep "from '@tanstack/ai"` outside `packages/ai` returns nothing; lint rule active.
- The product acceptance list from the chat-plane inventory holds (CLI gate, resume, slash
  commands, image input, compaction; transcript import without duplicates; approvals per the
  approvals spec; `conciv_ui`; queue/steer/remove and cancel-with-queue; stop with the stopping
  phase and the run clock; first-chunk timeout; compact and dividers; sessions; drafts; context
  meter; extension tools through code mode and the external MCP; extension hooks and attachment
  expanders; transport setting; boot recovery). Pinned by the existing core ITs, apps/conciv
  browser tests, and the calm contract and perf gates, which move to `@conciv/ai/testkit`.
- `@conciv/ai` passes publint and attw; `PUBLIC_PACKAGES` lists it.

## Package shape (user, 2026-10-30, supersedes the subpath table above)

A package has one entry file, or two or three when needed: the runtime entry, a backend entry, a
test entry. The `src/` root holds those entry files and nothing else; internals live in folders
named by concern. Exports are an explicit list, never `"./*"`.

- `@conciv/ai`: `.` (isomorphic: messages, events, tools, usage), `./server` (node: the turn runner,
  gate, delivery, run control, code mode, sandbox helpers, and the CLI adapters), `./testkit`
  (browser-safe: fake session, scripted connection, chunk builders). Internals in
  `src/messages/`, `src/events/`, `src/server/`, `src/adapters/` and so on.
- `@conciv/chat`: `.` (`createChatPlane` and the named functions core needs), `./testkit` (the node
  turn helpers: `socketTurn`, `serverSentEventsTurn`, `serverSentEventsJoin`, `toolTurn`,
  `connectMcpClient`, `foldChatEvents`, `reconstructThread`). Internals in `turn/`, `approvals/`,
  `code-mode/`, `history/`, `stores/`, `delivery/`, `runtime/`.
- Tests that exercise chat internals live in `packages/chat/test`, not in core. The persistence
  conformance suite (imports vitest) lives in `packages/chat/test`, not in a testkit.
- No hand-rolled primitives where the platform has one: `ReadableStream` replaces the async queue.
- `@conciv/ai`'s `session` (step 2) is browser-only Solid; where it lands is decided at step 2
  without adding a fourth entry unless the user agrees.

## Decisions (user, 2026-10-30)

1. The chat plane moves out of core. Superseded in shape by the layering above: it lands in
   `@conciv/chat` on `@conciv/ai/server` primitives, not inside `@conciv/ai`.
2. `packages/harness` builds on `@conciv/ai/adapters`. No exception to the boundary rule.
