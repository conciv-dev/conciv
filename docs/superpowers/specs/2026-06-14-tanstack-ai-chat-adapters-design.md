# TanStack AI `chat()` + Harness Adapters — Design Spec

Date: 2026-06-14
Status: Draft — awaiting user review

## Summary

conciv currently uses `@tanstack/ai` for types (`StreamChunk`, `UIMessage`,
`MessagePart`, `EventType`) and `toServerSentEventsStream` only. The chat turn in
`packages/core/src/api/chat/turn.ts` hand-rolls the pipeline: spawn the harness
CLI, decode its stdout into AG-UI `StreamChunk`s, merge the uiBus, serialize SSE.

This spec makes conciv **fully use `@tanstack/ai`'s `chat()`** as the turn
orchestrator, with each harness wrapped as a `TextAdapter`, and conciv's own tools
(`ui` / `page` / `test`) expressed as real `@tanstack/ai` `toolDefinition().server()`
functions, exposed to the harness CLI via an in-process **MCP-over-HTTP** server.

`chat()` adds no dependency (it ships in `@tanstack/ai`, already present). The
only new dependency is `@modelcontextprotocol/sdk` for the `/api/mcp` server
(user-approved).

## Decisions (locked with user)

- **CLI-only. No model-provider fallback.** A harness CLI must be on `PATH` (as
  today). `chat()` is the stream orchestrator, not a tool executor: its `tools`
  param is never populated for the CLI path. There is no `anthropicText` /
  no-CLI branch.
- **Tools execute inside the CLI via MCP, not in `chat()`'s agent loop.** A
  coding CLI owns its own iteration and tool execution. The faithful, measured
  realization of "conciv tools in the loop" is: conciv tools are MCP tools the CLI
  calls natively; the handlers run server-side in core's process.
- **`@conciv/tools` is a new package** holding the tool registry.
- **`/api/mcp` uses `@modelcontextprotocol/sdk`** (new, user-approved dependency)
  for the streamable-HTTP MCP server, rather than hand-rolling the JSON-RPC.
- **Full Bash→MCP replacement.** The `Bash(conciv ui:*)` / `Bash(conciv tools:*)`
  `--allowedTools` entries are dropped from the claude args, and the bundled
  `react-introspection` skill is rewritten to reference the MCP tools
  (`conciv_ui`, `conciv_page`, …) instead of instructing `conciv` CLI invocations. One
  clean tool path; no dual Bash+MCP period.
- **Complete adapter, not a stub.** `HarnessTextAdapter extends BaseTextAdapter`
  (built via the `harnessText(harness, deps)` factory), fully typed and
  logger/abort/id-aware, modeled on `@tanstack/ai-ollama`. `structuredOutput` is a
  typed `NotSupported` throw (an honest capability gap — a coding CLI has no native
  schema mode; conciv never calls it). The class is a **justified, narrow exception
  to functions-not-classes**: the `TextAdapter` interface's `'~types'.systemPromptMetadata`
  is typed `never` (uninhabited), so a plain object cannot satisfy it without a cast,
  and the no-casts rule forbids that — extending the library's `BaseTextAdapter` is the
  only cast-free, library-intended path.
- **Harness-agnostic invariant:** `chat()` and the `harnessText` factory know
  nothing about any particular CLI. All harness specifics (argv, `--mcp-config`,
  stdout decode, input delivery) live inside the `HarnessAdapter` data
  (`claude`, `codex`, …). Swapping harnesses changes only which adapter is passed in.
- **Image input — absorb the chat-image-input server-half.** The adapter carries
  image content parts (`lastUserImages`) and delivers them per a new
  `imageInput: 'native' | 'fileRef' | false` capability via an optional
  `deliverInput` harness hook. claude = `'native'` (a stream-json user message on
  stdin). The composer/widget UI half stays in the chat-image-input plan. So the
  adapter is image-complete from day one, not text-only.
- **`@tanstack/ai-mcp` is test-only.** It is an MCP _client_ (for `chat()` to
  consume external servers). In the CLI-only path the _CLI_ is the MCP client, so
  `chat()` never uses it; we use it only in integration tests to drive `/api/mcp`.
  The MCP _server_ is `@modelcontextprotocol/sdk`'s `WebStandardStreamableHTTPServerTransport`
  (web `Request`→`Response`, no node-object bridge).

## Why not the alternatives (measured)

A spike drove real `claude` 2.1.177 two ways:

|                        | B-via-MCP (this design)             | Pure-B (resume per tool call)                                                 |
| ---------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| Tool exec              | JS handler runs inline, one process | kill + `--resume` = fresh turn per call                                       |
| Process / transcript   | 1 process, 1 session, 1 transcript  | N processes, transcript replayed each hop                                     |
| Per-tool-call overhead | ~0 (model-thinking-bound)           | +2.2–3.5s wall, cold start each hop                                           |
| Cost                   | one bill                            | resume re-bills transcript ($0.12 → $0.25 on a trivial resume; grows per hop) |

`claude -p` has no "exit turn on this tool call, resume later" primitive — the
only way a call leaves the process unexecuted is MCP, which blocks in place. So
pure-B (driving `chat()`'s `agentLoopStrategy` literally) is both fragile and
strictly dominated. B-via-MCP was validated: the spike's JS handler ran two tool
calls inline under one pid, one session, one transcript.

## Architecture

```
                    @conciv/tools  (NEW)
        tanstack/ai toolDefinition().server() registry
        conciv_ui · conciv_page · conciv_test
                    │ handlers bridge to uiBus / pageBus / testRunner
                    ▼
        core /api/mcp  (NEW)  — MCP-over-HTTP, in-process
                    │ exposed to the CLI via --mcp-config {type:http,url:/api/mcp}
                    ▼
        harness CLI (claude | codex | …)  — owns iteration; calls conciv_* via MCP
                    │ stdout NDJSON
                    ▼
        harnessText(harness, deps)  (NEW)  — generic over any HarnessAdapter
        chatStream = spawn(harness.buildArgs) → harness.decode
                    │ AsyncIterable<StreamChunk>  (emits RUN_STARTED…RUN_FINISHED — mandatory)
                    ▼
        chat({adapter, messages, systemPrompts, abortController})  — harness-agnostic
        passes lifecycle through + middleware + message conversion + threadId/runId
                    │
                    ▼
        uiBus.run merge → toServerSentEventsStream → SSE  (as today)
```

### Layering (the harness-agnostic invariant)

```
chat(options)                    ← only sees the TextAdapter interface
  → adapter.chatStream(opts)
harnessText(harness, deps) ← generic; calls harness.buildArgs / harness.decode
  → harness.buildArgs / decode
claude | codex HarnessAdapter    ← the ONLY place CLI specifics live (exists today)
```

`turn.ts` resolves the configured harness, builds
`harnessText(harness, deps)`, and hands it to `chat()`. `chat()` never
branches on harness; the factory never hardcodes a CLI — the harness is data.

## Components

- **`@conciv/tools`** (new package): `toolDefinition().server()` registry
  (`conciv_ui`, `conciv_page`, `conciv_test`). Handlers receive a typed `context`
  (handles to `uiBus` / pageBus / testRunner). Pure tool logic — no transport,
  no CLI knowledge. Reusable by the MCP server.
- **`/api/mcp`** (new core route): MCP-over-HTTP (streamable-http) server built
  on `@modelcontextprotocol/sdk`, exposing the `@conciv/tools` registry.
  In-process, so handlers reach `uiBus` directly. Replaces the `conciv ui` /
  `conciv tools` Bash shell-out path (the `--allowedTools` Bash entries are
  removed from the claude args).
- **`HarnessTextAdapter` + `harnessText(harness, deps)`** (new): a _complete_
  adapter, not a stub. Modeled on `@tanstack/ai-ollama`'s from-scratch adapter,
  since Ollama wraps a local process — the closest analog to wrapping a CLI.
  `class HarnessTextAdapter extends BaseTextAdapter` (`@tanstack/ai/adapters`),
  cast-free; `harnessText()` is a thin factory function returning an instance.
  - `class HarnessTextAdapter extends BaseTextAdapter<string, Record<string, never>,
InputModalities, MsgMeta>` — type params from the existing
    `HarnessCapabilities` (+ the image-input capability from the
    chat-image-input spec): `InputModalities = ['text']` or `['text','image']`;
    tool capabilities empty (the CLI owns its tools; `chat().tools` is unused).
  - `kind: 'text'`, `name: harness.id`, `model: harness.id`.
  - `chatStream(options)`: - `options.logger.request(...)` before spawn; `logger.errors(...)` on throw
    (matches the adapter logger contract). - derive a `HarnessTurn` from `options.messages` (`lastUserText` /
    multimodal content) + `normalizeSystemPrompts(options.systemPrompts)`
    mapped to the CLI's file/flag per capability (the logic in `turn.ts`
    lines 47–56 moves here) + resume session id. - spawn `harness.buildArgs(turn)` (incl. `--mcp-config`), wire
    `options.abortController?.signal` → `child.kill()`. - `yield* harness.decode(linesOf(child.stdout), {onSessionId, runId:
options.runId, threadId: options.threadId, logger: options.logger})`.
  - `structuredOutput()`: a coding CLI has no native schema-constrained mode.
    Implemented as a **typed `NotSupported` throw** — an honest capability gap,
    not a stub. conciv's chat turns never invoke it. (Decision locked with user.)

### Adapter contract compliance (verified against source)

`docs/chat-architecture.md#adapter-contract` mandates per `chatStream`:
`RUN_STARTED` (once, first) → content blocks → `RUN_FINISHED | RUN_ERROR`
(once, last). conciv's `runAgui` already follows this. Specific rules to honor,
all already met or trivial:

- `TEXT_MESSAGE_CONTENT.delta` must be **non-empty** — guard empty deltas in the
  emitters.
- `TOOL_CALL_START.toolName` non-empty, `toolCallId` globally unique (claude's
  `tool_use.id` satisfies this).
- `TOOL_CALL_END` carries `input` only, **never `result`** (reserved for the
  engine). conciv already delivers the CLI's own tool results via the separate,
  spec-compliant `TOOL_CALL_RESULT` event (`processor.ts:1220` — "the
  spec-compliant path for delivering tool results to the client"), so no CLI or
  decode change is needed.
- `finishReason: 'stop'` (conciv never wants the engine to execute tools).
- **`turn.ts`**: the hand-rolled pipeline becomes
  `chat({adapter, messages, systemPrompts, abortController})` →
  `uiBus.run` merge → `toServerSentEventsStream`.

## Contract changes (`@conciv/protocol/harness-types`)

- `HarnessCapabilities` gains `mcp: 'http' | 'stdio' | 'none'`.
- `HarnessTurn` gains `mcpUrl?: string` (injected like `permissionUrl` today).
- `HarnessArgsBuilder` adds `--mcp-config` (with `{type:'http', url: mcpUrl}`)
  when `mcpUrl` is present and `capabilities.mcp === 'http'`.
- **Lifecycle stays in the adapter (verified against v0.28 source).** The
  `@tanstack/ai` adapter contract _requires_ `chatStream` to emit `RUN_STARTED` /
  `RUN_FINISHED` — the engine's stream processor depends on `RUN_FINISHED`
  (`activities/chat/stream/processor.js`: "Why RUN_FINISHED is mandatory"). In
  the plain streaming path (no `tools`, no `outputSchema` — conciv's CLI-only
  case), the engine passes the adapter's chunks straight through middleware
  (`activities/chat/index.js:376–436`); it does not prepend its own pair, so
  there is exactly one `RUN_STARTED`/`RUN_FINISHED` per turn and no doubling.
  Therefore `runAgui` in `packages/harness/src/_shared/agui.ts` keeps emitting
  lifecycle. The adapter wiring: the `HarnessDecoder` opts (and `runAgui`) gain
  `runId` / `threadId` / `logger`, so `runAgui` emits lifecycle with the ids
  `chat()` supplies (not the hardcoded `'conciv-chat'` / `'conciv-run'`) and calls
  `logger.provider(...)` per chunk, matching the adapter logger contract.
- `HarnessDecoder` signature gains `runId?`, `threadId?`, `logger?` in its opts
  object alongside the existing `onSessionId`.

## Data flow (one chat turn)

1. POST `/api/chat` → resolve harness → `adapter = harnessText(harness, deps)`.
2. `chat({adapter, messages, systemPrompts, abortController})` calls
   `adapter.chatStream(opts)`; the adapter emits `RUN_STARTED` (with the
   `chat()`-supplied `runId`/`threadId`), which `chat()` passes through.
3. `chatStream` derives the `HarnessTurn` from `opts`, spawns the CLI with
   `--mcp-config {type:http, url:${origin}/api/mcp}`, decodes stdout → `StreamChunk`s.
4. Mid-turn the CLI calls `mcp__conciv__conciv_ui`; core's `/api/mcp` handler runs the
   tool against `uiBus` and returns inline. The CLI continues. One process, one
   transcript.
5. decode chunks flow through `chat()` → `uiBus.run` merge →
   `toServerSentEventsStream` → SSE. `chat()` emits `RUN_FINISHED`.

## Error handling / abort / lock

- `chat()` receives an `abortController`; `event.req.signal` → `abort()` +
  `child.kill()` (as today).
- Lock acquire/release unchanged — still one lock per turn, because there is one
  process (no resume gymnastics).
- MCP handler errors return an MCP error result → the CLI sees a tool failure,
  not a crashed turn.
- No CLI on `PATH` → the turn errors as today. There is no fallback.

## Testing

Repo convention — integration only, real processes, no mocks (`*.it.test.ts`):

- **MCP tool round-trip**: real `claude` calls real `/api/mcp` `conciv_ui`; assert
  `uiBus` observed the inject. (Productionizes the spike.)
- **Single run lifecycle**: a `chat()` turn yields exactly one `RUN_STARTED` /
  `RUN_FINISHED` pair (the adapter emits them, `chat()` passes them through with
  no doubling), and the pair carries the `chat()`-provided `threadId` / `runId`.
- **Harness-agnostic**: the same `harnessText` + `chat()` path drives a
  second harness (codex stub or real) with no core changes.

## Scope / sequencing

- This spec covers all harnesses; implementation sequences **claude first**.
- claude/codex get `mcp: 'http'`; the gemini-cli / opencode / pi stubs stay
  `mcp: 'none'` and keep working unchanged.
- Tools migrated to `@conciv/tools` + `/api/mcp`: start with `conciv_ui` (smallest,
  already validated in the spike), then `page` and `test`. As each tool moves,
  drop its `Bash(conciv …:*)` `--allowedTools` entry and update the
  `react-introspection` skill text to reference the MCP tool.

## Non-goals

- Model-provider fallback / no-CLI operation.
- `chat()`'s agent loop executing tools (`tools` param stays empty for CLI path).
- Driving `chat()`'s `agentLoopStrategy` as the literal iteration driver (pure-B).
- Removing the `@conciv/cli` package or its non-tool commands (`server` / `open`);
  only the agent-facing `ui` / `page` / `test` tool invocations move from Bash
  to MCP.
