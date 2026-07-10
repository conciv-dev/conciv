# Widget Rewrite Plan 2.7: TanStack-Native Core — db-backed runs, the wait, and the restructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild core's chat plane on the user-locked model — "their model everywhere, one invention: the wait" — then dissolve the leftover folder structure. All live state moves to sqlite rows; TanStack's own `StreamProcessor` folds the in-flight run; `chat.attach` becomes a plain live query; approvals and `conciv_ui` block inside TanStack extension points on ONE `awaitReply` function; `LiveFeed` is replaced by `node:events`.

**Architecture:** Three db things (a `status` column, a `runMessages` row, a `replies` row) + one stdlib `EventEmitter` + TanStack's processor. Zero module-level Maps keyed by session anywhere in core. Busy claim is an atomic synchronous UPDATE (node:sqlite is sync). A run is a function: claim → fold harness stream through `StreamProcessor` (a local) → write rows → release. Every live rpc surface (sessions/drafts/markers/attach) is the same 4-line shape: yield current, re-yield per change event.

**Tech Stack:** `@tanstack/ai` 0.40.0 (`chat()`, `StreamProcessor`, `ChatMiddleware.onBeforeToolCall`), `@tanstack/ai-sandbox` 0.2.2 (`buildApprovalRequestedEvent`, `approvalId`, policy/permission sockets), drizzle `1.0.0-rc.4` on `node:sqlite`, `node:events`, oRPC 1.14.7 (contract UNCHANGED).

**Spec lineage:** `docs/superpowers/specs/2026-07-09-widget-orpc-rewrite-design.md` v3.3 (this plan finally implements change 2's status column properly). Plans 1/2/2.5 are executed on this branch. Plan 3 (apps/conciv + embed) is authored AFTER this lands and builds on these surfaces.

## Global Constraints

- Functions, not classes (the `StreamProcessor` we CONSUME is theirs — instantiating it is fine; never subclass it). ZERO code comments. No `any`/`as`/non-null `!`. No IIFEs. Cyclomatic ≤ 4 per new function.
- NO module-level Maps/Sets keyed by sessionId anywhere in `packages/core/src` — this is the user's hard rule this plan exists to enforce. Request-scoped listener sets torn down by AbortSignal are the one allowed shape. Grep-gated in Task 9.
- Tests under `test/` only; no doubles/shims — real served apps via `@conciv/harness-testkit`, real sqlite, real typed oRPC clients.
- Build/typecheck via turbo. Commit with pathspec always. `pnpm exec fallow audit --changed-since main --format json` clean of INTRODUCED findings at the end.
- Known non-gating red: `test/api/mcp/claude-image.it.test.ts` and `test/codex-tanstack.it.test.ts` (environmental live-LLM).
- Mid-plan suites MAY be red between Tasks 4–6 (the chat plane swaps under its tests); each task's own listed suites must be green at its end, whole-world gates bind only in Task 9.
- drizzle stays EXACT `1.0.0-rc.4`. Before touching migrations run `pnpm dlx @tanstack/intent@latest load drizzle-kit#drizzle-migrations` and follow it.
- The oRPC contract (`packages/contract/src/contract.ts`) does NOT change in this plan. The wire stays: `chat.attach` = `eventIterator(StreamChunk)`, `chat.send`, `chat.uiReply`, `chat.permissionDecision`, `sessions.*`. Only what flows through `attach` changes shape (snapshots + synthesized lifecycle instead of raw deltas).

## Verified API facts (2026-07-10, read from installed node_modules — do NOT re-derive)

- `@tanstack/ai@0.40.0` exports `StreamProcessor` (and `createReplayStream`, unused here) from the package root. Public API: `constructor(options?: {onMessagesChange?, onToolCall?, onApprovalRequest?, onStreamEnd?, onError?, recording?, ...})`, `processChunk(chunk: StreamChunk): void`, `getMessages(): UIMessage[]`, `setMessages(messages)`, `addUserMessage(content, id?)`. Source: `dist/esm/activities/chat/stream/processor.d.ts`.
- Client-side mid-stream handoff is DESIGNED-FOR: `ensureAssistantMessage` (processor.js:444–455) — when a `TEXT_MESSAGE_CONTENT` arrives for a messageId that exists in `this.messages` (from a `MESSAGES_SNAPSHOT`) but has no stream state, it creates state seeded from the last text part (`currentSegmentText = lastPart.content`). Deltas continue the partial message seamlessly. `handleMessagesSnapshotEvent` resets stream state and reconciles tool-call parts (`reconcileSnapshotToolCalls`) so pending tool/approval cards survive snapshots.
- `ChatMiddleware.onBeforeToolCall?: (ctx, {toolCall, tool, args, toolName, toolCallId}) => BeforeToolCallDecision | Promise<...>` — async and awaited before tool execution; decisions: continue (void) | `{type:'transformArgs'}` | `{type:'skip', result}` | `{type:'abort'}`. `onChunk` may inject/transform chunks. Source: `dist/esm/activities/chat/middleware/types.d.ts:397-406`.
- Tool definitions accept `needsApproval?: boolean` (`tools/tool-definition.d.ts:18`). TanStack's OWN approval completion (`executeToolCalls(…, approvals: Map)` / client `addToolApprovalResponse`) is the re-send model — unusable with a CLI harness mid-run (2.5 deadlock finding). We use their flag + event + part states, and replace ONLY the completion path with `awaitReply`.
- `@tanstack/ai-sandbox@0.2.2` exports `resolveApproval`, `approvalId({provider, kind, target})`, `buildApprovalRequestedEvent({approvalId, title, threadId, runId, detail?})`, `APPROVAL_REQUESTED_EVENT = 'approval-requested'` (`dist/esm/approvals.d.ts`). NOTE their event payload is `{approvalId, title, detail}` — NOT our legacy `{toolCallId, toolName, input, approvalId}`. Task 6 reconciles the client card.
- The gate's harness socket already exists and stays: `packages/core/src/chat/sandbox.ts` `gateProvisioner` wires `gate.decide` into ai-sandbox's tool-bridge `permission.resolve` callback and wraps bridged tool `execute`s. Only the `decide` BODY changes.
- `node:events`: `on(emitter, name, {signal})` returns an AsyncIterator that unregisters on abort. It QUEUES (no coalescing) — the emit side dedups per microtask (Task 2).
- `node:sqlite` `DatabaseSync` is synchronous; drizzle rc.4 wraps it. For the atomic claim use `.returning({id: sessions.id})` and check `result.length === 1` (portable across drizzle drivers; do NOT rely on a `changes` field — verify the actual return shape in `node_modules/drizzle-orm` if tempted).
- `@conciv/db` stores emit via a local `listeners` Set + `emit()` after every write (see `session-store.ts`); the new `run-state` store copies that shape.
- `packages/core/src/chat/sandbox.ts` holds a module-level `sandboxes` Map keyed by cwd (definition memo). One entry per process in practice, but it violates the no-maps rule → Task 4 hoists the definition into app composition (created once in `makeApp`, threaded via deps).

## Locked interfaces (user-locked 2026-07-10 — do not deviate without a new review)

```ts
// @conciv/db — session-store.ts additions
claimRun(id: string, kind: 'chat' | 'compact'): boolean   // atomic: status 'idle' → 'running'|'compacting'
releaseRun(id: string): void                               // → 'idle'
requestStop(id: string): boolean                           // 'running'|'compacting' → 'stopping'

// @conciv/db — run-state.ts (NEW store; sole home of live-run state)
export type RunState = {
  setMessages(sessionId: string, messages: unknown): void
  messages(sessionId: string): unknown | null
  reply(sessionId: string, key: string, value: unknown): void
  replyFor(sessionId: string, key: string): unknown | null
  clear(sessionId: string): void            // messages + replies for the session
  watch(listener: () => void): () => void
}

// core/chat/wait.ts — THE one invention
export function awaitReply(waitDeps: WaitDeps, sessionId: string, key: string, timeoutMs: number): Promise<unknown | null>
export type WaitDeps = {runState: RunState; changes: EventEmitter}

// core/chat/run.ts
export function startRun(deps: ChatDeps, sessionId: string, req: RunRequest): Promise<void>   // caller has claimed
export type RunRequest = {messages: ModelMessage[]; model: string | null; kind: 'chat' | 'compact'}

// core/chat/runtime.ts — ChatDeps replaces ChatRuntime (gate/hub/uiBus/uiAsks/pending all gone)
export type ChatDeps = {
  cwd: string; stateRoot: string; systemText: string; claudeHome?: string
  harness: HarnessAdapter; harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv
  sandbox: SandboxDefinition
  store: SessionStore; runState: RunState; changes: EventEmitter
  tools: (sessionId: string, model: string | null) => AnyTool[]
  onRunStart?: (sessionId: string) => void
  onRunEnd?: (sessionId: string) => Promise<void>
}
```

Deliberate consequences (binding):

- `sessions` rows gain `status` + `lastError`; `SessionRecordSchema` (protocol) and the drizzle table move in lockstep; the wire `SessionMeta.status` enum is unchanged (`'stopping'` maps to `'running'` on the wire).
- `attach` yields ONLY: one `MESSAGES_SNAPSHOT` per relevant change, plus synthesized `RUN_STARTED`/`RUN_FINISHED`/`RUN_ERROR` derived from status transitions. Raw text/tool deltas NEVER cross the wire anymore.
- `UNKNOWN_REQUEST` for `uiReply` = no pending `conciv_ui` tool-call part with that `toolCallId` in the current run messages.
- Composer queue-vs-disable while running is a plan-3 client decision; the server only offers the atomic claim.

---

### Task 1: `@conciv/db` — status column, run-state store, boot sweep

**Files:**

- Modify: `packages/db/src/schema.ts` (sessions + two tables), `packages/db/src/session-store.ts`, `packages/db/src/index.ts`, `packages/db/src/db.ts` (boot sweep inside `openDb`)
- Create: `packages/db/src/run-state.ts`
- Modify: `packages/protocol/src/chat-types.ts` (`SessionRecordSchema` gains `status`, `lastError`)
- Create: migration via drizzle-kit (committed SQL in `packages/db/drizzle/`)
- Test: `packages/db/test/run-state.test.ts`, additions to `packages/db/test/session-store.test.ts`

**Interfaces:** Produces `claimRun/releaseRun/requestStop` on `SessionStore` and the whole `RunState` store (locked shapes above). `openDb` runs the boot sweep after migrations: `UPDATE sessions SET status='idle', lastError=NULL WHERE status != 'idle'; DELETE FROM run_messages; DELETE FROM replies` (single-writer boot hygiene — crash recovery lives HERE, not in core).

- [ ] **Step 1: Load the migration skill, then write failing tests**

Run: `pnpm dlx @tanstack/intent@latest load drizzle-kit#drizzle-migrations` and follow it for the generate step later.

`packages/db/test/session-store.test.ts` additions (copy the file's existing `openDb(tmp)` fixture idiom):

```ts
it('claimRun is atomic: second claim fails until release', async () => {
  const store = fixtureStore()
  await store.create(rec('conciv_c'))
  expect(store.claimRun('conciv_c', 'chat')).toBe(true)
  expect(store.claimRun('conciv_c', 'chat')).toBe(false)
  expect((await store.get('conciv_c'))?.status).toBe('running')
  store.releaseRun('conciv_c')
  expect(store.claimRun('conciv_c', 'compact')).toBe(true)
  expect((await store.get('conciv_c'))?.status).toBe('compacting')
})

it('requestStop only flips a live run', async () => {
  const store = fixtureStore()
  await store.create(rec('conciv_s'))
  expect(store.requestStop('conciv_s')).toBe(false)
  store.claimRun('conciv_s', 'chat')
  expect(store.requestStop('conciv_s')).toBe(true)
  expect((await store.get('conciv_s'))?.status).toBe('stopping')
})
```

`packages/db/test/run-state.test.ts`:

```ts
it('messages round-trip and clear wipes replies too', () => {
  const runState = fixtureRunState()
  expect(runState.messages('s1')).toBeNull()
  runState.setMessages('s1', [{id: 'm1', role: 'assistant', parts: []}])
  expect(runState.messages('s1')).toEqual([{id: 'm1', role: 'assistant', parts: []}])
  runState.reply('s1', 'call_1', {answered: true})
  expect(runState.replyFor('s1', 'call_1')).toEqual({answered: true})
  expect(runState.replyFor('s1', 'other')).toBeNull()
  runState.clear('s1')
  expect(runState.messages('s1')).toBeNull()
  expect(runState.replyFor('s1', 'call_1')).toBeNull()
})

it('watch fires on every write', () => {
  const runState = fixtureRunState()
  let fired = 0
  runState.watch(() => fired++)
  runState.setMessages('s1', [])
  runState.reply('s1', 'k', 1)
  runState.clear('s1')
  expect(fired).toBe(3)
})

it('openDb boot sweep resets stuck runs', () => {
  // open, claim + setMessages, close, re-open same stateRoot: status idle, run row gone
})
```

(Write the boot-sweep test body against the real `openDb` — open a db, `claimRun` + `setMessages`, then `openDb` the same stateRoot again and assert clean state. node:sqlite allows two connections on one file — the db test suite already does this in its WAL test.)

- [ ] **Step 2: Implement schema + stores**

`schema.ts`: `sessions` gains `status: text('status', {enum: ['idle', 'running', 'compacting', 'stopping']}).notNull().default('idle')` and `lastError: text('last_error')`. New tables:

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

`session-store.ts` — the claim family is SYNCHRONOUS (drizzle on `DatabaseSync` supports `.run()`-style sync execution; if the sync call shape fights rc.4, use the `returning` form and `.all()`):

```ts
claimRun: (id, kind) => {
  const claimed = db
    .update(sessions)
    .set({status: kind === 'chat' ? 'running' : 'compacting', lastError: null, updatedAt: now()})
    .where(and(eq(sessions.id, id), eq(sessions.status, 'idle')))
    .returning({id: sessions.id})
    .all()
  if (claimed.length === 1) emit()
  return claimed.length === 1
},
```

(`releaseRun`/`requestStop` are the same shape with their own `where` guards; both `emit()` only when a row changed. `SessionRecordSchema` in protocol gains `status: z.enum([...])` and `lastError: z.string().nullable()` with defaults so existing `create()` call sites compile unchanged — give both `.default('idle')` / `.default(null)` in the INPUT schema, explicit in the output.)

`run-state.ts` mirrors `session-store.ts`'s listener idiom; `setMessages` upserts (`insert … onConflictDoUpdate`), values `JSON.stringify`'d, `messages()` returns `JSON.parse` output as `unknown`.

`openDb`: after `migrate(...)`, run the three sweep statements.

- [ ] **Step 3: Generate the migration, run tests**

Run: `cd packages/db && pnpm exec drizzle-kit generate` (per the loaded skill; commit the SQL).
Run: `pnpm turbo run test --filter=@conciv/db --filter=@conciv/protocol`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(db,protocol): sessions.status atomic claim + run-state store (run messages, replies)" -- packages/db packages/protocol
```

---

### Task 2: `node:events` replaces LiveFeed

**Files:**

- Delete: `packages/core/src/rpc/live.ts`, `packages/core/test/rpc/live.test.ts`
- Create: `packages/core/src/rpc/changes.ts` (the microtask-once dedup, ~10 lines)
- Modify: `packages/core/src/app.ts`, `packages/core/src/rpc/router.ts`
- Test: `packages/core/test/rpc/changes.test.ts`

**Interfaces:** Produces `makeChanges(): {changes: EventEmitter; notify: () => void}` where `notify` coalesces to one `'change'` emit per microtask. `RpcDeps.live: LiveFeed` becomes `changes: EventEmitter`. Every live handler becomes:

```ts
live: os.drafts.live.handler(async function* ({input, signal}) {
  yield await uiState.getDraft(input.sessionId)
  for await (const _ of on(changes, 'change', {signal: signal ?? new AbortController().signal})) {
    yield await uiState.getDraft(input.sessionId)
  }
}),
```

- [ ] **Step 1: Failing test** — `changes.test.ts`: 3 sync `notify()` calls → exactly 1 `'change'` event after a microtask; a second batch later emits again; `changes.setMaxListeners(0)` is set (no MaxListeners warning with 20 concurrent `on()` iterators).
- [ ] **Step 2: Implement** —

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

`app.ts`: `const {changes, notify} = makeChanges()`; `store.watch(notify)`, `uiState.watch(notify)`, `runState.watch(notify)`, run-start listeners call `notify`. Router: swap every `live.subscribe(...)` loop for the `on(changes, ...)` shape; delete `makeLiveFeed` import/wiring.

- [ ] **Step 3: Run** `pnpm --filter @conciv/core exec vitest run test/rpc` — the live/query ITs (`test/rpc/wire.it.test.ts`, query tests) stay green; they assert behavior, not the mechanism.
- [ ] **Step 4: Commit** `feat!(core): node:events change signal replaces the hand-rolled LiveFeed`

---

### Task 3: `wait.ts` — awaitReply + the two reply rpcs

**Files:**

- Create: `packages/core/src/chat/wait.ts`
- Modify: `packages/core/src/rpc/router.ts` (`chat.uiReply`, `chat.permissionDecision` handlers)
- Test: `packages/core/test/chat/wait.test.ts`

**Interfaces:** `awaitReply(waitDeps, sessionId, key, timeoutMs): Promise<unknown | null>` — resolves the existing reply row immediately if present, else awaits the change event until the row appears or timeout (`null`). The rpc handlers become one-liners: `uiReply` → validate pending part (Task 5 owns that check) + `runState.reply(sessionId, toolCallId, value)`; `permissionDecision` → `runState.reply(sessionId, approvalId, approved)` — note `permissionDecision`'s input has NO sessionId in the contract; resolve the session by scanning live runs? NO — keep it session-less: write the reply under the reserved sessionId `'*'`… **Decision:** approvals key on `approvalId` which is globally unique (`approvalId()` is a hash of provider/kind/target + our per-ask uuid suffix, Task 5); store approval replies under `sessionId = ''` and have `awaitReply` for approvals use `''`. This keeps the contract unchanged. Document in code via naming: `REPLY_SCOPE_GLOBAL = ''`.

- [ ] **Step 1: Failing test** — real db + real emitter, no server:

```ts
it('resolves an existing reply immediately', async () => {
  runState.reply('s1', 'k1', {answered: true, value: 'yes'})
  expect(await awaitReply(deps, 's1', 'k1', 1000)).toEqual({answered: true, value: 'yes'})
})
it('resolves when the reply lands later via the change event', async () => {
  const pending = awaitReply(deps, 's1', 'k2', 5000)
  runState.reply('s1', 'k2', true)   // runState.watch is wired to notify in the fixture
  expect(await pending).toBe(true)
})
it('times out to null', async () => {
  expect(await awaitReply(deps, 's1', 'nope', 30)).toBeNull()
})
```

- [ ] **Step 2: Implement** — race a timer against an `on(changes, 'change', {signal})` loop that re-checks `replyFor`; always abort the internal controller in `finally` (no leaked listeners — assert `changes.listenerCount('change') === 0` after each test).
- [ ] **Step 3: Run + commit** `feat(core): awaitReply — the one wait primitive over the replies row`

---

### Task 4: the run pump — `run.ts` rewrite; turn-hub dies

**Files:**

- Rewrite: `packages/core/src/chat/turn.ts` → new content (renamed in Task 7; content lands now): `startRun`, resume-token helpers stay, `withTurnEffects`/`mapTurnChunk` machinery deleted (the processor + row writes replace it)
- Modify: `packages/core/src/chat/send-turn.ts`, `packages/core/src/chat/compact.ts` (claim via `store.claimRun`, release on pre-start failure via `store.releaseRun`; compact `active` Set DELETED — `compacting` derives from status)
- Modify: `packages/core/src/chat/chat-env.ts` → `ChatDeps` (locked shape), `packages/core/src/app.ts` wiring (hub gone; sandbox definition hoisted: `const sandbox = concivSandbox(opts.cwd)` created once in `makeApp`, `sandboxes` module Map deleted from `sandbox.ts`)
- Delete: `packages/core/src/runtime/turn-hub.ts`, `packages/core/test/runtime/turn-hub.test.ts`
- Test: rewrite `packages/core/test/chat/turn-session.test.ts` assertions that touched the hub; new `packages/core/test/chat/run.test.ts`

**Interfaces (consumed by Tasks 5–6):** `startRun(deps, sessionId, req)` — inside, ALL locals: `abort = new AbortController()`, `processor = new StreamProcessor({onMessagesChange: (m) => runState.setMessages(sessionId, m)})`, per-run gate (Task 5). The pump:

```ts
export async function startRun(deps: ChatDeps, sessionId: string, req: RunRequest): Promise<void> {
  const abort = new AbortController()
  const processor = new StreamProcessor({
    onMessagesChange: (messages) => deps.runState.setMessages(sessionId, messages),
  })
  const lastUser = req.messages.findLast((message) => message.role === 'user')
  if (lastUser && typeof lastUser.content === 'string') processor.addUserMessage(lastUser.content)
  const unwatchStop = watchForStop(deps, sessionId, abort)
  try {
    const stream = await buildRunStream(deps, sessionId, req, processor, abort)
    for await (const chunk of stream) processor.processChunk(chunk)
    await recordRunEnd(deps, sessionId, processor)
  } catch (error) {
    await deps.store.update(sessionId, {lastError: runErrorMessage(error, abort)}).catch(() => {})
  } finally {
    unwatchStop()
    deps.runState.clear(sessionId)
    deps.store.releaseRun(sessionId)
    if (deps.onRunEnd) await deps.onRunEnd(sessionId).catch(() => {})
  }
}
```

- `buildRunStream` = today's `buildTurnStream` minus the uiBus merge: `chat({adapter, messages, systemPrompts, threadId, tools: deps.tools(sessionId, req.model), modelOptions, middleware: [withConcivSandbox(deps.sandbox), gateMiddleware], abortController: abort, debug})`. Resume-token capture (`tapSessionId`) moves INTO the pump loop (`processChunk` first, then `tapSessionId(chunk, …)` — or a processor `onCustomEvent`; keep the direct tap, it is one line).
- `watchForStop`: an `on(changes,'change',{signal})` loop in a spawned async fn whose controller is aborted by `unwatchStop()`; when `store.get(sessionId).status === 'stopping'` → `abort.abort()`. (This is the request-scoped listener shape — torn down in `finally`.)
- `recordRunEnd`: usage from the final `RUN_FINISHED` (read it in the pump: keep `usage` in a local when `chunk.type === RUN_FINISHED && finishReason !== 'tool_calls'`), plus `messageCount: processor.getMessages().length` and `updatedAt` onto the session row (Task 8's list fix consumes this).
- `sessions.stop` rpc handler → `store.requestStop(sessionId)` (replaces `hub.markStopped`).
- `send`/`compact`: `if (!store.claimRun(id, kind)) throw SESSION_BUSY`; error path before the pump starts → `store.releaseRun(id)`; `send` fire-and-forgets the pump (`void startRun(...)`), `compact` awaits it.

- [ ] **Step 1: Failing unit test** `run.test.ts` — drive `startRun` with `createFakeHarness` (no server): assert run messages row fills while `__scripted.hold()`, run row cleared + status idle after `release()`, `requestStop` mid-hold aborts and releases, `lastError` set when the scripted stream throws. Use `makeChatFixture` (update it: hub/uiBus out, `runState`+`changes`+`sandbox` in).
- [ ] **Step 2: Implement; delete turn-hub + its test; fix `app.ts` wiring.**
- [ ] **Step 3: Run** `pnpm --filter @conciv/core exec vitest run test/chat/run.test.ts test/chat/turn-session.test.ts` — green. Whole-suite red is EXPECTED until Task 6 (attach/testkit still speak chunks).
- [ ] **Step 4: Commit** `feat!(core): runs are functions folding through TanStack's StreamProcessor into db rows — turn-hub deleted`

---

### Task 5: gate + ask on their sockets; ui-asks and the pending map die

**Files:**

- Rewrite: `packages/core/src/chat/permission.ts` → gate body on `awaitReply` (file merges into `sandbox.ts` in Task 7; content lands now)
- Modify: `packages/core/src/chat/chat-tools.ts` (`conciv_ui` execute = find pending part + `awaitReply`; extension tools with `approval: 'ask'` get `needsApproval: true` on their defs + an `onBeforeToolCall` middleware instead of the `mcp__conciv__` prefix set)
- Modify: `packages/tools/src/ui.ts` `ConcivToolContext.askUi` signature (now needs no registry — it receives a `(sessionId) => Promise<UiAnswer>` built from `awaitReply`; check `packages/tools/src/types.ts`)
- Delete: `packages/core/src/runtime/ui-asks.ts`, `packages/core/test/runtime/ui-asks.test.ts`, `packages/core/src/pending.ts` → MOVE `makePending` into `packages/core/src/api/page/` (page bus is its only remaining consumer; page plane is plan-4 death row)
- Modify: `packages/protocol/src/ui-types.ts` — `aguiApprovalRequestedFor` + `ApprovalRequest` DELETED; core uses `buildApprovalRequestedEvent` from `@tanstack/ai-sandbox`
- Test: `packages/core/test/permission-gate.test.ts` rewrite; `packages/core/test/chat/ui-asks-flow.it.test.ts` (new — the 2.5 live-flow assertions re-homed); the 2.5 unit tests for arrival-order pairing DELETE (the pairing problem no longer exists — toolCallId is read from the folded messages)

**Interfaces:**

```ts
// gate — constructed per run inside startRun, all args locals or deps
export function makeRunGate(gateDeps: {
  sessionId: string
  processor: StreamProcessor
  waitDeps: WaitDeps
  timeoutMs?: number
}): PermissionGate   // decide() unchanged signature — sandbox.ts gateProvisioner socket compiles untouched

// decide body:
// 1. classifyCommand allow → 'allow' (policy.ts unchanged this task)
// 2. id = approvalId({provider: 'conciv', kind: 'tool', target: toolName}) + ':' + randomUUID().slice(0, 8)
// 3. processor.processChunk(buildApprovalRequestedEvent({approvalId: id, title: toolName, threadId: sessionId, runId: sessionId, detail: {toolName, input}}))
//    — the event enters the folded messages via THEIR processor; attach snapshots carry the pending part
// 4. approved = await awaitReply(waitDeps, REPLY_SCOPE_GLOBAL, id, timeoutMs ?? 120_000)
// 5. return approved === true ? 'allow' : 'deny'
```

`conciv_ui` execute (in `chat-tools.ts` / app's `makeToolCtx`): find the newest `tool-call` part named `conciv_ui` in `runState.messages(sessionId)` with no reply row yet — await its appearance via the change event (bounded 5s; the chunk is folded before the MCP call resolves in the live-claude race, and the reply-first order is covered because `reply()` rows persist until `clear`) — then `awaitReply(waitDeps, sessionId, part.id, UI_ASK_TIMEOUT_MS)`; timeout → the 2.5 `UNANSWERED` shape. `uiReply` rpc: `UNKNOWN_REQUEST` unless that toolCallId is a pending `conciv_ui` part in the current run messages.

CLIENT-CARD RECONCILIATION (breaking, coordinated with `ui-kit-chat`): the approval event payload becomes ai-sandbox's `{approvalId, title, detail: {toolName, input}}`. `packages/ui-kit-chat` renders approval cards off the part's approval fields — grep `toolName` consumers under `packages/ui-kit-chat/src` and switch them to `detail.toolName`/`detail.input`; the tanstack processor path is IDENTICAL (it consumes `APPROVAL_REQUESTED_EVENT` by name — 2.5 verified; the builder is theirs so the name matches by construction).

- [ ] **Step 1: Failing tests** — permission-gate rewrite: gate with a real `StreamProcessor` + real db fixture; assert (a) safe tool → allow, no part; (b) risky tool → pending approval part visible in `processor.getMessages()`, `reply(GLOBAL, id, true)` → allow; (c) timeout 30ms → deny. `ui-asks-flow.it.test.ts`: port the two 2.5 live-order ITs onto the wire (send with scripted `conciv_ui` tool call → `uiReply` before/after the part appears → both succeed; wrong toolCallId → `UNKNOWN_REQUEST`).
- [ ] **Step 2: Implement; delete ui-asks + pending move; update ui-kit-chat card fields + its tests.**
- [ ] **Step 3: Run** the new suites + `pnpm turbo run test --filter=@conciv/ui-kit-chat`.
- [ ] **Step 4: Commit** `feat!(core,protocol,ui-kit-chat): approvals + conciv_ui block inside tanstack sockets on awaitReply — ui-asks registry and pending map deleted`

---

### Task 6: attach as a live query + testkit re-derivation

**Files:**

- Rewrite: `packages/core/src/chat/attach.ts`
- Modify: `packages/core/src/rpc/router.ts` (`chat.attach` handler; `rpcSessionList` status now reads the column: `'stopping' → 'running'` mapping)
- Modify: `packages/harness-testkit/src/run-stream.ts` (or wherever `RunEvents`/`RunStream` live — locate via `grep -rn "waitForToolCall\|RunEvents" packages/harness-testkit/src`): `text()` = concatenated text parts of the LAST `MESSAGES_SNAPSHOT`'s assistant messages; `toolCalls(name?)` = tool-call parts across last snapshot; `waitForToolCall` = waitFor a snapshot containing the part; `done()`/`runs()` keep keying on `RUN_FINISHED` (synthesized, still on the wire)
- Modify: `packages/core/test/rpc/wire.it.test.ts` (assertions re-pinned: first chunk still `MESSAGES_SNAPSHOT`; `TEXT_MESSAGE_CONTENT` no longer appears; text asserted via snapshot contents; `RUN_STARTED` still present mid-run — now synthesized)
- Modify: `packages/client/test/*` (chat-connection/chat-client ITs re-pinned the same way; `chatConnection`/`useChatSession` PROD code unchanged — the adapter is transport-agnostic)

**Interfaces:** `attachLive(deps, sessionId, signal): AsyncGenerator<StreamChunk>`:

```ts
// shape (locked):
// 1. yield MESSAGES_SNAPSHOT(settledTranscript + runMessages)          — always first
// 2. if status running|compacting|stopping → yield synthesized RUN_STARTED
// 3. for await on(changes): re-read {runMessages.updatedAt, session.updatedAt, status}
//    - snapshot key changed → yield fresh MESSAGES_SNAPSHOT
//    - status left running → yield RUN_ERROR{message: lastError} if lastError else RUN_FINISHED{finishReason:'stop'}
//    - status entered running → yield RUN_STARTED
```

Settled-history dedup (`settled-history.ts`) keys on the run row's first user message instead of `hub.pendingUserMessage` — the pending user message IS `runMessages[0]` (the processor's `addUserMessage`). `transcriptMessages` unchanged.

- [ ] **Step 1: Re-pin wire.it.test.ts + write the attach IT first** (send → attach mid-hold: snapshot contains the pending user message AND the partial `'ok'` after release arrives via a later snapshot; RUN_STARTED present; after release, RUN_FINISHED and a final snapshot with the assistant message; stop mid-run → RUN_FINISHED with `finishReason:'stop'`; failing harness → RUN_ERROR carrying the message).
- [ ] **Step 2: Implement attach + testkit re-derivation.** Testkit is consumed by core/client/extension-testkit — run all four packages' suites.
- [ ] **Step 3: Run** `pnpm turbo run test --filter=@conciv/core --filter=@conciv/harness-testkit --filter=@conciv/client --filter=@conciv/extension-testkit` — GREEN (this is the task that un-reds the world).
- [ ] **Step 4: Live E2E**: `pnpm --filter @conciv/core exec vitest run test/testkit/create-testkit.it.test.ts` (the `[real]` claude blocking round-trip from 2.5) — green with a real claude.
- [ ] **Step 5: Commit** `feat!(core,harness-testkit,client): chat.attach is a live query — snapshots + synthesized lifecycle, no deltas on the wire`

---

### Task 7: folder restructure + turn→run vocabulary

**Files (git mv + import rewrites; NO behavior change — suites must stay green):**

- `chat/turn.ts` → `chat/run.ts`; `send-turn.ts` → `send.ts`; `chat-env.ts` → `runtime.ts`; `chat-tools.ts` → `tools.ts`; `settled-history.ts` + `messages.ts` merge → `history.ts`; `permission.ts` merges into `sandbox.ts`; `policy/command-policy.ts` → `chat/policy.ts` (folder dies)
- `api/mcp/mcp.ts` → `mcp/mcp.ts`; `api/server/server.ts` → `bundler/bundler.ts`; `api/page/*` + `page/symbolicate.ts` + `runtime/journal.ts` + `pending.ts` → `page/`; `api/cors.ts` → `cors.ts` (root); `runtime/harness-logger.ts` → `debug.ts` (root); `runtime/` + `api/` + `store/` + `policy/` dissolve
- `engine.ts` → `start.ts` (export name `start` unchanged; `packages/core/package.json` `./engine` export → `./start`; `packages/plugin/src/core/vite.ts` import updated)
- `rpc/router.ts` split by contract namespace: `rpc/sessions.ts`, `rpc/chat.ts`, `rpc/router.ts` (compose + page/editor/meta), `rpc/mount.ts`, `rpc/changes.ts`
- Identifier renames repo-wide in core: `startTurn→startRun` (done in Task 4), `TurnDeps→ChatDeps`, `onTurnStart/End→onRunStart/End` (extension `ServerSessions.onChatTurn` stays — public extension API, plan-4 ledger), `sendTurn` RpcDeps field → `send`
- Test tree mirrors: `test/chat/*`, `test/rpc/*` follow; `test/runtime/` dissolves
- Modify: `AGENTS.md` (the security section's `packages/core/src/api/chat/permission.ts` pointer → `packages/core/src/chat/sandbox.ts`)

- [ ] **Step 1: Move + fix imports (tsc is the guide), Step 2: full core+ripple suites green, Step 3: Commit** `refactor!(core): the locked file map — api/runtime/store/policy dissolve, run vocabulary`

---

### Task 8: sessions.list stops fs-scanning per change

**Files:** `packages/core/src/sessions/list.ts` (post-Task-7 home), test additions in `packages/core/test/chat/sessions-list.test.ts`

Run end already writes `messageCount`/`updatedAt` (Task 4). `buildSessionList` for OUR records now reads rows only. The external-transcripts union (`hist.list`) is wrapped in an mtime cache: stat the transcript dir once per call; re-scan only when its mtime changed (cache lives in a closure created at `makeApp` composition — created once, not a session-keyed map).

- [ ] Test: list twice, assert `hist.list` called once (inject a counting `harness.history.list` via `createFakeHarness` — extend the fake's options); touch the dir → called again.
- [ ] Commit: `perf(core): session list reads rows; external transcript scan cached by dir mtime`

---

### Task 9: plan-wide gates

- [ ] `pnpm typecheck && pnpm build && pnpm test` (known environmental reds excepted)
- [ ] `pnpm exec fallow audit --changed-since main --format json` — zero INTRODUCED
- [ ] Anti-pattern greps, ALL must be empty in `packages/core/src`:
      `grep -rn "makeTurnHub\|TurnHub\|makeUiAsks\|UiAsks\|makeLiveFeed\|pulse()\|makePending" packages/core/src --include='*.ts' | grep -v page/`
      `grep -rn "new Map<" packages/core/src/chat --include='*.ts'` (empty)
      `grep -rn "aguiApprovalRequestedFor" packages --include='*.ts'` (empty)
      `grep -rn "startTurn\|sendTurn\|onTurnStart" packages/*/src --include='*.ts'` (empty)
- [ ] Commit gate fixes with pathspec.

---

## Self-review notes (for the executor)

- **The re-send trap:** never route approvals through `useChat.addToolApprovalResponse` or `executeToolCalls(approvals)` — TanStack's completion path re-invokes the loop; claude owns its loop (2.5 deadlock finding). Display = theirs, completion = `awaitReply`. This is the single load-bearing deviation and the reason `wait.ts` exists.
- **Approval payload shape change** (Task 5) is the one client-visible break: `{approvalId, title, detail:{toolName, input}}`. ui-kit-chat card + any test fixture asserting the old payload must move in the same commit.
- **Testkit re-derivation** (Task 6) is the widest ripple: everything asserting `TEXT_MESSAGE_CONTENT`/`TOOL_CALL_START` on the attach wire re-pins to snapshot contents. `grep -rln "TEXT_MESSAGE_CONTENT\|TOOL_CALL_START" packages/*/test packages/harness-testkit/src` is the worklist.
- **Ordering guarantees:** JS single thread — `processChunk` (fold) happens before the row write returns, and `attach` reads rows; a subscriber can never observe a snapshot ahead of the fold. The claim is sync sqlite, so two concurrent `send`s serialize at the UPDATE.
- **Crash hygiene lives in `openDb`** (boot sweep), not in core — a killed dev server leaves `status='running'` + a stale run row; next boot resets both.
