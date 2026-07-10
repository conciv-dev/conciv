# Widget Rewrite Plan 2.5/4: Gen-UI → Native Blocking `conciv_ui` Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the invented gen-UI custom-event lane (`CONCIV_UI_EVENT`, `uiBus.inject`, `POST /api/chat/ui`, the `conciv ui` CLI, the `UiSpec` wire schema) and replace it with the native TanStack AI tool lane: `conciv_ui` becomes a BLOCKING server tool whose result IS the user's answer, delivered via a new `chat.uiReply` oRPC procedure. Also deleted (user decision 2026-07-10, second lock): the `CONCIV_USAGE_EVENT` custom event (duplicates native `RUN_FINISHED.usage` + the `sessions.live` row) and the `CONCIV_TOOL_DURATION_EVENT` lane (`aguiToolDurationFor` + `timed()` + `uiBus.injectChunk` — producer-broken on the claude bridge lane, which passes no `toolCallId` to execute). After this plan the ONLY custom event on the wire is `approval-requested` — which is TanStack's OWN client convention (their stream processor natively maps it onto `ToolCallPart.state 'approval-requested'`, verified at `@tanstack/ai` `dist/esm/activities/chat/stream/processor.js:1144`).

**Architecture:** `conciv_ui` stays a plain TanStack `toolDefinition().server(execute)` — but `execute` now pends on a core-side ask registry (`makeUiAsks`) until the user answers or a graceful timeout fires, mirroring the permission gate's `makePending` pattern. The client renders the pending question from the native `ToolCallPart` by `part.name` (existing tool-ui convention) and answers with `chat.uiReply({sessionId, toolCallId, value})`. Correlation between the pending `execute` (which has no toolCallId on the MCP-bridge lane) and the stream's `TOOL_CALL_START` is FIFO-per-session inside a `uiBus.run` chunk observer. Reload mid-question re-renders from the turn replay / `MESSAGES_SNAPSHOT` (plan 2 Task 2) with zero client bookkeeping.

**Tech Stack:** `@tanstack/ai` 0.40.0 (toolDefinition, EventType, StreamChunk), oRPC 1.14.7 contract-first, zod, hono, vitest, `@conciv/harness-testkit` real-server fixtures.

**Spec:** `docs/superpowers/specs/2026-07-09-widget-orpc-rewrite-design.md` (v3.3 as amended; this plan implements the user decision of 2026-07-10 superseding spec change 6's custom lane). **Sequencing (HARD):** this plan EXECUTES AFTER plan 2 (`2026-07-10-widget-rewrite-2-client.md`) has fully landed — Task 2 of plan 2 rewrites `aguiSnapshotFor` to `MESSAGES_SNAPSHOT` and this plan's ui-types edits assume that shape. If `packages/protocol/src/ui-types.ts` still contains `CONCIV_SNAPSHOT_EVENT`, STOP: plan 2 has not been executed. Plan 3 is authored after both and renders tool parts with zero demux.

## Global Constraints

- Functions, not classes. ZERO code comments in TS. No `any`/`as`/non-null `!`. No IIFEs. No `else` where an early return works. oxfmt style (no semicolons, single quotes, no bracket spacing).
- Tests live under `test/`, NEVER `src/`. No test-only APIs in prod code. NO doubles/shims — real served core apps via `@conciv/harness-testkit`, real typed oRPC clients, wire-level ITs. The only injected leaves are the `ConcivToolContext` closures (the unit's real contract, same as today) and the `BootApp` leaf.
- Build/typecheck via turbo: `pnpm turbo run build --filter=<pkg>`, `pnpm typecheck`. Commit with pathspec always: `git commit -m "..." -- <paths>`.
- BREAK OLD STUFF FREELY mid-plan; only Task 8's gates bind. Known red that does NOT gate: `packages/core/test/api/mcp/claude-image.it.test.ts` (pre-existing live-LLM flake).
- `pnpm exec fallow audit --changed-since main --format json` clean of INTRODUCED findings before finishing; cyclomatic complexity ≤ 4 on new functions. Before deleting anything fallow flags, verify with `pnpm exec fallow dead-code --trace 'file.ts:Symbol'`.
- NO new npm dependencies anywhere in this plan.
- Approvals stay HYBRID — do not touch `makePermissionGate`, `APPROVAL_REQUESTED_EVENT`, `chat.permissionDecision`, or `--permission-prompt-tool` plumbing. Verified 2026-07-10: our approval event payload `{toolCallId, toolName, input, approval: {id}}` is EXACTLY what TanStack's client processor natively consumes (`processor.js:1144`) — the display side is already fully native; only the decision RPC is ours, necessarily (their `addToolApprovalResponse` re-sends the turn from the client, which cannot drive a claude CLI blocked mid-permission).
- Usage + tool-duration custom events DIE in this plan (Task 7): plan 3 reads usage from `sessions.live` (the row already carries `UsageSnapshot` and pulses on every finish) and derives live tool durations client-side.

## Verified API facts (2026-07-10, against installed node_modules + real files — do NOT re-derive)

- `@anthropic-ai/claude-agent-sdk` 0.3.179 (`sdk.d.ts`): `MCP_TOOL_TIMEOUT` env — "Hard wall-clock limit per call; progress notifications do not extend it. Values below 1000ms are ignored." The claude CLI honors the same env. `@tanstack/ai-claude-code` 0.2.1 spawns the CLI with `env: {IS_SANDBOX: '1', ...adapterConfig.env}` (`dist/esm/adapters/text.js`), and our `claudeChatConfig` passes `env: definedEntries(deps.env)` — so the env set in `packages/harness/src/claude/chat.ts` reaches the CLI process.
- Two execution lanes share `concivTools(ctx)`: (1) in-process `chat()` server tools via `buildChatTools` (`packages/core/src/api/chat/chat-tools.ts` — execute context DOES carry `toolCallId`), and (2) the TanStack MCP tool bridge: `@tanstack/ai-sandbox` 0.2.2 `dist/esm/tool-bridge.js` `callTool` invokes `tool.execute(args, {context, abortSignal, emitCustomEvent})` — NO toolCallId. The claude CLI's `TOOL_CALL_START` in the translated stream carries the CLI's own tool_use id. Hence FIFO stream-observer correlation is REQUIRED; per-session FIFO is safe because a session runs at most one turn (`hub.generating` + lock) and the CLI executes tool calls in emission order.
- The bridge would throw `Unknown tool` for an execute-less definition and TanStack client tools / `addToolApprovalResponse` require the client to re-run the turn — which is why the native client-tool lane CANNOT carry this (same finding that made approvals hybrid). A blocking server tool is the correct TanStack-native seam.
- `chat()`'s agent loop executes REAL server tools against scripted `TOOL_CALL_*` chunks: `makeScriptedRun.scriptToolCall` emits `TOOL_CALL_START/ARGS/END` + `RUN_FINISHED {finishReason: 'tool_calls'}` and the existing green IT `packages/core/test/rpc/wire.it.test.ts` "tool durations ride the turn stream after a real in-stream tool call" proves the loop runs `conciv_open` for real. `conciv_ui` gets the same treatment with zero doubles.
- `ToolCallPart` (`@tanstack/ai` 0.40.0 `dist/esm/types.d.ts:259`): `{type: 'tool-call', id, name, arguments: string, state: ToolCallState, output?}`. `EventType.TOOL_CALL_START/ARGS/END/RESULT` all exist; `TOOL_CALL_START` chunks carry `toolCallId` + `toolCallName` (scripted-run sets both `toolCallName` and `toolName` and typechecks).
- `ctx.injectUi` has exactly ONE consumer (`packages/tools/src/server.ts` `concivUiServerTool`); NO extension uses it; the `UiVitest` spec kind is producer-less; `ConcivToolContext.injectUi` dies with nothing else to migrate.
- `conciv ui` references outside code: `packages/cli/README.md`, `packages/cli/package.json` description, `apps/site/content/docs/cli.mdx` (`## conciv ui` section), `packages/core/test/command-policy.test.ts:15`.
- `makePending` (`packages/core/src/pending.ts`) is the settle-once + timeout pattern to mirror; `page.reply`'s `UNKNOWN_REQUEST` (`packages/contract/src/contract.ts:60`, router `pageBus.resolve` guard) is the typed-error pattern for `chat.uiReply`.
- Plan-2 signatures this plan consumes (verify they landed before starting): `aguiSnapshotFor(messages: ChatHistory)` emitting `MESSAGES_SNAPSHOT`; `wire.it.test.ts` asserting `types[0] === EventType.MESSAGES_SNAPSHOT`; harness-testkit exports unchanged for `createTestHarness`/`Kit`.

## Locked public API (user-reviewed 2026-07-10 — do not deviate without a new review)

Locked decisions: (1) 120s blocking window (`UI_ASK_TIMEOUT_MS = 120_000`, approval parity), MCP_TOOL_TIMEOUT `150000` for margin; (2) answer value typed per TanStack convention via zod outputSchema — `string | Record<string, string>`; (3) `concivUiToolDef` gets `outputSchema: UiAnswerSchema`; (4) schemas live in `@conciv/protocol/ui-types` (shared home — tools, contract, core all already depend on protocol).

```ts
// @conciv/protocol/ui-types (additions; the UiSpec lane below is DELETED in Task 7)
export const UiInputSchema: z.ZodObject     // kind enum choices|confirm|diff|form + today's optional fields
export const UiAnswerValueSchema = z.union([z.string(), z.record(z.string(), z.string())])
export const UiAnswerSchema = z.union([
  z.object({answered: z.literal(true), value: UiAnswerValueSchema}),
  z.object({answered: z.literal(false), note: z.string()}),
])
export type UiInput / UiAnswerValue / UiAnswer

// @conciv/tools
export const concivUiToolDef  // toolDefinition({name: 'conciv_ui', inputSchema: UiInputSchema, outputSchema: UiAnswerSchema, description: blocking})
export type ConcivToolContext = {askUi: () => Promise<UiAnswer>; page; open}   // injectUi DELETED

// @conciv/core src/runtime/ui-asks.ts (new)
export const UI_ASK_TIMEOUT_MS = 120_000
export type UiAsks = {
  ask: (sessionId: string, timeoutMs: number) => Promise<UiAnswer>
  observe: (sessionId: string, chunk: StreamChunk) => void
  reply: (sessionId: string, toolCallId: string, value: UiAnswerValue) => boolean
  endTurn: (sessionId: string) => void
}
export function makeUiAsks(): UiAsks

// @conciv/core src/runtime/ui-bus.ts
export function makeUiBus(opts?: {onChunk?: (sessionId: string, chunk: StreamChunk) => void}): UiBus
// UiBus.inject AND injectChunk DELETED (Task 7 — durations were injectChunk's last consumer); injectApproval/setModel/getModel/run unchanged

// @conciv/contract
chat.uiReply: oc.errors({UNKNOWN_REQUEST: {message: 'no pending ui question'}})
  .input(SessionIdInput.extend({toolCallId: z.string(), value: UiAnswerValueSchema}))
  .output(Ok)
// RpcDeps gains: uiReply: (sessionId: string, toolCallId: string, value: UiAnswerValue) => boolean

// @conciv/harness-testkit
RunEvents.toolCalls: (name?: string) => SeenToolCall[]          // replaces uiSpecs
RunStream.waitForToolCall: (name: string, opts?: {hangGuardMs?: number}) => Promise<SeenToolCall>  // replaces waitForUiSpec
export type SeenToolCall = {toolCallId: string; name: string; input: unknown}

// claude harness chat.ts
env: definedEntries({MCP_TOOL_TIMEOUT: '150000', ...deps.env})  // caller env wins
```

**Deletions ledger (Task 7 executes; earlier tasks must not add new consumers):** `CONCIV_UI_EVENT` + `aguiCustomFor` + `parseUiSpec` + `parseField` + `buildUiSpec` + `UiBuildInput` + `UiSpecSchema` and all `Ui{Choices,Confirm,Diff,Form,Vitest}Schema` + their types (`UiFormFieldSchema`/`UiFormField` SURVIVE — `UiInputSchema.fields` reuses them); `uiBus.inject` AND `uiBus.injectChunk` (last consumer is the duration wrapper); `POST /api/chat/ui` (the whole Hono app in `turn.ts` + its mount chain through `chat.ts` into `app.ts`); `packages/cli/src/ui.ts` + `bin.ts` registration + README/package-description/docs mentions; the `conciv ui` allow in `command-policy.ts:27` + its test pin; testkit `waitForUiSpec`/`uiSpecs`; the wire IT "gen-ui custom events injected mid-turn replay to a late attach" (superseded by Task 5's tool-part replay IT, which re-points plan-1 Task 10's pin); `CONCIV_USAGE_EVENT` + `aguiUsageFor` (`packages/protocol/src/usage-types.ts:56-58` — `UsageSnapshotSchema`/`tokenUsageToSnapshot` SURVIVE, the row + store update use them) + the `yield aguiUsageFor(usage)` in `turn.ts` (the `store.update(sessionId, {usage})` beside it SURVIVES — it is what pulses `sessions.live`); the whole `packages/protocol/src/tool-timing.ts` module + its tsdown/package-exports entries + `aguiToolDurationFor` + the `timed()` wrapper and `injectChunk` parameter in `packages/core/src/api/chat/chat-tools.ts` + the wire IT "tool durations ride the turn stream after a real in-stream tool call" (Task 5's blocking IT supersedes it as the proof that `chat()` executes real conciv tools against scripted `TOOL_CALL_*` chunks).

**Plan-3 seam (design note, no code here):** the client renders a pending question from `ToolCallPart` where `part.name === 'conciv_ui'` and `part.state` is not yet complete — typed input via `UiInputSchema.parse(JSON.parse(part.arguments))`; answering calls `utils.chat.uiReply.mutationOptions()`. Reload mid-question re-renders the same part from the attach replay. No custom events, no demux, no keyed render buffer.

**Explicit non-goal (coverage finding CF5, accepted 2026-07-10):** launched/TTY agent sessions get NO blocking-UI lane. They call `conciv_ui` via `/api/mcp` directly (`launch.ts` sets `mcpUrl`; `mcp.ts:51` executes with no turn stream), so `askUi` pends unpaired and returns the graceful `{answered: false}` after 120s — correct behavior there: a TTY user answers in the terminal, and the old lane was already a near-no-op for launched sessions (`uiBus.inject` returned `injected: false` without a live in-process chat channel). If a real cross-process UI need appears, it is a later-phase feature, not a regression.

---

### Task 1: Claude harness caps the blocking window (`MCP_TOOL_TIMEOUT`)

The plan's open risk, verified first: the claude CLI kills an MCP tool call at `MCP_TOOL_TIMEOUT`; if that fires BEFORE our graceful `{answered: false}` timeout, the model sees a tool ERROR instead of the parity result. Cap order must be `UI_ASK_TIMEOUT_MS (120s) < MCP_TOOL_TIMEOUT (150s)`.

**Files:**

- Modify: `packages/harness/src/claude/chat.ts:62`
- Test: `packages/harness/test/claude-chat-config.test.ts`

**Interfaces:**

- Consumes: `definedEntries` from `packages/harness/src/_shared/env.ts`; `claudeCodeText` config `env` passthrough (verified fact above).
- Produces: every claude chat turn's CLI process runs with `MCP_TOOL_TIMEOUT=150000` unless the caller's `deps.env` overrides it. Task 3's `UI_ASK_TIMEOUT_MS = 120_000` relies on this margin.

- [ ] **Step 1: Re-confirm the SDK honors the env (verification, no code)**

Run: `rg -o "MCP_TOOL_TIMEOUT.{0,150}" "$(find node_modules/.pnpm -maxdepth 1 -name '@anthropic-ai+claude-agent-sdk@*' | head -1)/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts" | head -3`
Expected: doc text "Hard wall-clock limit per call … Values below 1000ms are ignored". If ABSENT, stop and re-derive the timeout mechanism before proceeding.

- [ ] **Step 2: Write the failing test**

Append to `packages/harness/test/claude-chat-config.test.ts` (inside `describe('claudeChatConfig')`, reusing its `deps()` helper):

```ts
it('caps MCP tool calls above the 120s ui-ask window so blocking conciv_ui times out gracefully first', () => {
  const config = claudeChatConfig(deps())
  expect(Reflect.get(config.adapter, 'adapterConfig')).toMatchObject({env: {MCP_TOOL_TIMEOUT: '150000'}})
})

it('caller env wins over the MCP_TOOL_TIMEOUT default', () => {
  const config = claudeChatConfig(deps({env: {MCP_TOOL_TIMEOUT: '999000'}}))
  expect(Reflect.get(config.adapter, 'adapterConfig')).toMatchObject({env: {MCP_TOOL_TIMEOUT: '999000'}})
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @conciv/harness exec vitest run test/claude-chat-config.test.ts`
Expected: FAIL — `env` object has no `MCP_TOOL_TIMEOUT`.

- [ ] **Step 4: Implement**

In `packages/harness/src/claude/chat.ts`, add above `claudeChatConfig`:

```ts
const MCP_TOOL_TIMEOUT_MS = 150_000
```

and change the adapter `env` line to:

```ts
env: definedEntries({MCP_TOOL_TIMEOUT: String(MCP_TOOL_TIMEOUT_MS), ...deps.env}),
```

(Read `packages/harness/src/_shared/env.ts` first: `definedEntries` takes `NodeJS.ProcessEnv`-shaped input and drops undefined values — the spread-over-default gives the caller the win. If its parameter type rejects the literal, widen the literal's construction, never cast.)

Other harnesses (codex/gemini/opencode/pi) get no timeout work here — claude is the shipped harness; note their MCP-timeout parity as backlog in the commit body if desired, not in code.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @conciv/harness exec vitest run && pnpm --filter @conciv/harness typecheck`
Expected: PASS / exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/harness
git commit -m "feat(harness): claude MCP_TOOL_TIMEOUT=150s caps the blocking ui-ask window" -- packages/harness
```

---

### Task 2: Protocol — `UiInputSchema` + `UiAnswerSchema` (pure addition)

**Files:**

- Modify: `packages/protocol/src/ui-types.ts` (additions only — deletions are Task 7)
- Test: `packages/protocol/test/ui-types.test.ts`

**Interfaces:**

- Consumes: `UiFormFieldSchema` (already in the file), zod.
- Produces: `UiInputSchema`, `UiAnswerValueSchema`, `UiAnswerSchema`, `UiInput`, `UiAnswerValue`, `UiAnswer` — consumed by Tasks 3 (core), 4 (tools), 5 (contract).

- [ ] **Step 1: Write the failing test**

Append to `packages/protocol/test/ui-types.test.ts` (keep the existing snapshot/approval cases — plan 2 already rewrote them):

```ts
import {UiAnswerSchema, UiAnswerValueSchema, UiInputSchema} from '../src/ui-types.js'

describe('blocking conciv_ui schemas', () => {
  it('UiInputSchema accepts each kind with its fields', () => {
    expect(UiInputSchema.parse({kind: 'choices', question: 'theme?', options: ['light', 'dark']}).kind).toBe('choices')
    expect(UiInputSchema.parse({kind: 'confirm', question: 'run?', detail: 'pnpm build'}).kind).toBe('confirm')
    expect(UiInputSchema.parse({kind: 'diff', file: 'a.ts', before: 'x', after: 'y'}).kind).toBe('diff')
    expect(UiInputSchema.parse({kind: 'form', fields: [{name: 'path', label: 'Path', type: 'text'}]}).kind).toBe('form')
    expect(UiInputSchema.safeParse({kind: 'vitest'}).success).toBe(false)
  })

  it('UiAnswerValueSchema is a string or a string record, nothing else', () => {
    expect(UiAnswerValueSchema.parse('yes')).toBe('yes')
    expect(UiAnswerValueSchema.parse({path: '/docs'})).toEqual({path: '/docs'})
    expect(UiAnswerValueSchema.safeParse(42).success).toBe(false)
    expect(UiAnswerValueSchema.safeParse({n: 42}).success).toBe(false)
  })

  it('UiAnswerSchema is the answered/unanswered union', () => {
    expect(UiAnswerSchema.parse({answered: true, value: 'yes'})).toEqual({answered: true, value: 'yes'})
    expect(UiAnswerSchema.parse({answered: false, note: 'timed out'})).toEqual({answered: false, note: 'timed out'})
    expect(UiAnswerSchema.safeParse({answered: true}).success).toBe(false)
    expect(UiAnswerSchema.safeParse({answered: false, value: 'yes'}).success).toBe(false)
  })
})
```

Run: `pnpm --filter @conciv/protocol exec vitest run test/ui-types.test.ts`
Expected: FAIL — no such exports.

- [ ] **Step 2: Implement**

Append to `packages/protocol/src/ui-types.ts`:

```ts
export const UiInputSchema = z.object({
  kind: z.enum(['choices', 'confirm', 'diff', 'form']),
  question: z.string().optional(),
  detail: z.string().optional(),
  options: z.array(z.string()).optional(),
  file: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  title: z.string().optional(),
  fields: z.array(UiFormFieldSchema).optional(),
})

export const UiAnswerValueSchema = z.union([z.string(), z.record(z.string(), z.string())])

export const UiAnswerSchema = z.union([
  z.object({answered: z.literal(true), value: UiAnswerValueSchema}),
  z.object({answered: z.literal(false), note: z.string()}),
])

export type UiInput = z.infer<typeof UiInputSchema>
export type UiAnswerValue = z.infer<typeof UiAnswerValueSchema>
export type UiAnswer = z.infer<typeof UiAnswerSchema>
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm --filter @conciv/protocol exec vitest run && pnpm turbo run build --filter=@conciv/protocol`
Expected: PASS / exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol
git commit -m "feat(protocol): UiInput/UiAnswer schemas for the blocking conciv_ui lane" -- packages/protocol
```

---

### Task 3: Core ask registry — `makeUiAsks`

**Files:**

- Create: `packages/core/src/runtime/ui-asks.ts`
- Test: `packages/core/test/runtime/ui-asks.test.ts`

**Interfaces:**

- Consumes: `UiAnswer`, `UiAnswerValue` from `@conciv/protocol/ui-types` (Task 2); `EventType`, `StreamChunk` from `@tanstack/ai`.
- Produces: `makeUiAsks(): UiAsks` + `UI_ASK_TIMEOUT_MS` — wired into `app.ts` in Task 4, `RpcDeps.uiReply` in Task 5. Pairing contract: `ask` and `observe`(`TOOL_CALL_START` named `conciv_ui`) pair FIFO per session in EITHER arrival order; `reply` resolves a paired toolCallId exactly once; timeout and `endTurn` settle with the graceful unanswered result, never an error.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/runtime/ui-asks.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {makeUiAsks} from '../../src/runtime/ui-asks.js'

function startChunk(toolCallId: string, name = 'conciv_ui'): StreamChunk {
  return {type: EventType.TOOL_CALL_START, toolCallId, toolCallName: name, toolName: name}
}

describe('makeUiAsks', () => {
  it('pairs ask-then-observe and resolves on reply', async () => {
    const asks = makeUiAsks()
    const pending = asks.ask('s1', 1000)
    asks.observe('s1', startChunk('tc-1'))
    expect(asks.reply('s1', 'tc-1', 'yes')).toBe(true)
    await expect(pending).resolves.toEqual({answered: true, value: 'yes'})
  })

  it('pairs observe-then-ask (bridge lane: the stream part lands before execute)', async () => {
    const asks = makeUiAsks()
    asks.observe('s1', startChunk('tc-1'))
    const pending = asks.ask('s1', 1000)
    expect(asks.reply('s1', 'tc-1', {path: '/docs'})).toBe(true)
    await expect(pending).resolves.toEqual({answered: true, value: {path: '/docs'}})
  })

  it('pairs FIFO: two asks, two calls, answers route by order', async () => {
    const asks = makeUiAsks()
    const first = asks.ask('s1', 1000)
    const second = asks.ask('s1', 1000)
    asks.observe('s1', startChunk('tc-1'))
    asks.observe('s1', startChunk('tc-2'))
    asks.reply('s1', 'tc-2', 'second')
    asks.reply('s1', 'tc-1', 'first')
    await expect(first).resolves.toEqual({answered: true, value: 'first'})
    await expect(second).resolves.toEqual({answered: true, value: 'second'})
  })

  it('sessions are isolated', async () => {
    const asks = makeUiAsks()
    const pending = asks.ask('s1', 1000)
    asks.observe('s2', startChunk('tc-1'))
    expect(asks.reply('s2', 'tc-1', 'other')).toBe(false)
    asks.observe('s1', startChunk('tc-1'))
    expect(asks.reply('s1', 'tc-1', 'mine')).toBe(true)
    await expect(pending).resolves.toEqual({answered: true, value: 'mine'})
  })

  it('ignores non-conciv_ui tool starts and non-start chunks', () => {
    const asks = makeUiAsks()
    asks.observe('s1', startChunk('tc-1', 'conciv_open'))
    asks.observe('s1', {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'x'})
    expect(asks.reply('s1', 'tc-1', 'yes')).toBe(false)
  })

  it('reply on an unknown or already-settled toolCallId returns false', async () => {
    const asks = makeUiAsks()
    expect(asks.reply('s1', 'tc-none', 'yes')).toBe(false)
    const pending = asks.ask('s1', 1000)
    asks.observe('s1', startChunk('tc-1'))
    expect(asks.reply('s1', 'tc-1', 'yes')).toBe(true)
    expect(asks.reply('s1', 'tc-1', 'again')).toBe(false)
    await pending
  })

  it('times out into the graceful unanswered result, never a rejection', async () => {
    const asks = makeUiAsks()
    const answer = await asks.ask('s1', 20)
    expect(answer.answered).toBe(false)
    if (!answer.answered) expect(answer.note).toContain('not answered')
  })

  it('endTurn settles every pending ask unanswered and clears the session', async () => {
    const asks = makeUiAsks()
    const unpaired = asks.ask('s1', 60_000)
    const paired = asks.ask('s1', 60_000)
    asks.observe('s1', startChunk('tc-1'))
    asks.endTurn('s1')
    await expect(unpaired).resolves.toMatchObject({answered: false})
    await expect(paired).resolves.toMatchObject({answered: false})
    expect(asks.reply('s1', 'tc-1', 'late')).toBe(false)
  })
})
```

Run: `pnpm --filter @conciv/core exec vitest run test/runtime/ui-asks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement**

`packages/core/src/runtime/ui-asks.ts`:

```ts
import {EventType, type StreamChunk} from '@tanstack/ai'
import type {UiAnswer, UiAnswerValue} from '@conciv/protocol/ui-types'

export const UI_ASK_TIMEOUT_MS = 120_000

const UNANSWERED: UiAnswer = {
  answered: false,
  note: 'The user has not answered yet. Continue without the answer; it may arrive as a later message.',
}

type Waiter = {settle: (answer: UiAnswer) => void}

type SessionAsks = {waitingAsks: Waiter[]; waitingCalls: string[]; paired: Map<string, Waiter>}

export type UiAsks = {
  ask: (sessionId: string, timeoutMs: number) => Promise<UiAnswer>
  observe: (sessionId: string, chunk: StreamChunk) => void
  reply: (sessionId: string, toolCallId: string, value: UiAnswerValue) => boolean
  endTurn: (sessionId: string) => void
}

function uiToolCallIdOf(chunk: StreamChunk): string | null {
  if (chunk.type !== EventType.TOOL_CALL_START) return null
  return chunk.toolCallName === 'conciv_ui' ? chunk.toolCallId : null
}

export function makeUiAsks(): UiAsks {
  const sessions = new Map<string, SessionAsks>()

  function forSession(sessionId: string): SessionAsks {
    const existing = sessions.get(sessionId)
    if (existing) return existing
    const fresh: SessionAsks = {waitingAsks: [], waitingCalls: [], paired: new Map()}
    sessions.set(sessionId, fresh)
    return fresh
  }

  function detach(state: SessionAsks, waiter: Waiter): void {
    const index = state.waitingAsks.indexOf(waiter)
    if (index !== -1) state.waitingAsks.splice(index, 1)
    for (const [toolCallId, candidate] of state.paired) {
      if (candidate === waiter) state.paired.delete(toolCallId)
    }
  }

  function ask(sessionId: string, timeoutMs: number): Promise<UiAnswer> {
    return new Promise<UiAnswer>((resolve) => {
      const state = forSession(sessionId)
      const waiter: Waiter = {
        settle: (answer) => {
          clearTimeout(timer)
          detach(state, waiter)
          resolve(answer)
        },
      }
      const timer = setTimeout(() => waiter.settle(UNANSWERED), timeoutMs)
      const toolCallId = state.waitingCalls.shift()
      if (toolCallId !== undefined) {
        state.paired.set(toolCallId, waiter)
        return
      }
      state.waitingAsks.push(waiter)
    })
  }

  function observe(sessionId: string, chunk: StreamChunk): void {
    const toolCallId = uiToolCallIdOf(chunk)
    if (toolCallId === null) return
    const state = forSession(sessionId)
    const waiter = state.waitingAsks.shift()
    if (waiter) {
      state.paired.set(toolCallId, waiter)
      return
    }
    state.waitingCalls.push(toolCallId)
  }

  function reply(sessionId: string, toolCallId: string, value: UiAnswerValue): boolean {
    const waiter = sessions.get(sessionId)?.paired.get(toolCallId)
    if (!waiter) return false
    waiter.settle({answered: true, value})
    return true
  }

  function endTurn(sessionId: string): void {
    const state = sessions.get(sessionId)
    if (!state) return
    sessions.delete(sessionId)
    for (const waiter of [...state.waitingAsks, ...state.paired.values()]) waiter.settle(UNANSWERED)
  }

  return {ask, observe, reply, endTurn}
}
```

(Type check while writing: `chunk.toolCallName` must narrow after the `TOOL_CALL_START` guard — scripted-run already constructs the same chunk shape and typechecks, so the field exists on the union member. If the compiler wants `toolName` instead, match on `toolCallName ?? toolName` mechanically — never cast. `settle` is never invoked synchronously inside the Promise executor, so the `timer` closure reference is safe.)

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm --filter @conciv/core exec vitest run test/runtime/ui-asks.test.ts && pnpm --filter @conciv/core typecheck`
Expected: PASS / exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/runtime/ui-asks.ts packages/core/test/runtime/ui-asks.test.ts
git commit -m "feat(core): ui-asks registry — FIFO toolCallId/ask pairing with graceful timeout" -- packages/core/src/runtime/ui-asks.ts packages/core/test/runtime/ui-asks.test.ts
```

---

### Task 4: `conciv_ui` blocks — tools package + core wiring

**Files:**

- Modify: `packages/tools/src/ui.ts` (blocking def: description + outputSchema; UiInput moves to protocol)
- Modify: `packages/tools/src/types.ts` (`askUi` replaces `injectUi`)
- Modify: `packages/tools/src/server.ts` (execute pends on `ctx.askUi()`)
- Modify: `packages/tools/src/tools.ts`, `packages/tools/src/defs.ts` (re-export list)
- Modify: `packages/core/src/runtime/ui-bus.ts` (`onChunk` observer option — `inject` still present until Task 7)
- Modify: `packages/core/src/app.ts` (uiAsks wiring: ctx, observer, endTurn)
- Test: `packages/tools/test/ui-tool.it.test.ts` (rewrite), `packages/tools/test/open-tool.it.test.ts` + `packages/tools/test/page-tool.it.test.ts` (ctx fixture swap), `packages/core/test/chat-tools.test.ts` (ctx fixture swap)

**Interfaces:**

- Consumes: `UiInputSchema`/`UiAnswerSchema`/`UiAnswer` from protocol (Task 2); `makeUiAsks`/`UI_ASK_TIMEOUT_MS` (Task 3).
- Produces: `ConcivToolContext.askUi: () => Promise<UiAnswer>`; `concivUiToolDef` with `outputSchema`; a core app whose every `conciv_ui` execution — in-process chat tools AND `/api/mcp` AND the claude bridge — pends on the shared registry. Task 5 exposes `uiAsks.reply` over the wire.

- [ ] **Step 1: Write the failing tool test**

Replace `packages/tools/test/ui-tool.it.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {concivTools} from '../src/tools.js'

describe('conciv_ui tool', () => {
  it('pends on ctx.askUi and returns the answer as the tool result', async () => {
    const tools = concivTools({
      askUi: async () => ({answered: true, value: 'dark'}),
      page: async () => ({}),
      open: () => {},
    })
    const ui = tools.find((tool) => tool.name === 'conciv_ui')
    if (!ui) throw new Error('conciv_ui tool missing')
    const result = await ui.execute({kind: 'choices', question: 'theme?', options: ['light', 'dark']})
    expect(result).toEqual({answered: true, value: 'dark'})
  })

  it('rejects malformed input at the zod boundary before asking', async () => {
    const asked = {count: 0}
    const tools = concivTools({
      askUi: async () => {
        asked.count += 1
        return {answered: false, note: ''}
      },
      page: async () => ({}),
      open: () => {},
    })
    const ui = tools.find((tool) => tool.name === 'conciv_ui')
    if (!ui) throw new Error('conciv_ui tool missing')
    await expect(ui.execute({kind: 'vitest'})).rejects.toThrow()
    expect(asked.count).toBe(0)
  })
})
```

Run: `pnpm --filter @conciv/tools exec vitest run test/ui-tool.it.test.ts`
Expected: FAIL — `askUi` not on `ConcivToolContext`.

- [ ] **Step 2: Implement the tools package**

`packages/tools/src/ui.ts` (whole file):

```ts
import {toolDefinition} from '@tanstack/ai'
import {UiAnswerSchema, UiInputSchema} from '@conciv/protocol/ui-types'

export const concivUiToolDef = toolDefinition({
  name: 'conciv_ui',
  description:
    'Ask the user a question with real interactive UI (choices/confirm/diff/form) rendered in the chat thread. Blocks until they answer: the result carries their answer. If they do not answer within the wait window, the result says so and their answer may arrive as a later message instead.',
  inputSchema: UiInputSchema,
  outputSchema: UiAnswerSchema,
})
```

`packages/tools/src/types.ts` — replace the `injectUi` field (and its `UiSpec` import) with:

```ts
import type {UiAnswer} from '@conciv/protocol/ui-types'

export type ConcivToolContext = {
  askUi: () => Promise<UiAnswer>

  page: (query: Omit<PageQuery, 'requestId'>) => Promise<unknown>

  open: (file: string, line?: number) => void
}
```

`packages/tools/src/server.ts` — replace `concivUiServerTool` (drop the `randomUUID`/`buildUiSpec` imports if now unused; `UiInputSchema` import swaps in from protocol):

```ts
import {UiInputSchema} from '@conciv/protocol/ui-types'

function concivUiServerTool(ctx: ConcivToolContext): ConcivServerTool {
  const tool = concivUiToolDef.server(() => ctx.askUi())
  const run = tool.execute
  if (!run) throw new Error('conciv_ui: server tool has no execute')
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: UiInputSchema,
    execute: async (input) => run(UiInputSchema.parse(input)),
  }
}
```

(The `async` on the wrapper is LOAD-BEARING — soundness finding S1, empirically compiled: with `outputSchema` present, `ToolExecuteFunction`'s return type is `Promise<UiAnswer> | UiAnswer`, and the bare-value branch is not assignable to `ConcivServerTool.execute`'s `Promise<unknown>`; `async` re-wraps it. The other tool defs have no outputSchema, which is why their identical non-async wrappers compile.)

```ts

```

`packages/tools/src/tools.ts` and `packages/tools/src/defs.ts`: the `UiInput` re-export line becomes `export {concivUiToolDef} from './ui.js'` — consumers that need the schema import `UiInputSchema` from `@conciv/protocol/ui-types`. Grep first: `rg -n "from '@conciv/tools'" --type ts -g '!node_modules' | rg UiInput` — the 2026-07-10 sweep found no external `UiInput` consumer (widget died in plan 1); fix any new one the grep surfaces.

Fixture swaps (`injectUi: () => true` → `askUi: async () => ({answered: false, note: ''})`): `packages/tools/test/open-tool.it.test.ts:8`, `packages/tools/test/page-tool.it.test.ts:8`, `packages/core/test/chat-tools.test.ts:19` (there, delete the `seen.push`/`ui:${sessionId}` lines too — the remaining assertions on `ext_tool` stand).

- [ ] **Step 3: Wire core**

`packages/core/src/runtime/ui-bus.ts` — `makeUiBus` gains the observer option (only `run`'s pump changes; `inject` stays until Task 7):

```ts
export function makeUiBus(opts: {onChunk?: (sessionId: string, chunk: StreamChunk) => void} = {}): UiBus {
```

and inside `run`'s `pumpEvents`:

```ts
for await (const chunk of claudeEvents) {
  opts.onChunk?.(sessionId, chunk)
  channel.push(chunk)
}
```

`packages/core/src/app.ts`:

```ts
import {makeUiAsks, UI_ASK_TIMEOUT_MS} from './runtime/ui-asks.js'
```

- above the `makeUiBus()` call: `const uiAsks = makeUiAsks()`
- the bus line becomes: `const uiBus = makeUiBus({onChunk: (sessionId, chunk) => uiAsks.observe(sessionId, chunk)})`
- `makeToolCtx`'s `injectUi` line becomes: `askUi: () => uiAsks.ask(sessionId, UI_ASK_TIMEOUT_MS),`
- `onTurnEnd`'s first line (before the settled hooks): `uiAsks.endTurn(sessionId)`
- keep a reference for Task 5: `uiAsks` must be in scope where `makeRpcRouter` deps are built.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @conciv/tools exec vitest run && pnpm turbo run build --filter=@conciv/tools --filter=@conciv/core && pnpm --filter @conciv/core exec vitest run test/chat-tools.test.ts test/runtime/ui-asks.test.ts`
Expected: PASS. (Full core suite still passes too — the old `/api/chat/ui` lane is untouched until Task 7 — but only the named files gate this step.)

- [ ] **Step 5: Commit**

```bash
git add packages/tools packages/core
git commit -m "feat!(tools,core): conciv_ui blocks on ctx.askUi; ui-bus observes tool-call starts" -- packages/tools packages/core
```

---

### Task 5: `chat.uiReply` over the wire + the end-to-end blocking ITs

**Files:**

- Modify: `packages/contract/src/contract.ts` (chat.uiReply)
- Modify: `packages/core/src/rpc/router.ts` (`RpcDeps.uiReply` + handler)
- Modify: `packages/core/src/app.ts` (pass `uiReply` dep)
- Test: `packages/core/test/rpc/wire.it.test.ts` (two new ITs + the replay re-point; DELETE the old "gen-ui custom events injected mid-turn replay to a late attach" test — its `kit.post('/api/chat/ui', ...)` lane dies in Task 7)

**Interfaces:**

- Consumes: `UiAnswerValueSchema` (Task 2), `uiAsks.reply` (Tasks 3–4), `bootWire()` + scripted-harness idioms already in `wire.it.test.ts`.
- Produces: `chat.uiReply({sessionId, toolCallId, value})` with typed `UNKNOWN_REQUEST`; the wire-level guarantee plan 3 renders against: pending question = replayed `TOOL_CALL_*` parts, answer = tool result in the same turn. This re-points plan-1 Task 10's custom-event replay pin onto tool parts.

- [ ] **Step 1: Contract + router**

`packages/contract/src/contract.ts` — add to imports `import {UiAnswerValueSchema} from '@conciv/protocol/ui-types'` (protocol is already a dependency) and to the `chat` group after `permissionDecision`:

```ts
uiReply: oc
  .errors({UNKNOWN_REQUEST: {message: 'no pending ui question'}})
  .input(SessionIdInput.extend({toolCallId: z.string(), value: UiAnswerValueSchema}))
  .output(Ok),
```

`packages/core/src/rpc/router.ts` — `RpcDeps` gains:

```ts
uiReply: (sessionId: string, toolCallId: string, value: UiAnswerValue) => boolean
```

(type import: `import type {UiAnswerValue} from '@conciv/protocol/ui-types'`), and the `chat` handlers gain:

```ts
uiReply: os.chat.uiReply.handler(({input, errors}) => {
  if (!deps.uiReply(input.sessionId, input.toolCallId, input.value)) throw errors.UNKNOWN_REQUEST()
  return {ok: true as const}
}),
```

`packages/core/src/app.ts` — the `makeRpcRouter({...})` deps gain:

```ts
uiReply: (sessionId, toolCallId, value) => uiAsks.reply(sessionId, toolCallId, value),
```

- [ ] **Step 2: Write the failing wire ITs**

Append to `packages/core/test/rpc/wire.it.test.ts` (its `bootWire()`/`kit`/`harness.__scripted` idioms; read the existing "tool durations ride the turn stream" test first and mirror its await/assert sequencing exactly — it is the empirical anchor proving `chat()` executes real conciv tools against scripted `TOOL_CALL_*` chunks):

```ts
it('conciv_ui blocks the turn until chat.uiReply lands the answer as the tool result', async () => {
  const {kit, harness} = await bootWire()
  const sessionId = await kit.session()
  const stream = await kit.attach(sessionId)
  harness.__scripted.scriptToolCall('conciv_ui', {kind: 'confirm', question: 'Proceed?'})
  await kit.rpc.chat.send({sessionId, text: 'ask me'})
  const start = await stream.waitFor(
    (chunk) => chunk.type === EventType.TOOL_CALL_START && chunk.toolCallName === 'conciv_ui',
    {hangGuardMs: 10_000},
  )
  if (start.type !== EventType.TOOL_CALL_START) throw new Error('matched chunk was not a tool-call start')
  await kit.rpc.chat.uiReply({sessionId, toolCallId: start.toolCallId, value: 'yes'})
  const events = await stream.done({hangGuardMs: 10_000})
  const result = events.all.find((chunk) => chunk.type === EventType.TOOL_CALL_RESULT)
  if (!result || result.type !== EventType.TOOL_CALL_RESULT) throw new Error('no TOOL_CALL_RESULT in the stream')
  expect(JSON.parse(result.content)).toEqual({answered: true, value: 'yes'})
})

it('chat.uiReply on an unknown toolCallId reports UNKNOWN_REQUEST', async () => {
  const {kit} = await bootWire()
  const sessionId = await kit.session()
  await expect(kit.rpc.chat.uiReply({sessionId, toolCallId: 'tc-nope', value: 'yes'})).rejects.toMatchObject({
    code: 'UNKNOWN_REQUEST',
  })
})

it('a pending conciv_ui question replays its tool-call part to a late attach', async () => {
  const {kit, harness} = await bootWire()
  const sessionId = await kit.session()
  harness.__scripted.scriptToolCall('conciv_ui', {kind: 'confirm', question: 'Proceed?'})
  await kit.rpc.chat.send({sessionId, text: 'ask me'})
  const late = await kit.attach(sessionId)
  const start = await late.waitFor(
    (chunk) => chunk.type === EventType.TOOL_CALL_START && chunk.toolCallName === 'conciv_ui',
    {hangGuardMs: 10_000},
  )
  if (start.type !== EventType.TOOL_CALL_START) throw new Error('matched chunk was not a tool-call start')
  await kit.rpc.chat.uiReply({sessionId, toolCallId: start.toolCallId, value: 'yes'})
  await late.done({hangGuardMs: 10_000})
})
```

Delete the old test `'gen-ui custom events injected mid-turn replay to a late attach'` and, once nothing else in the file uses it, the `CONCIV_UI_EVENT` import.

Sequencing/verification notes baked into the test design (do not "fix" these away; items 3–5 were VERIFIED by the 2026-07-10 soundness review against installed sources):

1. The blocking test needs NO `hold()` — the turn stays open because `conciv_ui`'s execute is genuinely pending on the registry. That IS the feature.
2. The scripted `toolCallId` is `tc-<sessionId>` (`scripted-run.ts:36`) and the in-process chat-tools lane carries `context.toolCallId`, but the assertion reads the id from the STREAM chunk — the exact flow the real client uses.
3. VERIFIED: `chat()` yields `TOOL_CALL_START/ARGS/END` downstream BEFORE executing tools in the next loop iteration (`activities/chat/index.js:283-285`) — so `waitFor(TOOL_CALL_START)` resolves while execute pends, no deadlock. `TOOL_CALL_RESULT` IS re-emitted with `content = JSON.stringify(result)` (double-stringified relative to the chunk — hence the `JSON.parse(result.content)` assertion, soundness finding S2). The mid-loop `RUN_FINISHED {finishReason: 'tool_calls'}` is SWALLOWED by chat() (internal `finishedEvent`), so `stream.done()` correctly stops at the single final `RUN_FINISHED` after the scripted adapter's second invocation.
4. VERIFIED: the replay IT is deterministic — `run-view.snapshot()` re-emits an in-flight `TOOL_CALL_START` as a raw start entry even with no END recorded, so a late attach always sees the pending part.

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm turbo run build --filter=@conciv/contract --filter=@conciv/core && pnpm --filter @conciv/core exec vitest run test/rpc/wire.it.test.ts`
Expected: PASS (all wire ITs including the three new ones).

- [ ] **Step 4: Commit**

```bash
git add packages/contract packages/core
git commit -m "feat(contract,core): chat.uiReply resolves pending conciv_ui asks; wire ITs pin the blocking loop" -- packages/contract packages/core
```

---

### Task 6: Harness-testkit re-point — tool-call helpers replace UiSpec helpers

**Files:**

- Modify: `packages/harness-testkit/src/run-events.ts` (`toolCalls` replaces `uiSpecs`)
- Modify: `packages/harness-testkit/src/run-stream.ts` (`waitForToolCall` replaces `waitForUiSpec`)
- Modify: `packages/harness-testkit/test/run-stream.test.ts`
- Modify: `packages/core/test/testkit/create-testkit.it.test.ts` (the conciv_ui IT becomes the full blocking round-trip — including REAL claude)

**Interfaces:**

- Consumes: `EventType.TOOL_CALL_START/ARGS/END` chunk shapes (scripted-run emits them; the claude translate layer emits the same on live runs); `chat.uiReply` (Task 5).
- Produces: `RunEvents.toolCalls(name?): SeenToolCall[]` and `RunStream.waitForToolCall(name, opts?): Promise<SeenToolCall>` with `SeenToolCall = {toolCallId: string; name: string; input: unknown}` — the helpers plan-3 suites and extension tests use to assert tool-lane behavior. After this task nothing in testkit references `CONCIV_UI_EVENT`.

- [ ] **Step 1: Write the failing testkit unit tests**

In `packages/harness-testkit/test/run-stream.test.ts`, replace the two `waitForUiSpec` cases and the `aguiCustomFor`/`UiSpec` import with tool-call chunks (add the helpers at top):

```ts
const toolCall = (toolCallId: string, name: string, args: unknown): StreamChunk[] => [
  {type: EventType.TOOL_CALL_START, toolCallId, toolCallName: name, toolName: name},
  {type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(args)},
  {type: EventType.TOOL_CALL_END, toolCallId},
]
```

```ts
it('waitForToolCall resolves with parsed input when the call lands mid-stream', async () => {
  const run = makeRunStream(
    scripted([
      started,
      text('thinking'),
      ...toolCall('tc-1', 'conciv_ui', {kind: 'confirm', question: 'Proceed?'}),
      finished,
    ]),
  )
  const call = await run.waitForToolCall('conciv_ui')
  expect(call).toEqual({toolCallId: 'tc-1', name: 'conciv_ui', input: {kind: 'confirm', question: 'Proceed?'}})
})

it('waitForToolCall rejects fast when the run finishes without that tool', async () => {
  const run = makeRunStream(scripted([started, ...toolCall('tc-1', 'conciv_open', {file: 'a.ts'}), finished]))
  await expect(run.waitForToolCall('conciv_ui')).rejects.toThrow(/finished|without/i)
})
```

Also update the two remaining cases that used `aguiCustomFor(spec)` mid-stream (`done resolves when RUN_FINISHED landed before the call`, `an old-turn RUN_FINISHED in history does not fail a new waiter`) to use `...toolCall('tc-2', 'conciv_ui', {kind: 'confirm', question: 'Again?'})` + `waitForToolCall('conciv_ui')` with the same control flow.

And one direct `toolCalls` aggregation case (CF7):

```ts
it('done().toolCalls filters by name and parses each call input', async () => {
  const run = makeRunStream(
    scripted([
      started,
      ...toolCall('tc-1', 'conciv_open', {file: 'a.ts'}),
      ...toolCall('tc-2', 'conciv_ui', {kind: 'confirm', question: 'Proceed?'}),
      finished,
    ]),
  )
  const events = await run.done()
  expect(events.toolCalls().map((call) => call.name)).toEqual(['conciv_open', 'conciv_ui'])
  expect(events.toolCalls('conciv_ui')).toEqual([
    {toolCallId: 'tc-2', name: 'conciv_ui', input: {kind: 'confirm', question: 'Proceed?'}},
  ])
})
```

Run: `pnpm --filter @conciv/harness-testkit exec vitest run`
Expected: FAIL — `waitForToolCall` does not exist.

- [ ] **Step 2: Implement**

`packages/harness-testkit/src/run-events.ts` (whole file — drops the protocol ui-types import entirely):

```ts
import {EventType, type StreamChunk} from '@tanstack/ai'

export type SeenToolCall = {toolCallId: string; name: string; input: unknown}

export type RunEvents = {
  all: StreamChunk[]
  text: () => string
  toolCalls: (name?: string) => SeenToolCall[]
  errors: () => string[]
  runs: () => number
  custom: (name: string) => unknown[]
}

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function argsFor(all: StreamChunk[], toolCallId: string): string {
  return all
    .flatMap((chunk) =>
      chunk.type === EventType.TOOL_CALL_ARGS && chunk.toolCallId === toolCallId ? [chunk.delta ?? ''] : [],
    )
    .join('')
}

export function collectToolCalls(all: StreamChunk[], name?: string): SeenToolCall[] {
  return all
    .flatMap((chunk) =>
      chunk.type === EventType.TOOL_CALL_START ? [{toolCallId: chunk.toolCallId, name: chunk.toolCallName}] : [],
    )
    .filter((call) => name === undefined || call.name === name)
    .map((call) => ({...call, input: parseArgs(argsFor(all, call.toolCallId))}))
}

export function makeRunEvents(all: StreamChunk[]): RunEvents {
  return {
    all,
    text: () =>
      all.flatMap((chunk) => (chunk.type === EventType.TEXT_MESSAGE_CONTENT ? [chunk.delta ?? ''] : [])).join(''),
    toolCalls: (name) => collectToolCalls(all, name),
    errors: () => all.flatMap((chunk) => (chunk.type === EventType.RUN_ERROR ? [chunk.message] : [])),
    runs: () => all.filter((chunk) => chunk.type === EventType.RUN_FINISHED).length,
    custom: (name) =>
      all.flatMap((chunk) => (chunk.type === EventType.CUSTOM && chunk.name === name ? [chunk.value] : [])),
  }
}
```

`packages/harness-testkit/src/run-stream.ts` — drop the ui-types import and `uiSpecMatch`; the `RunStream` type swaps `waitForUiSpec` for:

```ts
waitForToolCall: (name: string, opts?: {hangGuardMs?: number}) => Promise<SeenToolCall>
```

and the implementation (import `collectToolCalls`, `type SeenToolCall` from `./run-events.js`):

```ts
waitForToolCall: async (name, opts) => {
  const matched = await waitFor(
    (chunk) =>
      chunk.type === EventType.TOOL_CALL_END &&
      collectToolCalls(seen, name).some((call) => call.toolCallId === chunk.toolCallId),
    opts?.hangGuardMs ?? 90_000,
  )
  const toolCallId = matched.type === EventType.TOOL_CALL_END ? matched.toolCallId : ''
  const call = collectToolCalls([...seen], name).find((entry) => entry.toolCallId === toolCallId)
  if (!call) throw new Error('run-stream: matched tool call disappeared from the collected stream')
  return call
},
```

(Matching on `TOOL_CALL_END` — not START — guarantees the args are fully streamed before `input` is parsed.)

- [ ] **Step 3: Re-point the create-testkit IT (fake AND real claude)**

Replace the `conciv_ui injection lands on the live stream` case in `packages/core/test/testkit/create-testkit.it.test.ts`:

```ts
it.skipIf(!mode.run)(
  `[${mode.name}] blocking conciv_ui round-trips the user answer as the tool result`,
  async () => {
    const kit = await createTestkit(mode.harness, bootCoreApp()).setup()
    try {
      const sessionId = await kit.session()
      const stream = await kit.attach(sessionId)
      if ('__scripted' in mode.harness) {
        mode.harness.__scripted.scriptToolCall('conciv_ui', {kind: 'confirm', question: 'Proceed?'})
        await kit.chat('go', sessionId)
      }
      if (!('__scripted' in mode.harness)) {
        await kit.chat('Call the conciv_ui tool with kind confirm, question "Proceed?". Then reply DONE.', sessionId)
      }
      const call = await stream.waitForToolCall('conciv_ui')
      expect(call.name).toBe('conciv_ui')
      await kit.rpc.chat.uiReply({sessionId, toolCallId: call.toolCallId, value: 'yes'})
      await stream.done({hangGuardMs: 60_000})
    } finally {
      await kit.cleanup()
    }
  },
  120_000,
)
```

(The narrowing dance: `mode.harness` is `HarnessAdapter`; `'__scripted' in mode.harness` narrows to the scripted shape — if the compiler needs help, import `type TestHarness` and use the same `isTestHarness`-style guard `create-testkit.ts:12` uses. On REAL claude this is the full production loop end-to-end: the CLI calls `conciv_ui` over the TanStack MCP bridge, execute pends on the registry, the translated `TOOL_CALL_START` pairs FIFO, `chat.uiReply` resolves it, and the CLI receives `{"answered":true,"value":"yes"}` as the MCP result — under the Task 1 timeout cap. NEVER `kit.callTool('conciv_ui', ...)` in tests — the direct `/api/mcp` call blocks 120s with no stream part to pair. Soundness finding S3, live mode only: pairing keys on the sessionId the ask was created under — the in-turn chat lane always carries it, but if the live run's `conciv_ui` were to arrive via `/api/mcp`, `mcp.ts:65` falls back to `''` without the session header and the ask never pairs. The chat-turn bridge lane does not use `/api/mcp`, so this should not trigger; if the live case hangs to its 120s cap, check which lane the CLI actually called through and the `conciv-session-id` header before suspecting the registry.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm turbo run build --filter=@conciv/harness-testkit && pnpm --filter @conciv/harness-testkit exec vitest run && pnpm --filter @conciv/core exec vitest run test/testkit/create-testkit.it.test.ts`
Expected: PASS (real-claude case runs only where `mode.run` is truthy — locally that includes live claude; let it run, it is the feature's E2E).

- [ ] **Step 5: Commit**

```bash
git add packages/harness-testkit packages/core/test/testkit
git commit -m "feat!(harness-testkit): toolCalls/waitForToolCall replace the UiSpec helpers" -- packages/harness-testkit packages/core/test/testkit
```

---

### Task 7: DEMOLITION — the gen-UI custom lane dies

Everything below is now consumer-free (Tasks 4–6 re-pointed every caller). Delete in one sweep; typecheck is the net.

**Files:**

- Modify: `packages/protocol/src/ui-types.ts` (delete the UiSpec lane)
- Modify: `packages/protocol/src/usage-types.ts` (delete `CONCIV_USAGE_EVENT` + `aguiUsageFor`)
- Delete: `packages/protocol/src/tool-timing.ts` (+ its entry in `packages/protocol/tsdown.config.ts:17` and the `./tool-timing` entry in `packages/protocol/package.json` exports)
- Modify: `packages/core/src/runtime/ui-bus.ts` (delete `inject` AND `injectChunk`)
- Modify: `packages/core/src/api/chat/chat-tools.ts` (delete `timed()` + the `injectChunk` parameter)
- Modify: `packages/core/src/api/chat/turn.ts` (delete the `/ui` Hono app + default export + the `aguiUsageFor` yield)
- Modify: `packages/core/src/api/chat/chat.ts` (drop the turn-app mount; grep `ChatAppType` consumers first)
- Modify: `packages/core/src/app.ts` (drop the `/api/chat` mount if `chat.ts` no longer exports an app)
- Delete: `packages/cli/src/ui.ts`
- Modify: `packages/cli/src/bin.ts`, `packages/cli/README.md`, `packages/cli/package.json` (description), `apps/site/content/docs/cli.mdx`
- Modify: `packages/core/src/policy/command-policy.ts`, `packages/core/test/command-policy.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: a repo with ZERO references to the custom gen-UI lane. The Task 8 anti-pattern grep is the acceptance gate.

- [ ] **Step 1: Protocol deletions**

From `packages/protocol/src/ui-types.ts` delete: the `renderId` const, `UiChoicesSchema`, `UiConfirmSchema`, `UiDiffSchema`, `UiFormSchema`, `UiVitestSchema`, `UiSpecSchema`, the types `UiSpec`/`UiChoices`/`UiConfirm`/`UiDiff`/`UiForm`/`UiVitest`/`UiFieldType`, `CONCIV_UI_EVENT`, `aguiCustomFor`, `parseUiSpec`, `parseField`, `UiBuildInput`, `buildUiSpec`. KEEP: `UiFormFieldSchema`/`UiFormField`, the Task-2 additions, the snapshot function (plan-2 shape), `APPROVAL_REQUESTED_EVENT`/`ApprovalRequest`/`aguiApprovalRequestedFor`. Before each deletion fallow disputes, trace: `pnpm exec fallow dead-code --trace 'packages/protocol/src/ui-types.ts:UiSpecSchema'`.

- [ ] **Step 2: Core deletions**

- `ui-bus.ts`: delete `inject` from `UiBus` and `makeUiBus` (and the now-unused `aguiCustomFor`/`UiSpec` imports).
- `turn.ts`: delete lines 142–148 (`const app = new Hono...post('/ui'...)` + `export default app`) and the `UiSpecSchema` + `sessionIdFromHeaders` imports IF nothing else in the file uses them (grep the file).
- `chat.ts`: delete `import turn from './turn.js'` (keep the named imports other files use) and the `.route('/', turn)`; if the Hono app in `chat.ts` is now route-less, delete the app + `ChatAppType` export entirely — grep `ChatAppType` and `chatApp` consumers first (`rg -n "ChatAppType|chatApp" packages apps --type ts -g '!node_modules'`) and remove the `/api/chat` mount in `app.ts` `composeRoutes` accordingly. `ensureAgentRecord` stays (app.ts consumes it).
- `command-policy.ts:27`: the line becomes `if (c.startsWith('conciv tools')) return 'allow'`.
- `command-policy.test.ts:15`: the expectation flips to plain: `expect(classifyCommand('conciv ui confirm --question x')).toBe('ask')`.
- `packages/core/test/runtime/ui-bus.test.ts` (coverage finding CF1): its only test drives `bus.inject` — rewrite it onto surviving surfaces (`injectApproval` routing to the matching session channel only, plus an `onChunk` observer case) or delete it if Task 4 already added equivalent coverage; the file must not reference `inject`/`UiSpec` after this step.
- `packages/core/test/api/chat/chat.it.test.ts` (CF2): delete the two `/api/chat/ui` cases — "POST /api/chat/ui 400s on a malformed spec" (~line 153) and "routes POST /api/chat/ui to the live turn by our id (cross-process path)" (~line 211). The cross-process lane is the accepted non-goal (CF5).
- `packages/core/test/api/cors.it.test.ts` (CF3): the preflight test targets `/api/chat/ui` — re-point the URL to a surviving session-scoped path (`/api/mcp`) with the same assertions; do not delete the CORS coverage.

- [ ] **Step 2b: Usage + duration lane deletions**

- `packages/protocol/src/usage-types.ts`: delete `CONCIV_USAGE_EVENT` + `aguiUsageFor` (and the now-unused `EventType`/`StreamChunk` imports if nothing else in the file uses them). `UsageSnapshotSchema`, `UsageSnapshot`, `tokenUsageToSnapshot` STAY — `packages/contract/src/rows.ts:17` and `turn.ts`'s store update consume them.
- `packages/core/src/api/chat/turn.ts` `withLockRelease`: delete the `yield aguiUsageFor(usage)` line and the `aguiUsageFor` import; KEEP `await deps.store.update(sessionId, {usage})` (it pulses `sessions.live`, which is where plan 3 reads usage) and keep `usageSnapshotFor` feeding it.
- Delete `packages/protocol/src/tool-timing.ts`; remove `'src/tool-timing.ts'` from `packages/protocol/tsdown.config.ts` and the matching subpath from `packages/protocol/package.json` `exports`.
- `packages/core/src/api/chat/chat-tools.ts`: delete the `timed()` wrapper, the `injectChunk` parameter of `buildChatTools`, and the `aguiToolDurationFor` import — tool runs become plain `(args) => tool.execute(args)` / `(args) => tool.execute(args, request)`; the `ToolRun` context parameter goes if nothing else consumes it. Update the `buildChatTools(...)` call in `packages/core/src/app.ts` (drop the 4th argument) and the fixture in `packages/core/test/chat-tools.test.ts`.
- `packages/core/src/runtime/ui-bus.ts`: with durations gone, `injectChunk` has zero consumers — delete it from `UiBus` and `makeUiBus`; `injectApproval` keeps its direct `channel.push` body.
- `packages/core/test/rpc/wire.it.test.ts`: delete the `'tool durations ride the turn stream after a real in-stream tool call'` test + the `CONCIV_TOOL_DURATION_EVENT` import. Task 5's blocking IT is the surviving pin that `chat()` executes real conciv tools against scripted `TOOL_CALL_*` chunks. Also grep the file for usage-event assertions (`rg -n "CONCIV_USAGE_EVENT|conciv-usage" packages/core/test`) and delete any.

- [ ] **Step 3: CLI + docs deletions**

- Delete `packages/cli/src/ui.ts`. In `bin.ts`: drop the `uiCommand` import and the `ui: uiCommand` subcommand.
- `packages/cli/package.json` description and `packages/cli/README.md`: drop the `conciv ui` clause (describe only `conciv tools`).
- `apps/site/content/docs/cli.mdx`: delete the `## conciv ui` section; in its place one line: interactive questions now happen through the `conciv_ui` MCP tool automatically — no CLI involved. Also fix the cross-link at ~line 84 (`[Chat](/docs/usage/chat#generative-ui)`) — CF4.
- `apps/site/content/docs/usage/chat.mdx` (~lines 18–26, CF4): rewrite the `## Generative UI` section for the new behavior — the agent's `conciv_ui` tool renders choices/confirm/diff/form in the thread and BLOCKS until you answer; your answer returns to the agent as the tool result in the same turn (no longer "your answer becomes the next message").
- Check `packages/cli/test/cli.it.test.ts` for `ui` cases (`rg -n "ui" packages/cli/test/cli.it.test.ts`) and delete any.

- [ ] **Step 4: Typecheck + test the blast radius**

Pre-check (CF6): `rg -n "api/chat" packages/extension-testkit apps --type ts -g '!node_modules'` — `packages/extension-testkit/test/boot-server.it.test.ts` fetches `/api/chat/models` and asserts `res.ok`, but the current `chatApp` only serves `/ui`, so verify whether that test is ALREADY red on the branch before this plan (run it once pre-deletion). If pre-existing red, note it alongside the claude-image flake and re-point it to `rpc.meta.models` while you are there; if green, find what actually serves it before removing the `/api/chat` mount.

Run: `pnpm typecheck && pnpm turbo run test --filter=@conciv/protocol --filter=@conciv/core --filter=@conciv/cli --filter=@conciv/harness-testkit --filter=@conciv/tools`
Expected: exit 0 / PASS (claude-image flake excepted). Fix every compile error by DELETING dead references, not by re-adding shims.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol packages/core packages/cli apps/site
git commit -m "feat!(core,cli,protocol): delete the gen-UI custom-event lane — conciv_ui is native tool parts" -- packages/protocol packages/core packages/cli apps/site
```

---

### Task 8: Plan-wide gates

**Files:** none new; whole-repo verification.

- [ ] **Step 1: Anti-pattern grep (adoption proof)**

Run: `rg -n "CONCIV_UI_EVENT|aguiCustomFor|injectUi|injectChunk|UiSpec|buildUiSpec|parseUiSpec|parseField|waitForUiSpec|uiSpecs\(|conciv ui|CONCIV_USAGE_EVENT|aguiUsageFor|CONCIV_TOOL_DURATION_EVENT|aguiToolDurationFor|tool-timing" packages apps --type ts -g '!node_modules'`
Expected: ZERO hits. (`UiInputSchema`/`UiAnswerSchema` do not match any pattern; if `UiSpec` matches a plan/spec doc under `docs/`, that is fine — the grep scopes to `packages apps`.)

- [ ] **Step 2: Whole-project gates**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: exit 0, EXCEPT the known pre-existing `packages/core/test/api/mcp/claude-image.it.test.ts` flake (fails identically on main; does not gate).

- [ ] **Step 3: Fallow audit**

Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: zero INTRODUCED findings. Likely hits to pre-empt: stranded `UiFormFieldSchema` if Task 7 over-deleted its consumer (it must NOT be deleted — `UiInputSchema.fields` uses it), unused `zod` import in `packages/tools/src/ui.ts` (the new file body has none — drop the import), `randomUUID`/`buildUiSpec` leftovers in `packages/tools/src/server.ts`. Cyclomatic ≤ 4 on every new function (`ui-asks.ts` and the testkit helpers above are written to comply).

- [ ] **Step 4: Commit any gate fixes**

```bash
git add -A packages apps/site
git commit -m "chore: widget-rewrite plan 2.5 gates — typecheck, tests, fallow clean" -- packages apps/site
```

---

## Self-review notes (kept for the executor)

- **Why blocking-server-tool and not TanStack client tools / `addToolApprovalResponse`:** both native client-answer lanes require the client to re-run the turn (and the MCP bridge throws `Unknown tool` on execute-less definitions) — the exact deadlock finding that made approvals hybrid. A server tool whose execute pends is stock TanStack (`toolDefinition().server()`); the only conciv-specific piece is one oRPC procedure (`chat.uiReply`), shaped like the existing `chat.permissionDecision`/`page.reply`.
- **FIFO correlation soundness:** per-session, single-turn-at-a-time (`hub.generating` + lock), tools executed in emission order by both the in-process agent loop and the claude CLI. Ambiguity would need two concurrent `conciv_ui` calls interleaved out of order within one turn — not expressible in either lane. `endTurn` clears stranded queue entries so a died turn cannot poison the next.
- **Timeout ladder:** `UI_ASK_TIMEOUT_MS 120s` (locked, approval parity) < claude `MCP_TOOL_TIMEOUT 150s` (Task 1) — the graceful `{answered: false}` always beats the CLI's hard kill. On timeout the model is TOLD the answer may arrive as a later message — old-behavior parity. In-process lanes have no outer cap; the registry timeout is the only clock.
- **Spec coverage:** blocking `conciv_ui` execute ✓ T4; `chat.uiReply` + `UNKNOWN_REQUEST` ✓ T5; FIFO stream observer in `uiBus.run` ✓ T3/T4; harness timeout cap ✓ T1; deletion of `CONCIV_UI_EVENT`/`uiBus.inject`+`injectChunk`/`aguiCustomFor`/`POST /api/chat/ui`/`conciv ui` CLI/policy line/`UiSpecSchema` lane/`UiVitest`/testkit helpers/`CONCIV_USAGE_EVENT`/`tool-timing` module ✓ T6/T7; plan-1 Task 10 replay pin re-pointed at tool parts ✓ T5; mid-question reload contract ✓ T5 replay IT; client render seam documented for plan 3 ✓ (Locked-API section).
- **Type consistency check:** `askUi: () => Promise<UiAnswer>` (T4) = `uiAsks.ask(sessionId, UI_ASK_TIMEOUT_MS)` return (T3); `uiReply` value `UiAnswerValue` uniform across contract (T5), router dep (T5), registry (T3); `SeenToolCall` shape identical in run-events, run-stream, and both consuming ITs; `UiInputSchema` referenced by tool def (T4), MCP registration (unchanged `server.ts` shape), and protocol tests (T2).
- **Known execution risks flagged in-task:** `toolCallName` narrowing (T3 note — verified sound by review, kept as a compile check); `'__scripted' in` narrowing (T6 note); live-mode session-header pairing (T6 note, S3).
- **Adversarial review 2026-07-10 (two Opus agents: coverage + soundness) FOLDED.** Coverage: CF1 `ui-bus.test.ts` drives the dying `inject` → T7 rewrite onto `injectApproval`/`onChunk`; CF2 two `/api/chat/ui` cases in `chat.it.test.ts` → T7 delete; CF3 `cors.it.test.ts` preflights the dying endpoint → T7 re-point to `/api/mcp`; CF4 `usage/chat.mdx` Generative-UI section + `cli.mdx` cross-link → T7 rewrite; CF5 launched/TTY cross-process UI lane → accepted explicit non-goal (old lane was already `injected:false` without a live in-process channel); CF6 `extension-testkit/boot-server.it.test.ts` fetches `/api/chat/models` → T7 pre-check (likely pre-existing red; re-point to `rpc.meta.models`); CF7 direct `toolCalls` unit case added to T6; CF8 wire-level already-settled `uiReply` accepted as unit-covered (T3). Soundness: S1 CRITICAL — with `outputSchema` present the server-tool wrapper must be `async` (reviewer compiled the failure; folded into T4 with rationale); S2 `TOOL_CALL_RESULT.content` is `JSON.stringify(result)` so the IT asserts via `JSON.parse(result.content)` (folded into T5); S3 live-mode pairing depends on the ask's sessionId lane (folded into T6 note). Verified-sound list retained by the reviewer: event-union narrowing for all four TOOL*CALL*\* types (@ag-ui/core 0.0.52 literal types), `.server(() => ctx.askUi())` typing, agent-loop emit-then-execute ordering (`activities/chat/index.js:283-285`), mid-loop `RUN_FINISHED{'tool_calls'}` swallowed (done() safe), scripted second-turn termination, app.ts wiring = one shared registry per app, bridge stringification, env merge order (caller wins twice over), zod 4.4.3 record semantics, task-ordering with no orphan `injectUi` consumer and the old gen-ui IT green until its T5 deletion, hub `run-view.snapshot()` re-emitting in-flight `TOOL_CALL_START`, and the `timer` closure non-issue.
