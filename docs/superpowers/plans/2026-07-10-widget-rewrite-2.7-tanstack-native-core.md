# Widget Rewrite Plan 2.7: TanStack-Native Core — db-backed runs, the wait, and the restructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild core's chat plane on the user-locked model — "their model everywhere, one invention: the wait" — then dissolve the leftover folder structure. All live state moves to sqlite rows; TanStack's own `StreamProcessor` folds the in-flight run; `chat.attach` becomes a plain live query; approvals and `conciv_ui` block inside TanStack extension points on ONE `awaitReply` function; `LiveFeed` is replaced by `node:events`.

**Architecture:** Three db things (a `status`+`runEpoch` on sessions, a `runMessages` row, a `replies` row) + one stdlib `EventEmitter` + TanStack's processor. Zero module-level Maps keyed by session anywhere in core. Busy claim is an atomic synchronous UPDATE (node:sqlite is sync). A run is a function: claim → fold harness stream through `StreamProcessor` (a local) → write rows → release. Every live rpc surface (sessions/drafts/markers/attach) is the same shape: yield current, re-yield per change event.

**Tech Stack:** `@tanstack/ai` 0.40.0 (`chat()`, `StreamProcessor`, chat middleware), `@tanstack/ai-sandbox` 0.2.2 (existing gate sockets), drizzle `1.0.0-rc.4` on `node:sqlite`, `node:events`, oRPC 1.14.7 (contract UNCHANGED).

**Spec lineage:** `docs/superpowers/specs/2026-07-09-widget-orpc-rewrite-design.md` v3.3 (this plan finally implements change 2's status column properly). Plans 1/2/2.5 are executed on this branch. Plan 3 (apps/conciv + embed) is authored AFTER this lands. **Adversarially reviewed 2026-07-10 (two Opus agents: coverage + soundness); all findings folded — see Review ledger at the bottom.**

## Global Constraints

- Functions, not classes (the `StreamProcessor` we CONSUME is theirs — instantiating it is fine; never subclass it). ZERO code comments. No `any`/`as`/non-null `!`. No IIFEs. Cyclomatic ≤ 4 per new function.
- NO module-level Maps/Sets keyed by sessionId anywhere in `packages/core/src`. Request-scoped listener sets torn down by AbortSignal, and app-composition-time config sets (e.g. the risky-tool set, one per `makeApp`), are the allowed shapes. Grep-gated in Task 9.
- Tests under `test/` only; no doubles/shims — real served apps via `@conciv/harness-testkit`, real sqlite, real typed oRPC clients.
- Build/typecheck via turbo. Commit with pathspec always. `pnpm exec fallow audit --changed-since main --format json` clean of INTRODUCED findings at the end.
- Known non-gating red: `test/api/mcp/claude-image.it.test.ts` and `test/codex-tanstack.it.test.ts` (environmental live-LLM).
- Mid-plan suites MAY be red between Tasks 4–6; each task's own listed suites must be green at its end, whole-world gates bind only in Task 9.
- drizzle stays EXACT `1.0.0-rc.4`. Before touching migrations run `pnpm dlx @tanstack/intent@latest load drizzle-kit#drizzle-migrations` and follow it.
- The oRPC contract (`packages/contract/src/contract.ts`) does NOT change. Only what flows through `attach` changes shape (snapshots + synthesized lifecycle instead of raw deltas).
- The approval CUSTOM-event payload does NOT change (soundness finding S2 killed the ai-sandbox event swap): `aguiApprovalRequestedFor` and its `{toolCallId, toolName, input, approval: {id}}` shape STAY in protocol; `packages/ui-kit-chat` is untouched by this plan.

## Verified API facts (2026-07-10, read from installed node_modules; corrected by the soundness review — do NOT re-derive)

- `@tanstack/ai@0.40.0` exports `StreamProcessor` from the package root. **The constructor takes handlers under `events`:** `new StreamProcessor({events: {onMessagesChange, onToolCall, ...}, chunkStrategy?})` — `processor.js:31-38` reads `options.events`; a top-level `onMessagesChange` is silently dropped (S1). Public API: `processChunk(chunk): void`, `getMessages(): UIMessage[]`, `setMessages(messages)`, `addUserMessage(content, id?) → UIMessage` (fires `onMessagesChange`, processor.js:85).
- Client mid-stream handoff is DESIGNED-FOR: `ensureAssistantMessage` (processor.js:444–455) seeds stream state from a snapshot message's last text part; `handleMessagesSnapshotEvent` REPLACES the whole message array and reconciles tool-call parts (`reconcileSnapshotToolCalls`, processor.js:576-633) so pending tool/approval cards survive repeated snapshots without flicker (verified sound by the review).
- The approval CUSTOM handler (`processor.js:1144-1156`) destructures `{toolCallId, toolName, input, approval}` from the event value and calls `updateToolCallApproval(messages, messageId, toolCallId, approval.id)` — it ANNOTATES an existing `tool-call` part (matched by `toolCallId`) and never creates one; a missing `approval` object THROWS. Therefore: (a) our existing `aguiApprovalRequestedFor` (protocol/ui-types.ts:32) emits exactly the right shape and STAYS; (b) `@tanstack/ai-sandbox`'s `buildApprovalRequestedEvent` emits a flat `{approvalId, title, ...detail}` with NO `toolCallId`/`approval` and MUST NOT be fed to the processor (S2); (c) the gate must use the REAL `toolUseId` as `toolCallId` and wait for the folded tool-call part to exist before injecting (S3).
- The claude adapter folds bridged MCP tool calls into the harness stream as `TOOL_CALL_START/ARGS/END` with the `mcp__tanstack__` prefix stripped (translate.js:101-134) — so `conciv_ui` and approval-gated tool parts DO appear in the server-side processor's messages (verified).
- Client run lifecycle: `ai-client/chat-client.js:291-315` tracks `RUN_STARTED`/`RUN_FINISHED` in an `activeRunIds` Set keyed by `runId` and derives `sessionGenerating` from set size. Synthesized lifecycle chunks must therefore carry a DISTINCT runId per run (S4) — this plan uses `${sessionId}:${runEpoch}`.
- `ChatMiddleware.onBeforeToolCall` is async+awaited with skip/abort — but it only fires for tools the `chat()` agent loop executes; tools the claude CLI executes via the MCP bridge NEVER pass through it (C3). The gate therefore stays on the existing ai-sandbox sockets: `gateProvisioner` → tool-bridge `permission.resolve` + wrapped bridged `execute`s (`packages/core/src/chat/sandbox.ts`).
- `node:events`: `on(emitter, 'change', {signal})` returns an AsyncIterator that unregisters on abort; it queues (no coalescing) — the emit side dedups per microtask (Task 2).
- drizzle rc.4 on node-sqlite: `db.update(...).set(...).where(...).returning({...}).all()` is SYNCHRONOUS (`node-sqlite/session.js:28,40,44` executes `stmt.all/run` on `DatabaseSync`; `sqlite-core/update.js:124` has `returning`). `claimed.length === 1` is the portable atomic-claim check (verified sound). `select` `.all()` is likewise sync — `statusOf`/`modelOf` below are sync reads.
- `@conciv/db` stores emit via a local `listeners` Set + `emit()` after every write; the new `run-state` store copies that shape.
- `packages/core/src/chat/sandbox.ts` holds a module-level `sandboxes` Map keyed by cwd → Task 4 hoists the definition into `makeApp` composition.
- `ServerSessions.chatBusy` (`packages/extension/src/types.ts:85`) is public extension API consumed by the terminal extension (`packages/extensions/terminal/src/server.ts:98`) — re-homed onto the status column (C1). `sessionModel` is consumed SYNCHRONOUSLY by the MCP lane (`api/mcp/mcp.ts:68,75`) — re-homed onto a sync `modelOf` column read (C2).

## Locked interfaces (user-locked 2026-07-10; review-amended — do not deviate without a new review)

```ts
// @conciv/db — session-store.ts additions
claimRun(id: string, kind: 'chat' | 'compact'): boolean   // atomic: status 'idle' → 'running'|'compacting'; bumps runEpoch; clears the session's run rows
releaseRun(id: string, error?: string | null): void        // → 'idle'; writes lastError (null = clean)
requestStop(id: string): boolean                           // 'running'|'compacting' → 'stopping'
statusOf(id: string): 'idle' | 'running' | 'compacting' | 'stopping'   // SYNC read
modelOf(id: string): string | null                                     // SYNC read
runEpochOf(id: string): number                                         // SYNC read

// @conciv/db — run-state.ts (NEW store; sole home of live-run state)
export type RunState = {
  setMessages(sessionId: string, messages: unknown): void
  messages(sessionId: string): unknown | null
  reply(sessionId: string, key: string, value: unknown): void
  replyFor(sessionId: string, key: string): unknown | null
  sessions(): string[]                       // session ids with a run row (for permissionDecision routing)
  clear(sessionId: string): void             // messages + replies for the session
  watch(listener: () => void): () => void
}
// LIFETIME (S5): run rows are NOT cleared when a run ends — they persist until the session's
// NEXT claimRun (which clears them) or the openDb boot sweep. This bridges the harness
// transcript-flush window: attach dedups settled-vs-run overlap by slicing (Task 6).

// core/chat/wait.ts — THE one invention
export function awaitReply(waitDeps: WaitDeps, sessionId: string, key: string, timeoutMs: number): Promise<unknown | null>
export type WaitDeps = {runState: RunState; changes: EventEmitter}

// core/chat/run.ts
export function startRun(deps: ChatDeps, sessionId: string, req: RunRequest): Promise<void>   // caller has claimed
export type RunRequest = {messages: ModelMessage[]; model: string | null; kind: 'chat' | 'compact'}

// core/chat/runtime.ts — ChatDeps replaces ChatRuntime
export type ChatDeps = {
  cwd: string; stateRoot: string; systemText: string; claudeHome?: string
  harness: HarnessAdapter; harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv
  sandbox: SandboxDefinition
  store: SessionStore; runState: RunState; changes: EventEmitter
  risky: ReadonlySet<string>                 // approval:'ask' extension tool names, built once in makeApp (C3)
  tools: (sessionId: string, model: string | null) => AnyTool[]
  onRunStart?: (sessionId: string) => void
  onRunEnd?: (sessionId: string) => Promise<void>
}
```

Deliberate consequences (binding):

- `sessions` rows gain `status`, `lastError`, `runEpoch`; `SessionRecordSchema` (protocol) moves in lockstep; the wire `SessionMeta.status` enum is unchanged (`'stopping'` maps to `'running'` on the wire).
- `attach` yields ONLY: `MESSAGES_SNAPSHOT`s plus synthesized `RUN_STARTED`/`RUN_FINISHED`/`RUN_ERROR` with `runId = ${sessionId}:${runEpoch}`, derived from `(status, runEpoch)` observations so coalesced transitions still emit matched pairs (S4). Raw text/tool deltas NEVER cross the wire anymore.
- Accepted trade-off (S6, user-approved direction "uniformity over delta efficiency"): each snapshot carries the full message array; the attach generator additionally rate-limits re-yields to one per `SNAPSHOT_MIN_INTERVAL_MS = 50` while unchanged-status, so cost is O(thread size) per 50ms per open window, on localhost. Revisit only if plan-3 UX shows lag.
- A STOPPED run is a CLEAN finish (C5): `releaseRun(id, null)` when `abort.signal.aborted`, so attach synthesizes `RUN_FINISHED {finishReason: 'stop'}`, never `RUN_ERROR`.
- `chatBusy(sessionId)` = `store.statusOf(sessionId) !== 'idle'` (C1). MCP/`ToolRequest.model` = `store.modelOf(sessionId)` (C2).
- `chat.permissionDecision` (no sessionId in its contract input) routes by scanning `runState.sessions()` for the session whose messages contain a tool-call part with `approval.id === approvalId`; unmatched decisions are a no-op `{ok: true}` (today's gate.resolve was equally fire-and-forget) (C7/S7 — no `''` scope, no leak).
- `UNKNOWN_REQUEST` for `uiReply` = no pending `conciv_ui` tool-call part with that `toolCallId` in the session's run messages.
- Composer queue-vs-disable while running is a plan-3 client decision; the server only offers the atomic claim.

---

### Task 1: `@conciv/db` — status/epoch columns, run-state store, boot sweep

**Files:**

- Modify: `packages/db/src/schema.ts`, `packages/db/src/session-store.ts`, `packages/db/src/index.ts`, `packages/db/src/db.ts` (boot sweep inside `openDb`)
- Create: `packages/db/src/run-state.ts`
- Modify: `packages/protocol/src/chat-types.ts` (`SessionRecordSchema` gains `status`, `lastError`, `runEpoch` — with input-side defaults so existing `create()` call sites compile unchanged)
- Create: migration via drizzle-kit (committed SQL in `packages/db/drizzle/`)
- Test: `packages/db/test/run-state.test.ts`, additions to `packages/db/test/session-store.test.ts`

**Interfaces:** the locked shapes above. `claimRun` additionally `runEpoch = runEpoch + 1` and DELETES the session's `run_messages` + `replies` rows in the same synchronous call (S5 lifetime rule). `openDb` boot sweep after migrations: `UPDATE sessions SET status='idle' WHERE status != 'idle'` + `DELETE FROM run_messages` + `DELETE FROM replies` (`lastError` is NOT swept — it is per-run news, cleared by the next `claimRun`).

- [ ] **Step 1: Load the migration skill, write failing tests**

Run: `pnpm dlx @tanstack/intent@latest load drizzle-kit#drizzle-migrations`.

`packages/db/test/session-store.test.ts` additions (copy the existing `openDb(tmp)` fixture idiom):

```ts
it('claimRun is atomic, bumps runEpoch, and clears prior run rows', async () => {
  const {store, runState} = fixture()
  await store.create(rec('conciv_c'))
  runState.setMessages('conciv_c', [{id: 'stale', role: 'assistant', parts: []}])
  runState.reply('conciv_c', 'stale-key', true)
  const epochBefore = store.runEpochOf('conciv_c')
  expect(store.claimRun('conciv_c', 'chat')).toBe(true)
  expect(store.claimRun('conciv_c', 'chat')).toBe(false)
  expect(store.statusOf('conciv_c')).toBe('running')
  expect(store.runEpochOf('conciv_c')).toBe(epochBefore + 1)
  expect(runState.messages('conciv_c')).toBeNull()
  expect(runState.replyFor('conciv_c', 'stale-key')).toBeNull()
  store.releaseRun('conciv_c', null)
  expect(store.statusOf('conciv_c')).toBe('idle')
  expect(store.claimRun('conciv_c', 'compact')).toBe(true)
  expect(store.statusOf('conciv_c')).toBe('compacting')
})

it('releaseRun records lastError; requestStop only flips a live run', async () => {
  const {store} = fixture()
  await store.create(rec('conciv_s'))
  expect(store.requestStop('conciv_s')).toBe(false)
  store.claimRun('conciv_s', 'chat')
  expect(store.requestStop('conciv_s')).toBe(true)
  expect(store.statusOf('conciv_s')).toBe('stopping')
  store.releaseRun('conciv_s', 'boom')
  expect((await store.get('conciv_s'))?.lastError).toBe('boom')
})

it('modelOf reads the column synchronously', async () => {
  const {store} = fixture()
  await store.create({...rec('conciv_m'), model: 'haiku'})
  expect(store.modelOf('conciv_m')).toBe('haiku')
  expect(store.modelOf('missing')).toBeNull()
})
```

`packages/db/test/run-state.test.ts`:

```ts
it('messages and replies round-trip; run rows survive until the next claim', () => {
  const {store, runState} = fixture()
  expect(runState.messages('s1')).toBeNull()
  runState.setMessages('s1', [{id: 'm1', role: 'assistant', parts: []}])
  runState.reply('s1', 'call_1', {answered: true})
  expect(runState.messages('s1')).toEqual([{id: 'm1', role: 'assistant', parts: []}])
  expect(runState.replyFor('s1', 'call_1')).toEqual({answered: true})
  expect(runState.replyFor('s1', 'other')).toBeNull()
  expect(runState.sessions()).toEqual(['s1'])
  runState.clear('s1')
  expect(runState.messages('s1')).toBeNull()
  expect(runState.replyFor('s1', 'call_1')).toBeNull()
})

it('watch fires on every write', () => { /* setMessages, reply, clear → 3 fires (same shape as session-store watch test) */ })

it('openDb boot sweep resets stuck runs', () => {
  /* open db A: create + claimRun + setMessages + reply; openDb same stateRoot again:
     statusOf idle, messages null, replyFor null (two connections on one file — WAL test idiom) */
})
```

- [ ] **Step 2: Implement schema + stores**

`schema.ts`: sessions gains `status: text('status', {enum: ['idle', 'running', 'compacting', 'stopping']}).notNull().default('idle')`, `lastError: text('last_error')`, `runEpoch: integer('run_epoch').notNull().default(0)`. New tables:

```ts
export const runMessages = sqliteTable('run_messages', {
  sessionId: text('session_id').primaryKey(),
  messages: text('messages').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const replies = sqliteTable(
  'replies',
  {
    sessionId: text('session_id').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [primaryKey({columns: [table.sessionId, table.key]})],
)
```

`session-store.ts` claim family — synchronous via `.returning(...).all()` / `.run()`:

```ts
claimRun: (id, kind) => {
  const claimed = db
    .update(sessions)
    .set({
      status: kind === 'chat' ? 'running' : 'compacting',
      lastError: null,
      runEpoch: sql`${sessions.runEpoch} + 1`,
      updatedAt: now(),
    })
    .where(and(eq(sessions.id, id), eq(sessions.status, 'idle')))
    .returning({id: sessions.id})
    .all()
  if (claimed.length !== 1) return false
  db.delete(runMessages).where(eq(runMessages.sessionId, id)).run()
  db.delete(replies).where(eq(replies.sessionId, id)).run()
  emit()
  return true
},
```

(`releaseRun(id, error)` sets `{status: 'idle', lastError: error ?? null}` unconditionally on the row; `requestStop` guards `inArray(sessions.status, ['running', 'compacting'])`; `statusOf`/`modelOf`/`runEpochOf` are sync `select(...).all()[0]` reads with safe fallbacks `'idle'`/`null`/`0`.)

`run-state.ts` mirrors the session-store listener idiom; `setMessages` upserts (`onConflictDoUpdate`), JSON round-trip, `messages()` returns parsed `unknown`; `sessions()` = `select distinct session_id from run_messages`.

`openDb`: after `migrate(...)`, run the sweep statements.

- [ ] **Step 3: Generate migration; run** `pnpm turbo run test --filter=@conciv/db --filter=@conciv/protocol` — PASS.
- [ ] **Step 4: Commit** `feat(db,protocol): sessions status/epoch atomic claim + run-state store (run messages, replies)` — pathspec `packages/db packages/protocol`.

---

### Task 2: `node:events` replaces LiveFeed

**Files:**

- Delete: `packages/core/src/rpc/live.ts`, `packages/core/test/rpc/live.test.ts`
- Create: `packages/core/src/rpc/changes.ts`
- Modify: `packages/core/src/app.ts`, `packages/core/src/rpc/router.ts`
- Test: `packages/core/test/rpc/changes.test.ts`

**Interfaces:** `makeChanges(): {changes: EventEmitter; notify: () => void}`, one `'change'` emit per microtask. `RpcDeps.live` → `changes: EventEmitter`. Every live handler:

```ts
live: os.drafts.live.handler(async function* ({input, signal}) {
  yield await uiState.getDraft(input.sessionId)
  for await (const _ of on(changes, 'change', {signal: signal ?? new AbortController().signal})) {
    yield await uiState.getDraft(input.sessionId)
  }
}),
```

- [ ] **Step 1: Failing test** — 3 sync `notify()` → exactly 1 event after a microtask; later batch emits again; no MaxListeners warning with 20 concurrent `on()` iterators (`changes.setMaxListeners(0)`).
- [ ] **Step 2: Implement**

```ts
import {EventEmitter} from 'node:events'

export function makeChanges(): {changes: EventEmitter; notify: () => void} {
  const changes = new EventEmitter()
  changes.setMaxListeners(0)
  const state = {queued: false}
  const notify = (): void => {
    if (state.queued) return
    state.queued = true
    queueMicrotask(() => {
      state.queued = false
      changes.emit('change')
    })
  }
  return {changes, notify}
}
```

`app.ts`: wire `store.watch(notify)`, `uiState.watch(notify)`, `runState.watch(notify)`, run-start listeners → `notify`. Router: swap every `live.subscribe` loop; delete `makeLiveFeed`.

- [ ] **Step 3: Run** `pnpm --filter @conciv/core exec vitest run test/rpc` — behavior ITs stay green.
- [ ] **Step 4: Commit** `feat!(core): node:events change signal replaces the hand-rolled LiveFeed`

---

### Task 3: `wait.ts` — awaitReply + the two reply rpcs

**Files:**

- Create: `packages/core/src/chat/wait.ts`
- Modify: `packages/core/src/rpc/router.ts` (`chat.uiReply`, `chat.permissionDecision` handlers)
- Test: `packages/core/test/chat/wait.test.ts`

**Interfaces:** `awaitReply(waitDeps, sessionId, key, timeoutMs)` — resolves an existing reply row immediately, else awaits the change event until the row appears or timeout (`null`). BOTH reply kinds key under the REAL sessionId (C7/S7):

- `uiReply` handler: pending-part check (Task 5 provides `pendingUiCallIds(runState, sessionId)`) → `runState.reply(sessionId, toolCallId, value)`; else `UNKNOWN_REQUEST`.
- `permissionDecision` handler: `sessionForApproval(runState, approvalId)` scans `runState.sessions()` for a run whose messages contain a tool-call part with `approval.id === approvalId` (at most a handful of rows exist — only claimed sessions); found → `runState.reply(sessionId, approvalId, approved)`; not found → no-op `{ok: true}`.

- [ ] **Step 1: Failing tests** — real db + real emitter, no server:

```ts
it('resolves an existing reply immediately', async () => {
  runState.reply('s1', 'k1', {answered: true, value: 'yes'})
  expect(await awaitReply(deps, 's1', 'k1', 1000)).toEqual({answered: true, value: 'yes'})
})
it('resolves when the reply lands later via the change event', async () => {
  const pending = awaitReply(deps, 's1', 'k2', 5000)
  runState.reply('s1', 'k2', true)
  expect(await pending).toBe(true)
})
it('times out to null and leaves no listeners', async () => {
  expect(await awaitReply(deps, 's1', 'nope', 30)).toBeNull()
  expect(deps.changes.listenerCount('change')).toBe(0)
})
```

- [ ] **Step 2: Implement** — race a timer against an `on(changes, 'change', {signal})` loop re-checking `replyFor`; abort the internal controller in `finally`; assert zero leaked listeners in every test.
- [ ] **Step 3: Run + commit** `feat(core): awaitReply — the one wait primitive over the replies row`

---

### Task 4: the run pump — `run.ts` rewrite; turn-hub dies

**Files:**

- Rewrite: `packages/core/src/chat/turn.ts` (renamed Task 7): `startRun` + resume-token helpers; `withTurnEffects`/`mapTurnChunk` deleted
- Modify: `packages/core/src/chat/send-turn.ts`, `packages/core/src/chat/compact.ts` (claim via `store.claimRun`; compact's `active` Set DELETED — `compacting` derives from status), `packages/core/src/chat/chat-env.ts` → `ChatDeps`, `packages/core/src/app.ts` (hub wiring out; `chatBusy: (id) => store.statusOf(id) !== 'idle'`; `sessionModel` dies — MCP vars get `modelOf`; sandbox definition hoisted into `makeApp`, `sandboxes` module Map deleted from `sandbox.ts`)
- Modify: `packages/core/src/api/mcp/mcp.ts` (`sessionModel` → `store.modelOf`), `packages/core/src/chat/chat-tools.ts` (`buildChatTools(makeCtx, extensionTools)` — model now a per-call arg from the run; MCP-lane `ToolRequest.model` uses `modelOf`)
- Delete: `packages/core/src/runtime/turn-hub.ts`, `packages/core/test/runtime/turn-hub.test.ts`
- Test: new `packages/core/test/chat/run.test.ts`; rewrite hub-touching assertions in `packages/core/test/chat/turn-session.test.ts`; update `packages/core/test/api/extension-server-surfaces.it.test.ts` only if its chatBusy assertions need re-wording (behavior identical)

**The pump (S1-corrected constructor; C5 stop semantics):**

```ts
export async function startRun(deps: ChatDeps, sessionId: string, req: RunRequest): Promise<void> {
  const abort = new AbortController()
  const processor = new StreamProcessor({
    events: {onMessagesChange: (messages) => deps.runState.setMessages(sessionId, messages)},
  })
  const lastUser = req.messages.findLast((message) => message.role === 'user')
  if (lastUser && typeof lastUser.content === 'string') processor.addUserMessage(lastUser.content)
  const stopWatch = watchForStop(deps, sessionId, abort)
  const outcome = {error: null as string | null, usage: null as UsageSnapshot | null}
  try {
    const stream = await buildRunStream(deps, sessionId, req, processor, abort)
    for await (const chunk of stream) {
      processor.processChunk(chunk)
      tapSessionId(chunk, (id) => void recordMintedToken(deps.store, sessionId, id).catch(() => {}))
      if (chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls' && chunk.usage) {
        outcome.usage = usageSnapshotFor(deps, req.model, chunk.usage)
      }
    }
  } catch (error) {
    if (!abort.signal.aborted) outcome.error = errorMessage(error)
  } finally {
    stopWatch.dispose()
    await recordRunEnd(deps, sessionId, processor, outcome).catch(() => {})
    deps.store.releaseRun(sessionId, outcome.error)
    if (deps.onRunEnd) await deps.onRunEnd(sessionId).catch(() => {})
  }
}
```

- NOTE (S5): `runState.clear` is NOT called here — run rows persist until the next `claimRun`/boot sweep.
- `recordRunEnd` writes `usage` (when present) + `messageCount: processor.getMessages().length` + `updatedAt` onto the session row.
- `buildRunStream` = today's `buildTurnStream` minus the uiBus merge; gate construction moves inside it (Task 5): `const gate = makeRunGate({sessionId, processor, waitDeps: {runState: deps.runState, changes: deps.changes}, risky: deps.risky})`, threaded to `config.decide` exactly where `deps.gate.decide` sits today.
- `watchForStop`: spawned `on(changes,'change',{signal})` loop; `store.statusOf(sessionId) === 'stopping'` → `abort.abort()`; `dispose()` aborts the loop's controller. Request-scoped, torn down in `finally`.
- `sessions.stop` rpc → `store.requestStop(sessionId)`.
- `send`/`compact`: `if (!store.claimRun(id, kind)) throw SESSION_BUSY`; pre-pump failure → `store.releaseRun(id, null)`; `send` fire-and-forgets, `compact` awaits.

- [ ] **Step 1: Failing unit test** `run.test.ts` — `createFakeHarness`, no server: run row fills while `__scripted.hold()` (assert via `runState.messages`), status idle after `release()` with run row STILL PRESENT (S5), `requestStop` mid-hold → aborted, `lastError` null (clean stop), scripted throw → `lastError` set; next `claimRun` clears the old rows. Update `makeChatFixture` (hub/uiBus out; `runState`+`changes`+`sandbox`+`risky` in).
- [ ] **Step 2: Implement; delete turn-hub + its test; wire app.ts + mcp.ts.**
- [ ] **Step 3: Run** `test/chat/run.test.ts`, `test/chat/turn-session.test.ts`, `test/api/extension-server-surfaces.it.test.ts` — green. Whole-suite red expected until Task 6.
- [ ] **Step 4: Commit** `feat!(core): runs are functions folding through TanStack's StreamProcessor into db rows — turn-hub deleted`

---

### Task 5: gate + ask on the existing sockets; ui-asks and the pending map die

**Files:**

- Rewrite: `packages/core/src/chat/permission.ts` → `makeRunGate` on `awaitReply` (merges into `sandbox.ts` in Task 7)
- Modify: `packages/core/src/chat/chat-tools.ts` + app `makeToolCtx` (`conciv_ui` execute = pending-part wait + `awaitReply`)
- Modify: `packages/tools/src/types.ts`/`ui.ts` if `askUi`'s context shape shifts (it stays `() => Promise<UiAnswer>` — only the app-side construction changes)
- Delete: `packages/core/src/runtime/ui-asks.ts`, `packages/core/test/runtime/ui-asks.test.ts`; `packages/core/src/pending.ts` → MOVE `makePending` into `packages/core/src/api/page/` (page bus is its only remaining consumer; plan-4 death row)
- Test: rewrite `packages/core/test/permission-gate.test.ts`; new `packages/core/test/chat/ui-asks-flow.it.test.ts` (the 2.5 live-order ITs re-homed onto the wire); the 2.5 arrival-order pairing unit tests DELETE (pairing problem no longer exists)

**The gate (S2/S3-corrected — NO ai-sandbox event builder, NO payload change, NO onBeforeToolCall):**

```ts
export function makeRunGate(gateDeps: {
  sessionId: string
  processor: StreamProcessor
  waitDeps: WaitDeps
  risky: ReadonlySet<string>
  timeoutMs?: number
}): PermissionGate
// decide(toolName, input, toolUseId):                       ← signature UNCHANGED; sandbox.ts sockets compile untouched
// 1. needsApproval? (risky.has(toolName) || Bash classifyCommand !== 'allow') — else 'allow'   (C3: risky set STAYS)
// 2. approvalId = randomUUID()
// 3. await the folded tool-call part: until(processor.getMessages() has a tool-call part with id === toolUseId,
//    via the change event, bounded 5s) — the fold and the permission callback race (S3); if it never appears,
//    processChunk a synthetic TOOL_CALL_START/END pair for toolUseId first (deterministic fallback, no data loss)
// 4. processor.processChunk(aguiApprovalRequestedFor({toolCallId: toolUseId, toolName, input, approvalId}))
//    — the EXISTING protocol event; the processor annotates the part with approval.id (processor.js:1144)
// 5. approved = await awaitReply(waitDeps, sessionId, approvalId, timeoutMs ?? 120_000)
// 6. return approved === true ? 'allow' : 'deny'
// resolve(approvalId, approved) DELETED from the gate — the rpc writes the reply row (Task 3)
```

`conciv_ui` execute (app's `makeToolCtx().askUi`): wait (bounded 5s, change event) for the newest `tool-call` part named `conciv_ui` in `runState.messages(sessionId)` that has no reply row; then `awaitReply(waitDeps, sessionId, part.id, UI_ASK_TIMEOUT_MS)`; timeout → the 2.5 `UNANSWERED` shape. Reply-before-part order is covered because reply rows persist until the next claim. Export `pendingUiCallIds(runState, sessionId)` for the `uiReply` rpc check.

`aguiApprovalRequestedFor` STAYS in protocol verbatim. `packages/ui-kit-chat` is NOT touched — the card's `part.approval.id` keying (permission.tsx:21-31) keeps working because the wire payload is byte-identical (C6).

- [ ] **Step 1: Failing tests** — permission-gate rewrite (real `StreamProcessor` + real db fixture): (a) safe tool → allow, no event; (b) risky tool with its TOOL_CALL_START already folded → pending approval part visible in `processor.getMessages()` with `approval.id`, `reply(sessionId, id, true)` → allow; (c) risky tool with NO folded part → synthetic-part fallback path produces the annotated part; (d) timeout 30ms → deny. `ui-asks-flow.it.test.ts`: scripted `conciv_ui` tool call over the wire → `uiReply` before AND after the part appears → both succeed; wrong toolCallId → `UNKNOWN_REQUEST`.
- [ ] **Step 2: Implement; delete ui-asks; move makePending.**
- [ ] **Step 3: Run** the new suites + `pnpm turbo run test --filter=@conciv/tools`.
- [ ] **Step 4: Commit** `feat!(core): approvals + conciv_ui block on awaitReply inside the existing sandbox sockets — ui-asks registry and pending map deleted`

---

### Task 6: attach as a live query + testkit re-derivation

**Files:**

- Rewrite: `packages/core/src/chat/attach.ts`
- Modify: `packages/core/src/rpc/router.ts` (`chat.attach` handler; `rpcSessionList` status from the column, `'stopping'→'running'` on the wire; `compacting` from status — `Compactor.compacting` deleted)
- Modify: `packages/harness-testkit/src/run-stream.ts` + `run-events.ts` — FULL re-derivation (C4): `text()` = concatenated text parts of the LAST snapshot's assistant messages; `toolCalls(name?)` = tool-call parts of the last snapshot; `waitForToolCall(name)` = waitFor a snapshot containing the part; `custom(name?)` — CUSTOM chunks no longer cross the wire: re-derive consumers from part states or delete the helper if orphaned (grep first); generic `waitFor(predicate)`/`waitForText` KEEP operating on raw received chunks (snapshots + lifecycle ARE chunks) but every existing call site passing `TOOL_CALL_*`/`TEXT_MESSAGE_*`/`CUSTOM` predicates must be re-pointed — worklist: `grep -rn "TOOL_CALL_\|TEXT_MESSAGE_\|EventType.CUSTOM" packages/*/test packages/harness-testkit/src --include='*.ts'`
- Modify: `packages/core/test/rpc/wire.it.test.ts` (incl. the `conciv_ui` IT that reads `TOOL_CALL_RESULT.content` at :241 — its assertion moves to the final snapshot's tool-result part), `packages/client/test/*` (re-pin to snapshots; `chatConnection`/`useChatSession` PROD code unchanged)
- Test: new attach IT (below)

**`attachLive(deps, sessionId, signal)` — S4/S5/S6-corrected shape:**

```ts
// state per generator (request-scoped locals): lastKey, lastSeen = {epoch, running}
// 1. yield MESSAGES_SNAPSHOT(buildSnapshot())      — settled transcript SLICED against run messages + run messages
// 2. if statusOf ∈ {running, compacting, stopping} → yield RUN_STARTED {runId: `${sessionId}:${epoch}`}
// 3. for await on(changes) (rate-limited to SNAPSHOT_MIN_INTERVAL_MS = 50):
//    read {epoch: runEpochOf, status: statusOf, key: runMessages.updatedAt + session.updatedAt}
//    - epoch advanced past lastSeen.epoch while lastSeen.running → yield RUN_FINISHED(lastSeen) THEN RUN_STARTED(new)   (S4: coalesced running→idle→running)
//    - running → idle: lastError set → RUN_ERROR {message: lastError} else RUN_FINISHED {finishReason: 'stop'}          (C5)
//    - idle → running: RUN_STARTED {runId: `${sessionId}:${epoch}`}
//    - 'stopping' counts as running (no lifecycle emit on running→stopping)
//    - key changed → yield fresh MESSAGES_SNAPSHOT
```

`buildSnapshot` (S5 dedup): `settledMessages(transcript, firstUserTextOf(runMessages))` + run messages — the existing `settled-history.ts` slicing, keyed on `runMessages[0]` (the processor's `addUserMessage`) instead of `hub.pendingUserMessage`. Because run rows persist after run end, the post-run snapshot keeps showing the final turn from the run row until the transcript contains it, at which point the slice removes the overlap — no vanishing-message window.

- [ ] **Step 1: Write the attach IT first** — send → attach mid-hold: snapshot contains pending user message; partial assistant text arrives via a later snapshot after `release()`; `RUN_STARTED` present with epoch-suffixed runId; after release → `RUN_FINISHED` + final snapshot; final assistant message STILL in snapshots immediately after run end (transcript-flush window, S5); stop mid-run → `RUN_FINISHED {finishReason:'stop'}` and NO `RUN_ERROR`; failing harness → `RUN_ERROR` with the message; back-to-back sends (two epochs) → two matched STARTED/FINISHED pairs even under coalescing.
- [ ] **Step 2: Implement attach + testkit; sweep the C4 worklist.**
- [ ] **Step 3: Run** `pnpm turbo run test --filter=@conciv/core --filter=@conciv/harness-testkit --filter=@conciv/client --filter=@conciv/extension-testkit` — GREEN (this task un-reds the world).
- [ ] **Step 4: Live E2E** — `test/testkit/create-testkit.it.test.ts` (`[real]` claude blocking round-trip) green with a real claude.
- [ ] **Step 5: Commit** `feat!(core,harness-testkit,client): chat.attach is a live query — snapshots + synthesized lifecycle, no deltas on the wire`

---

### Task 7: folder restructure + turn→run vocabulary

**Files (git mv + import rewrites; NO behavior change — suites stay green):**

- `chat/turn.ts` → `chat/run.ts`; `send-turn.ts` → `send.ts`; `chat-env.ts` → `runtime.ts`; `chat-tools.ts` → `tools.ts`; `settled-history.ts` + `messages.ts` merge → `history.ts`; `permission.ts` merges into `sandbox.ts`; `policy/command-policy.ts` → `chat/policy.ts` (folder dies)
- `api/mcp/mcp.ts` → `mcp/mcp.ts`; `api/server/server.ts` → `bundler/bundler.ts`; `api/page/*` + `page/symbolicate.ts` + `runtime/journal.ts` + the moved `pending.ts` → `page/`; `api/cors.ts` → `cors.ts` (root); `runtime/harness-logger.ts` → `debug.ts` (root); `runtime/`+`api/`+`store/`+`policy/` dissolve
- `engine.ts` → `start.ts` (`packages/core/package.json` `./engine` export → `./start`; `packages/plugin/src/core/vite.ts` import updated)
- `rpc/router.ts` split by contract namespace: `rpc/sessions.ts`, `rpc/chat.ts`, `rpc/router.ts` (compose + page/editor/meta), `rpc/mount.ts`, `rpc/changes.ts`
- Identifier renames: `TurnDeps→ChatDeps` (Task 4), `onTurnStart/End→onRunStart/End` (extension `ServerSessions.onChatTurn` STAYS — public extension API, plan-4 ledger), RpcDeps `sendTurn` → `send`
- Test tree mirrors: `test/chat/*`, `test/rpc/*`; `test/runtime/` dissolves; **`packages/core/test/stream-effects.test.ts` imports `tapSessionId` from `../src/chat/turn.js` — re-point to `chat/run.js`** (C8)
- Modify: `AGENTS.md` security-section pointer (`api/chat/permission.ts` → `chat/sandbox.ts`)

- [ ] Move + fix imports (tsc guides) → full core+plugin+ripple suites green → Commit `refactor!(core): the locked file map — api/runtime/store/policy dissolve, run vocabulary`

---

### Task 8: sessions.list stops fs-scanning per change

**Files:** `packages/core/src/sessions/list.ts` (post-Task-7 home), test additions in `packages/core/test/chat/sessions-list.test.ts`

Run end writes `messageCount`/`updatedAt` (Task 4), so OUR records read rows only. The external-transcripts union (`hist.list`) wraps in an mtime cache (closure created once at `makeApp` composition): stat the transcript dir per call, re-scan only on mtime change.

- [ ] Test: list twice → `hist.list` called once (counting `history.list` via an extended `createFakeHarness` option); touch the dir → called again.
- [ ] Commit `perf(core): session list reads rows; external transcript scan cached by dir mtime`

---

### Task 9: plan-wide gates

- [ ] `pnpm typecheck && pnpm build && pnpm test` (environmental reds excepted)
- [ ] `pnpm exec fallow audit --changed-since main --format json` — zero INTRODUCED
- [ ] Anti-pattern greps, ALL empty in `packages/core/src`:
      `grep -rn "makeTurnHub\|TurnHub\|makeUiAsks\|UiAsks\|makeLiveFeed\|pulse()" packages/core/src --include='*.ts'`
      `grep -rn "makePending" packages/core/src --include='*.ts' | grep -v page/` (page-only)
      `grep -rn "new Map<" packages/core/src/chat --include='*.ts'` (empty)
      `grep -rn "startTurn\|sendTurn\|onTurnStart\|TurnDeps" packages/*/src --include='*.ts'` (empty)
- [ ] Commit gate fixes with pathspec.

---

## Review ledger (2026-07-10, two Opus adversarial agents; every finding folded above)

- **S1 CRITICAL** `StreamProcessor` handlers ride `options.events` — pump constructor corrected; Verified-facts corrected.
- **S2 CRITICAL + C6 MAJOR** `buildApprovalRequestedEvent` is processor-incompatible (flat payload, no `toolCallId`/`approval`; annotate-only handler throws on `approval.id`) — the ai-sandbox event swap is DEAD; `aguiApprovalRequestedFor` stays; ui-kit-chat untouched; card keying on `part.approval.id` preserved by construction.
- **S3 MAJOR** gate uses the real `toolUseId` as `toolCallId` and bounded-waits for the folded part (synthetic-part fallback) before injecting.
- **S4 MAJOR** synthesized lifecycle keys on `runEpoch` (new column, bumped per claim; runId = `sessionId:epoch`); attach derives from (status, epoch) so coalesced `running→idle→running` still emits matched pairs.
- **S5 MAJOR** run rows persist until the NEXT claim (not cleared at run end) — bridges the claude transcript-flush window; attach dedups via the existing settled-slicing keyed on `runMessages[0]`.
- **S6 MAJOR(perf)** full-snapshot-per-change cost documented as the accepted uniformity trade-off + `SNAPSHOT_MIN_INTERVAL_MS = 50` rate limit in the attach generator.
- **S7/C7 MINOR** no `''` reply scope: approvals key under the real sessionId; `permissionDecision` routes by scanning the (few) live run rows; rows reclaimed by the next claim.
- **C1 CRITICAL** `chatBusy` re-homed: `statusOf(id) !== 'idle'` (sync column read) — extension API + terminal extension keep working.
- **C2 MAJOR** `sessionModel` re-homed: sync `modelOf(id)` column read for the MCP lane and extension `ToolRequest.model`; per-run model rides `RunRequest`.
- **C3 MAJOR** `approval:'ask'` extension tools STAY in the risky set fed to the gate on the bridge socket — `onBeforeToolCall` never fires for CLI-executed tools; the needsApproval/middleware migration is dead.
- **C4 MAJOR** testkit re-derivation extended to `waitFor` call sites, `waitForText`, `RunEvents.custom`, and the `TOOL_CALL_RESULT`-reading `conciv_ui` IT; grep worklist included.
- **C5 MAJOR** stop is a clean finish: aborted runs release with `lastError = null` → `RUN_FINISHED {finishReason:'stop'}`; `stopping` counts as running for lifecycle derivation.
- **C8 MINOR** `test/stream-effects.test.ts` re-point listed in Task 7.
- Reviewer-verified sound (no change needed): drizzle rc.4 sync `.returning().all()` claim; client snapshot reconciliation (no flicker); `addUserMessage` fires `onMessagesChange`; gate reachability from `buildRunStream`; the claude adapter folds bridged MCP tool calls (so `conciv_ui`/approval parts DO appear server-side).
