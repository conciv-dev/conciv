# Widget Rewrite Plan 2.8: TanStack DB Core — persisted collections, the wait, and the restructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild core's chat plane on the user-locked model — "their model everywhere, one invention: the wait" — with **TanStack DB persisted collections over libsql** as the single data layer (supersedes plan 2.7's drizzle rows), then dissolve the leftover folder structure.

**Architecture:** `@conciv/db` = five persisted collections (sessions, drafts, markers, runMessages, replies) over one libsql file via our own `SQLiteDriver` + their `createSQLiteCorePersistenceAdapter` + `SingleProcessCoordinator`, plus a three-function claim family and two keyed-write helpers. Core consumes **raw collections** — facades (`SessionStore`/`UiState`) die. Every live surface is a collection subscription (`subscribeChanges` with `where` filters); one-shot reads use `get()`/`queryOnce`. A run is a function: claim → fold harness stream through TanStack's `StreamProcessor` (a local) → write the runMessages row → release. No global event emitter, no module-level Maps keyed by session, no drizzle, no hand-rolled sync anywhere.

**Tech Stack:** `@tanstack/db` 0.6.14, `@tanstack/db-sqlite-persistence-core` 0.2.6, `libsql` 0.5.29 (all exact-pinned; pre-1.0), `@tanstack/ai` 0.40.0 (`chat()`, `StreamProcessor`, middleware), `@tanstack/ai-sandbox` 0.2.2 (existing gate sockets), oRPC 1.14.7 (contract UNCHANGED), zod (standard-schema collection validation).

**Spec lineage:** `docs/superpowers/specs/2026-07-09-widget-orpc-rewrite-design.md` v3.3. Plans 1/2/2.5 executed on this branch. Plan 2.7 was authored + reviewed but its Tasks 1–2 (drizzle columns + node:events) were superseded by the user's TanStack-DB pivot (2026-07-10, spiked in-session: own libsql driver + rehydration + subscribeChanges verified working); its reviewed Tasks 3–9 semantics (S1–S7/C1–C8 ledger) carry into Tasks 3–9 here. Plan 3 (apps/conciv + embed) is authored AFTER this lands.

## Global Constraints

- Functions, not classes (the `StreamProcessor`/`SingleProcessCoordinator` we CONSUME are theirs — instantiating is fine; never subclass). ZERO code comments. No `any`/`as`/non-null `!`. No IIFEs. Cyclomatic ≤ 4 per new function.
- NO module-level Maps/Sets keyed by sessionId anywhere in `packages/core/src`. Request-scoped subscriptions torn down by AbortSignal, and app-composition-time config sets (the risky-tool set, one per `makeApp`), are the allowed shapes. Grep-gated in Task 9.
- Core consumes collections DIRECTLY (`db.sessions.get(id)`, `db.drafts.subscribeChanges(...)`). The only named functions in `@conciv/db` are compound invariants: `claimRun`/`releaseRun`/`requestStop` (claim family) and `setRunMessages`/`writeReply` (keyed upsert helpers). NO store facades — `SessionStore`, `UiState`, `RunState` types must not exist after Task 2.
- Prefer their query surface: `subscribeChanges({where})` for filtered watching, `queryOnce`/`createLiveQueryCollection` for reads/derived views, `eq/and/inArray` expressions. Hand-rolled filter-in-callback only where messages JSON must be inspected (permissionDecision routing).
- Tests under `test/` only; no doubles/shims — real served apps via `@conciv/harness-testkit`, real sqlite files, real typed oRPC clients.
- Build/typecheck via turbo. Commit with pathspec always. `pnpm exec fallow audit --changed-since main --format json` clean of INTRODUCED findings at the end.
- Known non-gating red: `test/api/mcp/claude-image.it.test.ts` and `test/codex-tanstack.it.test.ts` (environmental live-LLM).
- Mid-plan suites MAY be red between Tasks 1–6 (Task 1 deletes the facades core still imports; Task 2 restores compile+green); each task's own listed suites must be green at its end; whole-world gates bind in Task 9.
- The oRPC contract (`packages/contract/src/contract.ts`) does NOT change. Only what flows through `attach` changes shape (snapshots + synthesized lifecycle instead of raw deltas).
- The approval CUSTOM-event payload does NOT change: `aguiApprovalRequestedFor` and its `{toolCallId, toolName, input, approval: {id}}` shape STAY in protocol; `packages/ui-kit-chat` is untouched by this plan.
- Schema evolution policy (user-accepted): persisted collections have NO SQL migrations — `schemaVersion` bump + `schemaMismatchPolicy: 'reset'` wipes that collection's rows on mismatch. Session metadata is losable at v0; claude transcripts are unaffected.

## Verified API facts (2026-07-10; spiked against installed packages in-session — do NOT re-derive)

- `@tanstack/db-sqlite-persistence-core@0.2.6` exports `persistedCollectionOptions`, `createSQLiteCorePersistenceAdapter({driver, schemaVersion?, schemaMismatchPolicy?})`, `SingleProcessCoordinator` (no-op coordinator, always leader — correct for one server process), and the `SQLiteDriver` interface: `{exec(sql): Promise<void>; query<T>(sql, params?): Promise<ReadonlyArray<T>>; run(sql, params?): Promise<void>; transaction<T>(fn): Promise<T>}` — all async; wrapping libsql's sync calls in async functions is the intended shape (spiked: write → durable → reboot → rehydrated).
- `@tanstack/node-db-sqlite-persistence` is NOT usable: its `database:` option is typed `InstanceType<typeof BetterSqlite3>` and libsql's `Database` type is NOT assignable (statement generics differ; verified by tsc). No-`as` rule ⇒ we ship our own driver. `libsql@0.5.29` is a better-sqlite3-style SYNC API (`new Database(path)`, `.prepare().all/run`, `.exec`), prebuilt binaries, no node-gyp, no node flags.
- Local-only persisted collections (`persistedCollectionOptions({id, getKey, schema, persistence, schemaVersion})` — NO `sync` key): mutations auto-persist through wrapped `onInsert/onUpdate/onDelete`; `id` is REQUIRED (random UUID per boot otherwise — data appears lost); `schemaMismatchPolicy` for sync-absent mode defaults to ERROR on version bump — pass `'reset'` explicitly.
- Collection API (spiked): `await collection.preload()` before first use; `get(key)` SYNC in-memory read; `size`; `toArray`; `insert/update/delete` return a tx with `isPersisted.promise` (await = durability point; unawaited writes MUST attach `.catch` — unhandled rejection risk); `update('missing', ...)` THROWS `UpdateKeyNotFoundError`, `delete('missing')` THROWS `DeleteKeyNotFoundError` — guard with `get()` first.
- `subscribeChanges(callback, {includeInitialState?, where?: (rowProxy) => eq(rowProxy.field, v), whereExpression?})` returns a `CollectionSubscription` — call `.unsubscribe()` (NOT a bare function). Change values carry enumerable `$synced/$origin/$key/$collectionId` props; zod's default object parse STRIPS them — parse at every wire boundary (already the oRPC idiom). Do not branch on `change.type` for doorbell purposes (optimistic→synced confirmation can surface as `insert`) — treat any batch as "re-read".
- Query layer: `queryOnce((q) => q.from({s: sessions}).where(({s}) => eq(s.id, id)))` one-shot; `createLiveQueryCollection` for standing derived views; expression fns `eq/and/or/not/inArray/gt/gte/like/count/length` from `@tanstack/db`.
- Schemas guide rules: zod standard-schema drives collection types (`InferSchemaInput` on insert, output on read); `.default()` fills on insert BEFORE validation; NO transforms in collection schemas (TInput-superset trap); branded `SessionId` is fine (type-level only).
- On-disk: managed doc tables (`collection_registry` maps id → hashed table; values are clean JSON without `$` props) + replayable `applied_tx` log with pruning defaults (1000 rows / 24h per collection) — sane, keep defaults.
- The repo has ZERO `--experimental-sqlite` flags today (grepped); libsql needs none either. Root `package.json` `intent.skills` already allowlists `@tanstack/db` (+ `@tanstack/solid-db` for plan 3); `drizzle-kit` entry is removed in Task 1.
- `@tanstack/ai@0.40.0` `StreamProcessor`: constructor takes handlers under `events` — `new StreamProcessor({events: {onMessagesChange, ...}})` (top-level handlers silently dropped). Public: `processChunk(chunk)`, `getMessages()`, `setMessages(messages)`, `addUserMessage(content, id?)` (fires `onMessagesChange`).
- Client mid-stream handoff is DESIGNED-FOR: `ensureAssistantMessage` seeds stream state from a snapshot's last text part; `handleMessagesSnapshotEvent` replaces the array and reconciles pending tool-call parts (`reconcileSnapshotToolCalls`) — repeated snapshots don't flicker cards.
- The approval CUSTOM handler (ai processor) destructures `{toolCallId, toolName, input, approval}` and ANNOTATES the existing tool-call part matched by `toolCallId` (missing `approval` THROWS). Our `aguiApprovalRequestedFor` (protocol/ui-types.ts) emits exactly this; `@tanstack/ai-sandbox`'s `buildApprovalRequestedEvent` (flat payload, no toolCallId) MUST NOT be fed to the processor.
- The claude adapter folds bridged MCP tool calls into the harness stream as `TOOL_CALL_START/ARGS/END` (prefix stripped) — `conciv_ui` and approval-gated tool parts DO appear in the server-side processor's messages.
- Client run lifecycle: ai-client tracks `RUN_STARTED/RUN_FINISHED` in an `activeRunIds` Set keyed by `runId` — synthesized lifecycle chunks need a DISTINCT runId per run ⇒ `${sessionId}:${runEpoch}`.
- `ChatMiddleware.onBeforeToolCall` only fires for tools the `chat()` loop executes; CLI-executed tools ride the ai-sandbox bridge sockets ⇒ the gate stays on `gateProvisioner` → tool-bridge `permission.resolve` + wrapped bridged `execute`s (`packages/core/src/chat/sandbox.ts`), fed by the composition-time risky set.
- `packages/core/src/chat/sandbox.ts` holds a module-level `sandboxes` Map keyed by cwd → Task 4 hoists it into `makeApp` composition.
- `ServerSessions.chatBusy` (extension API, consumed by terminal extension) re-homes to a sync status read; `sessionModel` (MCP lane, sync) re-homes to a sync model read — both are `db.sessions.get(id)` field reads now.

## Locked interfaces (user-locked 2026-07-10: raw collections, facades die, claim family stays)

```ts
// @conciv/db — the whole public surface
export function openConcivDb(stateRoot: string, opts?: {now?: () => number}): Promise<ConcivDb>

export type ConcivDb = {
  sessions: Collection<SessionRecord> // protocol schema + status/lastError/runEpoch
  drafts: Collection<DraftRow> // keyed sessionId (contract shape, unchanged)
  markers: Collection<MarkerRow> // keyed id (contract shape, unchanged)
  runMessages: Collection<RunMessagesRow> // keyed sessionId
  replies: Collection<ReplyRow> // keyed `${sessionId}/${key}`
  claimRun(id: string, kind: 'chat' | 'compact'): boolean // idle → running|compacting; bumps runEpoch; clears lastError + the session's runMessages/replies rows
  releaseRun(id: string, error?: string | null): void // → idle; writes lastError (null = clean); no-op on missing row
  requestStop(id: string): boolean // running|compacting → stopping
  setRunMessages(sessionId: string, messages: unknown[]): Promise<void> // upsert, stamps updatedAt; returns the caught persistence promise — await = durability point, ignore = fire-and-forget
  writeReply(sessionId: string, key: string, value: unknown): Promise<void> // upsert under the composite key; same promise contract
  close(): void
}

export type RunMessagesRow = {sessionId: string; messages: unknown[]; updatedAt: number}
export type ReplyRow = {id: string; sessionId: string; key: string; value: unknown; createdAt: number}

// core/chat/wait.ts — THE one invention (shrinks to a filtered subscription)
export function awaitReply(db: ConcivDb, sessionId: string, key: string, timeoutMs: number): Promise<unknown | null>

// core/chat/run.ts
export function startRun(deps: ChatDeps, sessionId: string, req: RunRequest): Promise<void> // caller has claimed
export type RunRequest = {messages: ModelMessage[]; model: string | null; kind: 'chat' | 'compact'}

// core/chat/runtime.ts — ChatDeps replaces ChatRuntime
export type ChatDeps = {
  cwd: string
  stateRoot: string
  systemText: string
  claudeHome?: string
  harness: HarnessAdapter
  harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv
  sandbox: SandboxDefinition
  db: ConcivDb
  risky: ReadonlySet<string> // approval:'ask' extension tool names, built once in makeApp
  tools: (sessionId: string, model: string | null) => AnyTool[]
  onRunStart?: (sessionId: string) => void
  onRunEnd?: (sessionId: string) => Promise<void>
}
```

Deliberate consequences (binding):

- `SessionRecordSchema` (protocol) gains `status: SessionStatusSchema.default('idle')`, `lastError: z.string().nullable().default(null)`, `runEpoch: z.number().default(0)` — input-side defaults keep existing `insert` call sites compiling. Wire `SessionMeta.status` enum unchanged (`'stopping'` maps to `'running'` on the wire).
- Sessions' `updatedAt` is stamped BY CALL SITES on update (`draft.updatedAt = now()` in the update fn) — the facade that used to do it is gone; Task 2's worklist enumerates every update site.
- `attach` yields ONLY `MESSAGES_SNAPSHOT`s plus synthesized `RUN_STARTED`/`RUN_FINISHED`/`RUN_ERROR` with `runId = ${sessionId}:${runEpoch}`, derived from `(status, runEpoch)` observations so coalesced `running→idle→running` still emits matched pairs. Raw text/tool deltas NEVER cross the wire.
- Accepted trade-off (user-approved "uniformity over delta efficiency"): each snapshot carries the full message array; the attach generator rate-limits re-yields to one per `SNAPSHOT_MIN_INTERVAL_MS = 50`, cost O(thread size) per 50ms per open window, on localhost. Revisit only if plan-3 UX shows lag.
- A STOPPED run is a CLEAN finish: `releaseRun(id, null)` when `abort.signal.aborted` ⇒ attach synthesizes `RUN_FINISHED {finishReason: 'stop'}`, never `RUN_ERROR`.
- Run-row LIFETIME: runMessages/replies rows are NOT cleared when a run ends — they persist until the session's NEXT `claimRun` (which clears them) or the boot sweep. This bridges the claude transcript-flush window; attach dedups settled-vs-run overlap by slicing on `runMessages[0]`.
- `chatBusy(sessionId)` = `(db.sessions.get(sessionId)?.status ?? 'idle') !== 'idle'`. MCP/`ToolRequest.model` = `db.sessions.get(sessionId)?.model ?? null`. Both sync.
- `chat.permissionDecision` (no sessionId in contract input) routes by scanning `db.runMessages.toArray` for the row whose messages contain a tool-call part with `approval.id === approvalId`; unmatched decisions are a no-op `{ok: true}`.
- `UNKNOWN_REQUEST` for `uiReply` = no pending `conciv_ui` tool-call part with that `toolCallId` in the session's run messages.
- Composer queue-vs-disable while running is a plan-3 client decision; the server only offers the atomic claim.
- Boot sweep inside `openConcivDb` (after preload): every session with `status !== 'idle'` → `'idle'`; delete ALL runMessages + replies rows (`lastError` survives — per-run news, cleared by the next `claimRun`).

---

### Task 1: `@conciv/db` — persisted collections over libsql; drizzle dies

**Files:**

- Create: `packages/db/src/driver.ts` (libsql `SQLiteDriver`), `packages/db/src/rows.ts` (`RunMessagesRowSchema`, `ReplyRowSchema`, `replyId()`)
- Rewrite: `packages/db/src/db.ts` (`openConcivDb`: database + persistence + five collections + preload + boot sweep + claim family + helpers + close), `packages/db/src/index.ts`
- Delete: `packages/db/src/schema.ts`, `packages/db/src/session-store.ts`, `packages/db/src/ui-state.ts`, `packages/db/drizzle/` (whole folder), `packages/db/drizzle.config.ts`, `packages/db/test/session-store.test.ts`, `packages/db/test/ui-state.test.ts`
- Modify: `packages/db/package.json` (drop `drizzle-orm` + `drizzle-kit` + the `node:sqlite` reliance; add exact `@tanstack/db@0.6.14`, `@tanstack/db-sqlite-persistence-core@0.2.6`, `libsql@0.5.29`), root `package.json` (`intent.skills`: remove `drizzle-kit`)
- Modify: `packages/protocol/src/chat-types.ts` (`SessionStatusSchema` + the three `SessionRecordSchema` fields with input defaults)
- Test: `packages/db/test/db.test.ts` (new, replaces both deleted suites)

**Interfaces produced:** the locked `ConcivDb` surface above. Everything importing `makeSessionStore`/`makeUiState`/`SessionStore`/`UiState` breaks NOW and is rewired in Task 2 (accepted red window).

- [ ] **Step 1: Write the failing test** `packages/db/test/db.test.ts`:

```ts
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openConcivDb} from '../src/db.js'

const record = (id: string) => ({
  id,
  harnessSessionId: null,
  harnessKind: 'claude',
  origin: 'chat' as const,
  title: null,
  model: null,
  usage: null,
  cwd: '/w',
  createdAt: 42,
  updatedAt: 42,
})

const fresh = () => openConcivDb(mkdtempSync(join(tmpdir(), 'conciv-db-')), {now: () => 42})

describe('conciv db on tanstack persisted collections', () => {
  it('sessions round-trip with status defaults', async () => {
    const db = await fresh()
    db.sessions.insert(record('conciv_a'))
    const got = db.sessions.get('conciv_a')
    expect(got?.status).toBe('idle')
    expect(got?.runEpoch).toBe(0)
    expect(got?.lastError).toBeNull()
    db.close()
  })

  it('claimRun is atomic, bumps runEpoch, clears prior run rows + lastError', async () => {
    const db = await fresh()
    db.sessions.insert(record('conciv_c'))
    db.setRunMessages('conciv_c', [{id: 'stale', role: 'assistant', parts: []}])
    db.writeReply('conciv_c', 'stale-key', true)
    expect(db.claimRun('conciv_c', 'chat')).toBe(true)
    expect(db.claimRun('conciv_c', 'chat')).toBe(false)
    expect(db.sessions.get('conciv_c')?.status).toBe('running')
    expect(db.sessions.get('conciv_c')?.runEpoch).toBe(1)
    expect(db.runMessages.get('conciv_c')).toBeUndefined()
    expect(db.replies.get('conciv_c/stale-key')).toBeUndefined()
    db.releaseRun('conciv_c', 'boom')
    expect(db.sessions.get('conciv_c')?.lastError).toBe('boom')
    expect(db.claimRun('conciv_c', 'compact')).toBe(true)
    expect(db.sessions.get('conciv_c')?.status).toBe('compacting')
    expect(db.sessions.get('conciv_c')?.lastError).toBeNull()
    db.close()
  })

  it('requestStop only flips a live run; releaseRun tolerates missing rows', async () => {
    const db = await fresh()
    db.sessions.insert(record('conciv_s'))
    expect(db.requestStop('conciv_s')).toBe(false)
    db.claimRun('conciv_s', 'chat')
    expect(db.requestStop('conciv_s')).toBe(true)
    expect(db.sessions.get('conciv_s')?.status).toBe('stopping')
    db.releaseRun('missing')
    db.close()
  })

  it('runMessages + replies round-trip through their helpers', async () => {
    const db = await fresh()
    db.setRunMessages('s1', [{id: 'm1'}])
    db.setRunMessages('s1', [{id: 'm1'}, {id: 'm2'}])
    expect(db.runMessages.get('s1')?.messages).toEqual([{id: 'm1'}, {id: 'm2'}])
    db.writeReply('s1', 'call_1', {answered: true})
    db.writeReply('s1', 'call_1', {answered: false})
    expect(db.replies.get('s1/call_1')?.value).toEqual({answered: false})
    db.close()
  })

  it('subscribeChanges with a where filter fires for the watched row only', async () => {
    const {eq} = await import('@tanstack/db')
    const db = await fresh()
    db.sessions.insert(record('conciv_w'))
    db.sessions.insert(record('conciv_x'))
    const hits: string[] = []
    const sub = db.sessions.subscribeChanges((changes) => changes.forEach((change) => hits.push(change.key)), {
      where: (row) => eq(row.id, 'conciv_w'),
    })
    db.sessions.update('conciv_x', (draft) => {
      draft.title = 'other'
    })
    db.sessions.update('conciv_w', (draft) => {
      draft.title = 'watched'
    })
    sub.unsubscribe()
    expect(hits).toEqual(['conciv_w'])
    db.close()
  })

  it('reboot rehydrates sessions and sweeps stuck runs', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-db-sweep-'))
    const first = await openConcivDb(stateRoot, {now: () => 1})
    first.sessions.insert({...record('conciv_z'), title: 'keep'})
    first.claimRun('conciv_z', 'chat')
    await first.setRunMessages('conciv_z', [{id: 'm1'}])
    await first.writeReply('conciv_z', 'k', true)
    first.close()
    const second = await openConcivDb(stateRoot, {now: () => 2})
    expect(second.sessions.get('conciv_z')?.title).toBe('keep')
    expect(second.sessions.get('conciv_z')?.status).toBe('idle')
    expect(second.sessions.get('conciv_z')?.lastError).toBeNull()
    expect(second.runMessages.get('conciv_z')).toBeUndefined()
    expect(second.replies.get('conciv_z/k')).toBeUndefined()
    second.close()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @conciv/db exec vitest run` fails on missing `openConcivDb`.
- [ ] **Step 3: Implement.** `driver.ts`:

```ts
import type Database from 'libsql'
import type {SQLiteDriver} from '@tanstack/db-sqlite-persistence-core'

export function makeLibsqlDriver(database: Database): SQLiteDriver {
  const driver: SQLiteDriver = {
    exec: async (sql) => {
      database.exec(sql)
    },
    query: async (sql, params = []) => database.prepare(sql).all(...params),
    run: async (sql, params = []) => {
      database.prepare(sql).run(...params)
    },
    transaction: async (fn) => runTransaction(database, driver, fn),
  }
  return driver
}

async function runTransaction<T>(database: Database, driver: SQLiteDriver, fn: (d: SQLiteDriver) => Promise<T>) {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = await fn(driver)
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
```

(Check libsql's `.d.ts` for the exact `prepare().all(...params)` typing — spread vs single array arg — and match it; the spike used spread successfully at runtime.)

`rows.ts`: zod schemas for the two new row shapes + `replyId(sessionId, key)` = `` `${sessionId}/${key}` ``. `db.ts` sketch (complete the obvious parallels):

```ts
export async function openConcivDb(stateRoot: string, opts?: {now?: () => number}): Promise<ConcivDb> {
  const now = opts?.now ?? Date.now
  mkdirSync(`${stateRoot}/.conciv`, {recursive: true})
  const database = new Database(`${stateRoot}/.conciv/conciv.db`, {timeout: 5000})
  database.exec('PRAGMA journal_mode = WAL')
  const persistence = {
    adapter: createSQLiteCorePersistenceAdapter({driver: makeLibsqlDriver(database), schemaMismatchPolicy: 'reset'}),
    coordinator: new SingleProcessCoordinator(),
  }
  const collection = <T extends object, K extends string>(
    id: string,
    schema: StandardSchemaV1,
    getKey: (row: T) => K,
    schemaVersion: number,
  ) => createCollection(persistedCollectionOptions({id, getKey, schema, persistence, schemaVersion}))
  const sessions = collection('sessions', SessionRecordSchema, (row: SessionRecord) => row.id, 1)
  // drafts (getKey sessionId), markers (getKey id), runMessages (getKey sessionId), replies (getKey id) — schemaVersion 1 each
  await Promise.all([sessions.preload(), drafts.preload(), markers.preload(), runMessages.preload(), replies.preload()])
  sweep(sessions, runMessages, replies, now)
  return {
    sessions,
    drafts,
    markers,
    runMessages,
    replies,
    ...claimFamily(sessions, runMessages, replies, now),
    setRunMessages,
    writeReply,
    close: () => database.close(),
  }
}
```

Claim family (guard-then-mutate; sync single-process = atomic):

```ts
claimRun: (id, kind) => {
  const current = sessions.get(id)
  if (!current || current.status !== 'idle') return false
  sessions.update(id, (draft) => {
    draft.status = kind === 'chat' ? 'running' : 'compacting'
    draft.lastError = null
    draft.runEpoch = draft.runEpoch + 1
    draft.updatedAt = now()
  })
  if (runMessages.get(id)) runMessages.delete(id)
  replies.toArray.filter((row) => row.sessionId === id).forEach((row) => replies.delete(row.id))
  return true
}
```

`releaseRun`: guard `sessions.get(id)` → update `{status: 'idle', lastError: error ?? null, updatedAt: now()}`. `requestStop`: guard status ∈ {running, compacting} → `'stopping'`. `setRunMessages`: `get` → update-or-insert `{sessionId, messages, updatedAt: now()}`, returning `tx.isPersisted.promise.catch(() => {})` (callers may ignore it — per-chunk fire-and-forget must not crash the process — or await it as the durability point). `writeReply`: same upsert idiom + promise contract under `replyId(...)`. `sweep`: iterate `sessions.toArray` non-idle → update to idle; delete every runMessages/replies key. Real types throughout — no `as`; type `collection()` properly per collection instead of one over-generic helper if inference fights back.

- [ ] **Step 4: Protocol fields** — in `packages/protocol/src/chat-types.ts` add `SessionStatusSchema = z.enum(['idle', 'running', 'compacting', 'stopping'])` (+ type) and the three schema fields with input-side defaults (exact shapes in Locked interfaces).
- [ ] **Step 5: package.json swaps; run** `pnpm turbo run test --filter=@conciv/db --filter=@conciv/protocol` — PASS (core is red from here until Task 2 completes; that's the accepted window).
- [ ] **Step 6: Commit** `feat!(db,protocol): tanstack persisted collections over libsql replace drizzle — facades deleted, claim family + run rows` — pathspec `packages/db packages/protocol package.json pnpm-lock.yaml`.

---

### Task 2: core consumes collections directly; LiveFeed dies

**Files:**

- Delete: `packages/core/src/rpc/live.ts`, `packages/core/test/rpc/live.test.ts`
- Modify: `packages/core/src/app.ts` (openConcivDb await; `store`/`uiState` locals become `db`; pulse wiring deleted), `packages/core/src/rpc/router.ts` (RpcDeps: `live`+`uiState`+`chat.store` → `db: ConcivDb`; every handler body), `packages/core/src/chat/chat-env.ts` (`ChatRuntime.store` → `db`), `packages/core/src/chat/session.ts`, `packages/core/src/chat/turn.ts`, `packages/core/src/chat/send-turn.ts`, `packages/core/src/chat/compact.ts` (mechanical `store.`/`uiState.` → collection ops)
- Test: `packages/core/test/rpc/*` behavior ITs stay green unchanged (they drive the wire); fixture helpers that constructed stores now call `openConcivDb`

**Mechanical rewrite table (apply everywhere; Task 2 is done when `grep -rn "SessionStore\|UiState\|makeSessionStore\|makeUiState\|makeLiveFeed\|pulse()" packages/core/src` is EMPTY):**

| old                                                                         | new                                                                                                                                    |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `store.get(id)` (await)                                                     | `db.sessions.get(id)` (sync; wrap in `Promise.resolve` only where an interface stays async)                                            |
| `store.create(rec)`                                                         | `db.sessions.insert(SessionRecordSchema.parse({...rec, createdAt: now, updatedAt: now}))`                                              |
| `store.update(id, patch)`                                                   | `db.sessions.update(id, (draft) => {Object.assign(draft, patch); draft.updatedAt = now()})` — guard `get` first where the row may miss |
| `store.delete(id)`                                                          | `if (db.sessions.get(id)) db.sessions.delete(id)`                                                                                      |
| `store.list()`                                                              | `db.sessions.toArray`                                                                                                                  |
| `store.findByHarnessId(h)`                                                  | `await queryOnce((q) => q.from({s: db.sessions}).where(({s}) => eq(s.harnessSessionId, h)))` then `[0] ?? null`                        |
| `uiState.getDraft(id)`                                                      | `db.drafts.get(id) ?? null`                                                                                                            |
| `uiState.setDraft(row)`                                                     | upsert idiom on `db.drafts`                                                                                                            |
| `uiState.listMarkers(id)`                                                   | `await queryOnce((q) => q.from({m: db.markers}).where(({m}) => eq(m.sessionId, id)).orderBy(({m}) => m.afterTurn))`                    |
| `uiState.addMarker(row)`                                                    | `db.markers.insert({...row, id: randomUUID()})`                                                                                        |
| `uiState.deleteFor(id)`                                                     | delete matching drafts + markers keys                                                                                                  |
| `store.watch(cb)` / `uiState.watch(cb)` / `live.pulse()` / `live.subscribe` | per-collection `subscribeChanges` at the consuming site (below)                                                                        |

Every live rpc handler becomes a filtered subscription pumping an async queue. Shared request-scoped helper in `packages/core/src/rpc/changes.ts` (NEW, ~25 lines — the only callback→iterator bridge, reused by every live handler):

```ts
export async function* onCollectionChange(
  subscribe: (notify: () => void) => {unsubscribe: () => void},
  signal: AbortSignal,
): AsyncGenerator<void> {
  // resolver-queue bridge: notify() resolves the pending waiter; abort unsubscribes and returns
}
```

with handlers shaped:

```ts
live: os.drafts.live.handler(async function* ({input, signal}) {
  const aborter = signal ?? new AbortController().signal
  yield db.drafts.get(input.sessionId) ?? null
  for await (const _ of onCollectionChange(
    (notify) => db.drafts.subscribeChanges(notify, {where: (row) => eq(row.sessionId, input.sessionId)}),
    aborter,
  )) {
    yield db.drafts.get(input.sessionId) ?? null
  }
})
```

- [ ] Step 1: write `changes.test.ts` (notify → one iteration; abort → generator returns, `subscription.unsubscribe` called; no listener leak).
- [ ] Step 2: implement bridge; sweep the rewrite table through app.ts/router.ts/chat files; delete live.ts.
- [ ] Step 3: `pnpm turbo run test --filter=@conciv/core` — GREEN (old architecture, new data layer). Ripple check: `--filter=@conciv/harness-testkit --filter=@conciv/extension-testkit`.
- [ ] Step 4: Commit `feat!(core,db): core consumes tanstack collections directly — session/ui facades and the LiveFeed die`.

---

### Task 3: `wait.ts` — awaitReply + the two reply rpcs

**Files:** Create `packages/core/src/chat/wait.ts`; modify `packages/core/src/rpc/router.ts` (`chat.uiReply`, `chat.permissionDecision`); test `packages/core/test/chat/wait.test.ts`.

`awaitReply(db, sessionId, key, timeoutMs)`: subscribe `db.replies.subscribeChanges(check, {includeInitialState: true, where: (row) => eq(row.id, replyIdOf(sessionId, key))})`; first matching change resolves `value`; timer resolves `null`; `finally` unsubscribes. `includeInitialState` covers the reply-already-written order — no separate pre-check read.

- `uiReply` handler: pending-part check (Task 5 provides `pendingUiCallIds(db, sessionId)`) → `db.writeReply(sessionId, toolCallId, value)`; else `UNKNOWN_REQUEST`.
- `permissionDecision` handler: `sessionForApproval(db, approvalId)` scans `db.runMessages.toArray` for a tool-call part with `approval.id === approvalId` (few rows — only claimed sessions); found → `db.writeReply(sessionId, approvalId, approved)`; not found → no-op `{ok: true}`.

- [ ] Step 1 failing tests (real db, no server):

```ts
it('resolves an existing reply immediately', async () => {
  db.writeReply('s1', 'k1', {answered: true, value: 'yes'})
  expect(await awaitReply(db, 's1', 'k1', 1000)).toEqual({answered: true, value: 'yes'})
})
it('resolves when the reply lands later', async () => {
  const pending = awaitReply(db, 's1', 'k2', 5000)
  db.writeReply('s1', 'k2', true)
  expect(await pending).toBe(true)
})
it('times out to null and unsubscribes', async () => {
  expect(await awaitReply(db, 's1', 'nope', 30)).toBeNull()
})
it('ignores replies for other keys and sessions', async () => {
  const pending = awaitReply(db, 's1', 'k3', 200)
  db.writeReply('s2', 'k3', true)
  db.writeReply('s1', 'other', true)
  expect(await pending).toBeNull()
})
```

- [ ] Step 2 implement; Step 3 run + commit `feat(core): awaitReply — the one wait primitive over the replies collection`.

---

### Task 4: the run pump — `run.ts` rewrite; turn-hub dies

**Files:**

- Rewrite: `packages/core/src/chat/turn.ts` (renamed Task 7): `startRun` + resume-token helpers; `withTurnEffects`/`mapTurnChunk` deleted
- Modify: `packages/core/src/chat/send-turn.ts`, `packages/core/src/chat/compact.ts` (claim via `db.claimRun`; compact's `active` Set DELETED — `compacting` derives from status), `packages/core/src/chat/chat-env.ts` → `ChatDeps` (shape in Locked interfaces), `packages/core/src/app.ts` (hub wiring out; `chatBusy` from status; `sessionModel` dies — MCP vars read the model field; sandbox definition hoisted into `makeApp`, `sandboxes` module Map deleted from `sandbox.ts`)
- Modify: `packages/core/src/api/mcp/mcp.ts` (`sessionModel` → sessions field read), `packages/core/src/chat/chat-tools.ts` (`buildChatTools(makeCtx, extensionTools)` — model is a per-call arg from the run)
- Delete: `packages/core/src/runtime/turn-hub.ts`, `packages/core/test/runtime/turn-hub.test.ts`
- Test: new `packages/core/test/chat/run.test.ts`; rewrite hub-touching assertions in `packages/core/test/chat/turn-session.test.ts`; `packages/core/test/api/extension-server-surfaces.it.test.ts` re-check

**The pump:**

```ts
export async function startRun(deps: ChatDeps, sessionId: string, req: RunRequest): Promise<void> {
  const abort = new AbortController()
  const processor = new StreamProcessor({
    events: {onMessagesChange: (messages) => deps.db.setRunMessages(sessionId, messages)},
  })
  const lastUser = req.messages.findLast((message) => message.role === 'user')
  if (lastUser && typeof lastUser.content === 'string') processor.addUserMessage(lastUser.content)
  const stopWatch = watchForStop(deps.db, sessionId, abort)
  const outcome = {error: null as string | null, usage: null as UsageSnapshot | null}
  try {
    const stream = await buildRunStream(deps, sessionId, req, processor, abort)
    for await (const chunk of stream) {
      processor.processChunk(chunk)
      tapSessionId(chunk, (id) => recordMintedToken(deps.db, sessionId, id))
      if (chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls' && chunk.usage) {
        outcome.usage = usageSnapshotFor(deps, req.model, chunk.usage)
      }
    }
  } catch (error) {
    if (!abort.signal.aborted) outcome.error = errorMessage(error)
  } finally {
    stopWatch.unsubscribe()
    recordRunEnd(deps.db, sessionId, processor, outcome)
    deps.db.releaseRun(sessionId, outcome.error)
    if (deps.onRunEnd) await deps.onRunEnd(sessionId).catch(() => {})
  }
}
```

- Run rows are NOT cleared here (lifetime rule). `recordRunEnd` updates the session row: usage (when present) + `messageCount: processor.getMessages().length` + `updatedAt`.
- `watchForStop(db, sessionId, abort)` = `db.sessions.subscribeChanges((changes) => { if (changes.some((change) => change.value.status === 'stopping')) abort.abort() }, {where: (row) => eq(row.id, sessionId)})` — returns the subscription; `finally` unsubscribes. Request-scoped, no leak.
- `buildRunStream` = today's `buildTurnStream` minus the uiBus merge; gate construction moves inside it (Task 5): `makeRunGate({sessionId, processor, db: deps.db, risky: deps.risky})`, threaded to `config.decide` exactly where `deps.gate.decide` sits today.
- `sessions.stop` rpc → `db.requestStop(sessionId)`. `send`/`compact`: `if (!db.claimRun(id, kind)) throw SESSION_BUSY`; pre-pump failure → `db.releaseRun(id, null)`; `send` fire-and-forgets, `compact` awaits.

- [ ] Step 1 failing unit test `run.test.ts` — `createFakeHarness`, no server: run row fills while `__scripted.hold()` (assert via `db.runMessages.get`), status idle after `release()` with run row STILL PRESENT, `requestStop` mid-hold → aborted with `lastError` null (clean stop), scripted throw → `lastError` set; next `claimRun` clears old rows. Update `makeChatFixture` (hub/uiBus out; `db`+`sandbox`+`risky` in).
- [ ] Step 2 implement; delete turn-hub + test; wire app.ts + mcp.ts. Step 3 run listed suites (whole-suite red allowed until Task 6). Step 4 commit `feat!(core): runs are functions folding through TanStack's StreamProcessor into the runMessages row — turn-hub deleted`.

---

### Task 5: gate + ask on the existing sockets; ui-asks and the pending map die

**Files:**

- Rewrite: `packages/core/src/chat/permission.ts` → `makeRunGate` on `awaitReply` (merges into `sandbox.ts` in Task 7)
- Modify: `packages/core/src/chat/chat-tools.ts` + app `makeToolCtx` (`conciv_ui` execute = pending-part wait + `awaitReply`)
- Delete: `packages/core/src/runtime/ui-asks.ts`, `packages/core/test/runtime/ui-asks.test.ts`; `packages/core/src/pending.ts` → MOVE `makePending` into `packages/core/src/api/page/` (page bus is its only remaining consumer; plan-4 death row)
- Test: rewrite `packages/core/test/permission-gate.test.ts`; new `packages/core/test/chat/ui-asks-flow.it.test.ts` (the 2.5 live-order ITs re-homed onto the wire); the 2.5 arrival-order pairing unit tests DELETE (pairing problem no longer exists)

**The gate (no ai-sandbox event builder, no payload change, no onBeforeToolCall):**

```ts
export function makeRunGate(gateDeps: {
  sessionId: string
  processor: StreamProcessor
  db: ConcivDb
  risky: ReadonlySet<string>
  timeoutMs?: number
}): PermissionGate
// decide(toolName, input, toolUseId):                       ← signature UNCHANGED; sandbox.ts sockets compile untouched
// 1. needsApproval? (risky.has(toolName) || Bash classifyCommand !== 'allow') — else 'allow'
// 2. approvalId = randomUUID()
// 3. await the folded tool-call part: until processor.getMessages() has a tool-call part with id === toolUseId,
//    re-checked per runMessages subscribeChanges change (where sessionId), bounded 5s — the fold and the permission
//    callback race; if it never appears, processChunk a synthetic TOOL_CALL_START/END pair for toolUseId first
// 4. processor.processChunk(aguiApprovalRequestedFor({toolCallId: toolUseId, toolName, input, approvalId}))
// 5. approved = await awaitReply(db, sessionId, approvalId, timeoutMs ?? 120_000)
// 6. return approved === true ? 'allow' : 'deny'
```

`conciv_ui` execute (app's `makeToolCtx().askUi`): wait (bounded 5s, runMessages subscription) for the newest `tool-call` part named `conciv_ui` in `db.runMessages.get(sessionId)?.messages` that has no reply row; then `awaitReply(db, sessionId, part.id, UI_ASK_TIMEOUT_MS)`; timeout → the 2.5 `UNANSWERED` shape. Reply-before-part order is covered because reply rows persist until the next claim. Export `pendingUiCallIds(db, sessionId)` for the `uiReply` rpc check.

`aguiApprovalRequestedFor` STAYS in protocol verbatim. `packages/ui-kit-chat` is NOT touched — the card keys on `part.approval.id` and the wire payload is byte-identical.

- [ ] Step 1 failing tests — permission-gate rewrite (real `StreamProcessor` + real db): (a) safe tool → allow, no event; (b) risky tool with TOOL_CALL_START already folded → pending approval part visible in `processor.getMessages()` with `approval.id`, `writeReply(sessionId, id, true)` → allow; (c) risky tool with NO folded part → synthetic-part fallback produces the annotated part; (d) timeout 30ms → deny. `ui-asks-flow.it.test.ts`: scripted `conciv_ui` over the wire → `uiReply` before AND after the part appears → both succeed; wrong toolCallId → `UNKNOWN_REQUEST`.
- [ ] Step 2 implement; delete ui-asks; move makePending. Step 3 run new suites + `pnpm turbo run test --filter=@conciv/tools`. Step 4 commit `feat!(core): approvals + conciv_ui block on awaitReply inside the existing sandbox sockets — ui-asks registry and pending map deleted`.

---

### Task 6: attach as a live query + testkit re-derivation

**Files:**

- Rewrite: `packages/core/src/chat/attach.ts`
- Modify: `packages/core/src/rpc/router.ts` (`chat.attach` handler; `rpcSessionList` status from the column, `'stopping'→'running'` on the wire; `compacting` from status — `Compactor.compacting` deleted)
- Modify: `packages/harness-testkit/src/run-stream.ts` + `run-events.ts` — FULL re-derivation: `text()` = concatenated text parts of the LAST snapshot's assistant messages; `toolCalls(name?)` = tool-call parts of the last snapshot; `waitForToolCall(name)` = waitFor a snapshot containing the part; `custom(name?)` — CUSTOM chunks no longer cross the wire: re-derive consumers from part states or delete the helper if orphaned (grep first); generic `waitFor(predicate)`/`waitForText` KEEP operating on raw received chunks (snapshots + lifecycle ARE chunks) but every existing call site passing `TOOL_CALL_*`/`TEXT_MESSAGE_*`/`CUSTOM` predicates must be re-pointed — worklist: `grep -rn "TOOL_CALL_\|TEXT_MESSAGE_\|EventType.CUSTOM" packages/*/test packages/harness-testkit/src --include='*.ts'`
- Modify: `packages/core/test/rpc/wire.it.test.ts` (incl. the `conciv_ui` IT reading `TOOL_CALL_RESULT.content` — assertion moves to the final snapshot's tool-result part), `packages/client/test/*` (re-pin to snapshots; `chatConnection`/`useChatSession` PROD code unchanged)
- Test: new attach IT (below)

**`attachLive(deps, sessionId, signal)`:**

```ts
// request-scoped locals: lastKey, lastSeen = {epoch, running}
// subscriptions: sessions (where id === sessionId) + runMessages (where sessionId) → one onCollectionChange bridge
// 1. yield MESSAGES_SNAPSHOT(buildSnapshot())      — settled transcript SLICED against run messages + run messages
// 2. if status ∈ {running, compacting, stopping} → yield RUN_STARTED {runId: `${sessionId}:${epoch}`}
// 3. per bridge iteration (rate-limited to SNAPSHOT_MIN_INTERVAL_MS = 50):
//    read {epoch: session.runEpoch, status, key: runMessagesRow?.updatedAt + session.updatedAt}
//    - epoch advanced past lastSeen.epoch while lastSeen.running → yield RUN_FINISHED(lastSeen) THEN RUN_STARTED(new)
//    - running → idle: lastError set → RUN_ERROR {message: lastError} else RUN_FINISHED {finishReason: 'stop'}
//    - idle → running: RUN_STARTED {runId: `${sessionId}:${epoch}`}
//    - 'stopping' counts as running (no lifecycle emit on running→stopping)
//    - key changed → yield fresh MESSAGES_SNAPSHOT
```

`buildSnapshot`: `settledMessages(transcript, firstUserTextOf(runMessagesRow.messages))` + run messages — the existing `settled-history.ts` slicing keyed on `runMessages[0]` (the processor's `addUserMessage`). Because run rows persist after run end, the post-run snapshot keeps the final turn visible until the transcript contains it — no vanishing-message window.

- [ ] Step 1: attach IT first — send → attach mid-hold: snapshot has pending user message; partial text via later snapshot after `release()`; `RUN_STARTED` with epoch-suffixed runId; after release → `RUN_FINISHED` + final snapshot; final message STILL in snapshots right after run end; stop mid-run → `RUN_FINISHED {finishReason:'stop'}`, NO `RUN_ERROR`; failing harness → `RUN_ERROR` with message; back-to-back sends → two matched STARTED/FINISHED pairs under coalescing.
- [ ] Step 2: implement attach + testkit; sweep the grep worklist.
- [ ] Step 3: `pnpm turbo run test --filter=@conciv/core --filter=@conciv/harness-testkit --filter=@conciv/client --filter=@conciv/extension-testkit` — GREEN (un-reds the world).
- [ ] Step 4: Live E2E — `test/testkit/create-testkit.it.test.ts` (`[real]` claude blocking round-trip) green with a real claude.
- [ ] Step 5: Commit `feat!(core,harness-testkit,client): chat.attach is a live query — snapshots + synthesized lifecycle, no deltas on the wire`.

---

### Task 7: folder restructure + turn→run vocabulary

Same map as plan 2.7 (no behavior change; suites stay green):

- `chat/turn.ts` → `chat/run.ts`; `send-turn.ts` → `send.ts`; `chat-env.ts` → `runtime.ts`; `chat-tools.ts` → `tools.ts`; `settled-history.ts` + `messages.ts` merge → `history.ts`; `permission.ts` merges into `sandbox.ts`; `policy/command-policy.ts` → `chat/policy.ts` (folder dies)
- `api/mcp/mcp.ts` → `mcp/mcp.ts`; `api/server/server.ts` → `bundler/bundler.ts`; `api/page/*` + `page/symbolicate.ts` + `runtime/journal.ts` + moved `pending.ts` → `page/`; `api/cors.ts` → `cors.ts`; `runtime/harness-logger.ts` → `debug.ts`; `runtime/`+`api/`+`store/`+`policy/` dissolve
- `engine.ts` → `start.ts` (`packages/core/package.json` `./engine` export → `./start`; `packages/plugin/src/core/vite.ts` import updated)
- `rpc/router.ts` split by contract namespace: `rpc/sessions.ts`, `rpc/chat.ts`, `rpc/router.ts` (compose + page/editor/meta), `rpc/mount.ts`, `rpc/changes.ts`
- Identifier renames: `TurnDeps→ChatDeps` (Task 4), `onTurnStart/End→onRunStart/End` (extension `ServerSessions.onChatTurn` STAYS — public extension API, plan-4 ledger), RpcDeps `sendTurn` → `send`
- Test tree mirrors: `test/chat/*`, `test/rpc/*`; `test/runtime/` dissolves; `packages/core/test/stream-effects.test.ts` imports `tapSessionId` from `../src/chat/turn.js` — re-point to `chat/run.js`
- `AGENTS.md` security-section pointer (`api/chat/permission.ts` → `chat/sandbox.ts`)

- [ ] Move + fix imports (tsc guides) → full core+plugin+ripple suites green → Commit `refactor!(core): the locked file map — api/runtime/store/policy dissolve, run vocabulary`.

---

### Task 8: sessions.list stops fs-scanning per change

**Files:** `packages/core/src/sessions/list.ts` (post-Task-7 home), test additions in `packages/core/test/chat/sessions-list.test.ts`.

Run end writes `messageCount`/`updatedAt` (Task 4), so OUR records are a `queryOnce` over sessions (`orderBy updatedAt desc`). The external-transcripts union (`hist.list`) wraps in an mtime cache (closure created once at `makeApp` composition): stat the transcript dir per call, re-scan only on mtime change.

- [ ] Test: list twice → `hist.list` called once (counting via an extended `createFakeHarness` option); touch the dir → called again.
- [ ] Commit `perf(core): session list reads rows; external transcript scan cached by dir mtime`.

---

### Task 9: plan-wide gates

- [ ] `pnpm typecheck && pnpm build && pnpm test` (environmental reds excepted)
- [ ] `pnpm exec fallow audit --changed-since main --format json` — zero INTRODUCED
- [ ] Anti-pattern greps, ALL empty:
      `grep -rn "drizzle" packages package.json --include='*.ts' --include='*.json' | grep -v node_modules` (empty)
      `grep -rn "makeSessionStore\|SessionStore\|makeUiState\|UiState\b\|RunState\b" packages/*/src --include='*.ts'` (empty)
      `grep -rn "makeTurnHub\|TurnHub\|makeUiAsks\|UiAsks\|makeLiveFeed\|pulse()" packages/core/src --include='*.ts'` (empty)
      `grep -rn "makePending" packages/core/src --include='*.ts' | grep -v page/` (empty)
      `grep -rn "new Map<" packages/core/src/chat --include='*.ts'` (empty)
      `grep -rn "startTurn\|sendTurn\|onTurnStart\|TurnDeps" packages/*/src --include='*.ts'` (empty)
- [ ] Commit gate fixes with pathspec.
