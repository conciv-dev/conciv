# Session Identity Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make our `conciv_<uuid>` the single session id everywhere; the harness id becomes a stored attribute used only for `--resume`. One consolidated unstorage-backed `SessionStore`, a `resolve` endpoint that normalizes any id to ours, and a per-instance typed client.

**Architecture:** Server mints `conciv_` ids and stores one `SessionRecord` per session (title + usage + harness token together) via an adapter-agnostic `SessionStore` (unstorage; fs in prod, memory in tests). All chat routes key by our id; `resolve` is the only route that accepts a harness id. The widget talks to the backend solely through `defineClient`, a per-instance closure that owns its session id; the branded `SessionId` makes "our id only" a compile-time guarantee.

**Tech Stack:** TypeScript (Node 22 type-strip), zod, h3 v2, unstorage, Solid (widget), vitest + Playwright (real-browser IT), turborepo.

**Reference spec:** `docs/superpowers/specs/2026-06-16-session-identity-redesign-design.md`

**Conventions for every task:** build/typecheck via turbo (`npx turbo run typecheck --filter=<pkg>`), never manual `tsc` in dist. Functions, not classes. One-line comments. Widget UI is verified in a real browser (Playwright IT), never jsdom; IT uses `browser.newPage()`.

**HARD RULE — no stubs, no mocks, ever.** No `vi.fn`, no `vi.stubGlobal('fetch')`, no fake implementations. Tests hit a **real** server (Node `http.createServer` on port 0) with **real** `fetch`, and the widget UI runs in a **real** browser. Core store tests use real unstorage drivers (memory/fs) — those share the production code path and are not mocks. Assert on what a real server actually received, not on a spy.

---

## File Structure

**Protocol — `packages/protocol/src`**

- `chat-types.ts` (modify): branded `SessionId`; delete `DEFAULT_SESSION_ID`; reshape `ChatSession`; add `SessionRecordSchema`, `ResolveRequestSchema`, `ResolveResponseSchema`, `RenameResponseSchema`, `OkSchema`.
- `harness-types.ts` (modify): enrich `HarnessSessionMeta`.

**Core — `packages/core/src`**

- `store/session-store.ts` (replace): `SessionStore` interface + unstorage impl. Absorbs the old map store, `session-titles-store.ts`, `usage-store.ts` (all deleted).
- `store/session-titles-store.ts`, `store/usage-store.ts` (delete).
- `state-paths.ts` (modify): drop `sessions`/`titles`/`usage` paths; add unstorage base dir; keep `lockFor`.
- `api/chat/session-id.ts` (modify): header → our id or `null`.
- `api/chat/session.ts` (modify): `resolve` route; read-only `/sessions` join; `/session`; `/history`; rename; delete.
- `api/chat/chat.ts` (modify): drop `sessionFor` map seeding + `DEFAULT_SESSION_ID`; use the store; agent hand-off seeds a record.
- `api/chat/turn.ts` (modify): lock + usage + `onSessionId` + resume by our id.
- `api/chat/launch.ts` (modify): resume token from the record.

**Widget — `packages/widget/src`**

- `transport.ts` (new): the one network seam — `route` (typed fetch) + `eventSource`/`url` (SSE) for ALL `/api/*` calls.
- `session-client.ts` (new): `defineClient` — per-instance session client over the transport.
- `chat-api.ts` (delete): replaced by `transport.ts` + `session-client.ts`.
- `widget-shell.tsx`, `session-selector.tsx`, `quick-terminal.tsx`, `chat-panel.tsx`, `session-store-client.ts`, `session-info.tsx` (modify): key by our id; selector resolves on switch; chat-panel routes the stream + permission gate through the client; remove the `activeToken` hack.
- `model-selector.tsx` (modify): `client.models()`.
- `new-session-action.tsx`, `open-in-terminal-action.tsx` (modify): `resolve()` / `client.launch()` (drop `/session/new`).
- `mount.tsx` (modify): probe availability via `/models`, not `/session`.
- `page-bus.ts`, `test-card.tsx` (modify): page-bus + test-runner/editor over the shared transport.

**Harness — `packages/harness/src/claude`**

- `history.ts` (modify): enrichment fields.

---

## Phase 1 — Backend

### Task 1: Protocol — branded id + schemas

**Files:**

- Modify: `packages/protocol/src/chat-types.ts`
- Test: `packages/protocol/test/chat-types.test.ts`

- [ ] **Step 1: Write failing tests for the branded id + new schemas**

```ts
import {describe, it, expect} from 'vitest'
import {SessionId, SessionRecordSchema, ResolveRequestSchema, ResolveResponseSchema} from '../src/chat-types.js'

describe('SessionId (branded, conciv_ prefix)', () => {
  it('accepts an conciv_ id', () => {
    expect(SessionId.safeParse('conciv_018f...').success).toBe(true)
  })
  it('rejects a non-conciv id (a raw harness token)', () => {
    expect(SessionId.safeParse('5d3f-claude-token').success).toBe(false)
  })
})

describe('SessionRecordSchema', () => {
  it('parses a new record (no harness id yet)', () => {
    const r = SessionRecordSchema.parse({
      id: 'conciv_1',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/app',
      createdAt: 1,
      updatedAt: 1,
    })
    expect(r.harnessSessionId).toBeNull()
  })
})

describe('ResolveRequestSchema', () => {
  it('allows an empty body (new session)', () => {
    expect(ResolveRequestSchema.parse({})).toEqual({})
  })
  it('echoes ResolveResponse with a branded id', () => {
    expect(ResolveResponseSchema.parse({sessionId: 'conciv_x'}).sessionId).toBe('conciv_x')
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run packages/protocol/test/chat-types.test.ts`
Expected: FAIL — `SessionRecordSchema`/`ResolveRequestSchema` not exported; old `SessionId` accepts non-conciv.

- [ ] **Step 3: Implement the schema changes**

In `packages/protocol/src/chat-types.ts`:

```ts
// Our session id — minted by the server, conciv_ prefixed, branded so a raw harness id can't be
// passed where ours is required.
export const SessionId = z
  .string()
  .regex(/^conciv_[A-Za-z0-9_-]{1,128}$/)
  .brand<'ConcivSessionId'>()
export type SessionId = z.infer<typeof SessionId>

// The harness's own session id (resume token). Charset-bounded for filesystem safety.
export const HarnessSessionId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)

// One consolidated, durable record per session — the single source of truth.
export const SessionRecordSchema = z.object({
  id: SessionId,
  harnessSessionId: z.string().nullable(), // resume token; null = never run
  harnessKind: z.string(), // 'claude' | 'codex' ... routes resume
  origin: z.enum(['chat', 'agent', 'external']),
  title: z.string().nullable(),
  model: z.string().nullable(),
  usage: UsageSnapshotSchema.nullable(),
  cwd: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type SessionRecord = z.infer<typeof SessionRecordSchema>

export const ResolveRequestSchema = z.object({id: z.string().optional()})
export const ResolveResponseSchema = z.object({sessionId: SessionId})
export const RenameResponseSchema = z.object({ok: z.boolean(), title: z.string()})
export const OkSchema = z.object({ok: z.boolean()})
```

Delete `export const DEFAULT_SESSION_ID = 'default'`. Reshape `ChatSessionSchema`: rename `harnessId` → `harnessSessionId` (keep `z.string().nullable()`), and type `sessionId` as `SessionId`. Set `RenameSessionSchema.sessionId` to `SessionId`. Keep `CONCIV_SESSION_HEADER`.

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run packages/protocol/test/chat-types.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck protocol**

Run: `npx turbo run typecheck --filter=@conciv/protocol`
Expected: PASS (downstream packages will break until later tasks — that's expected; do not fix them here).

- [ ] **Step 6: Commit**

```bash
git add packages/protocol/src/chat-types.ts packages/protocol/test/chat-types.test.ts
git commit -m "feat(protocol): branded SessionId + SessionRecord/resolve schemas; drop DEFAULT_SESSION_ID"
```

---

### Task 2: Core — `SessionStore` (unstorage), adapter-agnostic

**Files:**

- Add dep: `packages/core/package.json` (`unstorage`)
- Create: `packages/core/src/store/session-store.ts`
- Test: `packages/core/test/store/session-store.test.ts`

- [ ] **Step 1: Add the unstorage dependency**

Run: `pnpm --filter @conciv/core add unstorage`
Expected: `unstorage` appears in `packages/core/package.json` dependencies.

- [ ] **Step 2: Write failing tests against the MEMORY driver**

```ts
import {describe, it, expect} from 'vitest'
import {createMemorySessionStore} from '../../src/store/session-store.js'

const base = {harnessKind: 'claude', origin: 'chat' as const, cwd: '/app'}

describe('SessionStore (memory driver)', () => {
  it('create → get round-trips', async () => {
    const store = createMemorySessionStore()
    const rec = await store.create({
      id: 'conciv_a',
      harnessSessionId: null,
      title: null,
      model: null,
      usage: null,
      ...base,
    })
    expect(await store.get('conciv_a')).toEqual(rec)
  })
  it('update merges a patch and bumps updatedAt', async () => {
    const store = createMemorySessionStore()
    await store.create({id: 'conciv_a', harnessSessionId: null, title: null, model: null, usage: null, ...base})
    const updated = await store.update('conciv_a', {harnessSessionId: 'tok-1', title: 'Hi'})
    expect(updated.harnessSessionId).toBe('tok-1')
    expect(updated.title).toBe('Hi')
  })
  it('list returns all records; delete removes one', async () => {
    const store = createMemorySessionStore()
    await store.create({id: 'conciv_a', harnessSessionId: null, title: null, model: null, usage: null, ...base})
    await store.create({id: 'conciv_b', harnessSessionId: null, title: null, model: null, usage: null, ...base})
    expect((await store.list()).map((r) => r.id).sort()).toEqual(['conciv_a', 'conciv_b'])
    await store.delete('conciv_a')
    expect(await store.get('conciv_a')).toBeNull()
  })
  it('findByHarnessId returns the wrapping record (adopt idempotency)', async () => {
    const store = createMemorySessionStore()
    await store.create({id: 'conciv_a', harnessSessionId: 'tok-ext', title: null, model: null, usage: null, ...base})
    expect((await store.findByHarnessId('tok-ext'))?.id).toBe('conciv_a')
  })
})
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npx vitest run packages/core/test/store/session-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the interface + unstorage-backed store**

```ts
// packages/core/src/store/session-store.ts
import {createStorage, type Storage} from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import fsDriver from 'unstorage/drivers/fs-lite'
import {SessionRecordSchema, type SessionRecord} from '@conciv/protocol/chat-types'

// Domain interface — the only thing the rest of core imports. No storage primitives leak past it.
export type SessionStore = {
  create(record: Omit<SessionRecord, 'createdAt' | 'updatedAt'>): Promise<SessionRecord>
  get(id: string): Promise<SessionRecord | null>
  update(id: string, patch: Partial<SessionRecord>): Promise<SessionRecord>
  delete(id: string): Promise<void>
  list(): Promise<SessionRecord[]>
  findByHarnessId(harnessSessionId: string): Promise<SessionRecord | null>
}

// `now` is injected so tests are deterministic and the store stays pure.
function makeStore(storage: Storage, now: () => number): SessionStore {
  const read = async (id: string) => {
    const raw = await storage.getItem(id)
    return raw ? SessionRecordSchema.parse(raw) : null
  }
  return {
    create: async (input) => {
      const ts = now()
      const record = SessionRecordSchema.parse({...input, createdAt: ts, updatedAt: ts})
      await storage.setItem(record.id, record)
      return record
    },
    get: read,
    update: async (id, patch) => {
      const cur = await read(id)
      if (!cur) throw new Error(`session ${id} not found`)
      const next = SessionRecordSchema.parse({...cur, ...patch, id: cur.id, updatedAt: now()})
      await storage.setItem(id, next)
      return next
    },
    delete: async (id) => {
      await storage.removeItem(id)
    },
    list: async () => {
      const keys = await storage.getKeys()
      const recs = await Promise.all(keys.map((k) => read(k)))
      return recs.filter((r): r is SessionRecord => r !== null)
    },
    findByHarnessId: async (harnessSessionId) =>
      (await (async () => await Promise.all((await storage.getKeys()).map((k) => read(k))))()).find(
        (r) => r?.harnessSessionId === harnessSessionId,
      ) ?? null,
  }
}

// fs: one file per session under <stateRoot>/.conciv/sessions/<previewId>/ — atomic per session.
export function createSessionStore(opts: {stateRoot: string; previewId: string; now?: () => number}): SessionStore {
  const storage = createStorage<SessionRecord>({
    driver: fsDriver({base: `${opts.stateRoot}/.conciv/sessions/${opts.previewId}`}),
  })
  return makeStore(storage, opts.now ?? Date.now)
}

// memory: for tests + the contract any future driver must satisfy.
export function createMemorySessionStore(now: () => number = () => 1): SessionStore {
  return makeStore(createStorage<SessionRecord>({driver: memoryDriver()}), now)
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npx vitest run packages/core/test/store/session-store.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/package.json packages/core/src/store/session-store.ts packages/core/test/store/session-store.test.ts pnpm-lock.yaml
git commit -m "feat(core): consolidated SessionStore over unstorage (memory + fs drivers)"
```

---

### Task 3: Core — header → our id, delete the old stores

**Files:**

- Modify: `packages/core/src/api/chat/session-id.ts`
- Modify: `packages/core/src/state-paths.ts`
- Delete: `packages/core/src/store/session-titles-store.ts`, `packages/core/src/store/usage-store.ts`, and the old map `packages/core/src/store/session-store.ts` logic (now replaced)
- Delete: `packages/core/test/store/session-titles-store.test.ts`

- [ ] **Step 1: Write the failing test for session-id resolution**

```ts
// packages/core/test/api/chat/session-id.test.ts
import {describe, it, expect} from 'vitest'
import {sessionIdFromHeaders} from '../../../src/api/chat/session-id.js'

describe('sessionIdFromHeaders', () => {
  it('returns null when no header (a new session)', () => {
    expect(sessionIdFromHeaders(new Headers())).toBeNull()
  })
  it('returns the conciv_ id from the header', () => {
    const h = new Headers({'conciv-session-id': 'conciv_x'})
    expect(sessionIdFromHeaders(h)).toBe('conciv_x')
  })
  it('rejects a malformed id → null', () => {
    expect(sessionIdFromHeaders(new Headers({'conciv-session-id': 'no spaces!'}))).toBeNull()
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run packages/core/test/api/chat/session-id.test.ts`
Expected: FAIL — still returns `DEFAULT_SESSION_ID`.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/api/chat/session-id.ts
import {CONCIV_SESSION_HEADER, SessionId} from '@conciv/protocol/chat-types'

export function sessionIdFromHeaders(headers: Headers): string | null {
  const raw = headers.get(CONCIV_SESSION_HEADER)
  if (!raw) return null
  return SessionId.safeParse(raw).success ? raw : null
}
```

Then in `state-paths.ts` remove the `sessions`, `titles`, `usage` entries and add `sessionsDir: join(dir, 'sessions')`; keep `lockFor` and `systemPrompt`. Delete the two store files and the titles test.

- [ ] **Step 4: Run, verify it passes**

Run: `npx vitest run packages/core/test/api/chat/session-id.test.ts`
Expected: PASS. (Core typecheck still red until Task 4–7 rewire callers — expected.)

- [ ] **Step 5: Commit**

```bash
git rm packages/core/src/store/session-titles-store.ts packages/core/src/store/usage-store.ts packages/core/test/store/session-titles-store.test.ts
git add packages/core/src/api/chat/session-id.ts packages/core/src/state-paths.ts packages/core/test/api/chat/session-id.test.ts
git commit -m "feat(core): header→our id (no DEFAULT); delete titles + usage stores"
```

---

### Task 4: Core — `resolve` route + record lifecycle

**Files:**

- Modify: `packages/core/src/api/chat/chat.ts` (wire the store, drop `sessionFor` map + DEFAULT)
- Modify: `packages/core/src/api/chat/session.ts` (add `resolve`)
- Test: `packages/core/test/api/chat/resolve.test.ts`

- [ ] **Step 1: Write the failing test (resolve = mint / adopt / return)**

```ts
import {describe, it, expect} from 'vitest'
import {createMemorySessionStore} from '../../../src/store/session-store.js'
import {resolveSession} from '../../../src/api/chat/session.js'

const deps = (store = createMemorySessionStore()) => ({
  store,
  harnessKind: 'claude',
  cwd: '/app',
  mintId: () => 'conciv_new',
})

describe('resolveSession', () => {
  it('no id → mints a new record', async () => {
    const d = deps()
    const {sessionId} = await resolveSession(d, {})
    expect(sessionId).toBe('conciv_new')
    expect((await d.store.get('conciv_new'))?.origin).toBe('chat')
  })
  it('our id → returns it unchanged', async () => {
    const store = createMemorySessionStore()
    await store.create({
      id: 'conciv_a',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/app',
    })
    const {sessionId} = await resolveSession(deps(store), {id: 'conciv_a'})
    expect(sessionId).toBe('conciv_a')
  })
  it('harness id → adopts (idempotent by harnessSessionId)', async () => {
    const d = deps()
    const first = await resolveSession(d, {id: 'tok-ext'})
    const again = await resolveSession(d, {id: 'tok-ext'})
    expect(first.sessionId).toBe(again.sessionId)
    expect((await d.store.get(first.sessionId))?.origin).toBe('external')
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run packages/core/test/api/chat/resolve.test.ts`
Expected: FAIL — `resolveSession` not exported.

- [ ] **Step 3: Implement `resolveSession` + the route**

```ts
// packages/core/src/api/chat/session.ts  (new exported helper, used by the route)
import {randomUUID} from 'node:crypto'
import {ResolveRequestSchema, type SessionRecord} from '@conciv/protocol/chat-types'

export type ResolveDeps = {
  store: SessionStore
  harnessKind: string
  cwd: string
  mintId?: () => string
}

export async function resolveSession(deps: ResolveDeps, body: {id?: string}): Promise<{sessionId: string}> {
  const mint = deps.mintId ?? (() => `conciv_${randomUUID()}`)
  // our id → return as-is
  if (body.id?.startsWith('conciv_')) {
    const existing = await deps.store.get(body.id)
    if (existing) return {sessionId: existing.id}
  }
  // harness id → adopt (idempotent)
  if (body.id) {
    const wrapped = await deps.store.findByHarnessId(body.id)
    if (wrapped) return {sessionId: wrapped.id}
    const rec = await deps.store.create({
      id: mint(),
      harnessSessionId: body.id,
      harnessKind: deps.harnessKind,
      origin: 'external',
      title: null,
      model: null,
      usage: null,
      cwd: deps.cwd,
    })
    return {sessionId: rec.id}
  }
  // no id → mint a fresh session
  const rec = await deps.store.create({
    id: mint(),
    harnessSessionId: null,
    harnessKind: deps.harnessKind,
    origin: 'chat',
    title: null,
    model: null,
    usage: null,
    cwd: deps.cwd,
  })
  return {sessionId: rec.id}
}
```

Register the route in `registerSessionRoutes`:

```ts
app.post('/api/chat/session/resolve', async (event) => {
  const body = await readValidatedBody(event, ResolveRequestSchema)
  return resolveSession({store: deps.store, harnessKind: deps.harness.id, cwd: deps.cwd}, body)
})
```

In `chat.ts`: delete the `sessions` Map + `sessionFor` seeding + `DEFAULT_SESSION_ID` import; construct `createSessionStore({stateRoot, previewId})` and thread it into the route deps.

- [ ] **Step 4: Run, verify it passes**

Run: `npx vitest run packages/core/test/api/chat/resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/api/chat/session.ts packages/core/src/api/chat/chat.ts packages/core/test/api/chat/resolve.test.ts
git commit -m "feat(core): resolve route (mint/adopt/return) over SessionStore"
```

---

### Task 5: Core — `/session`, `/sessions` (read-only join), `/history` by our id

**Files:**

- Modify: `packages/core/src/api/chat/session.ts`
- Test: `packages/core/test/api/chat/sessions-list.test.ts`

- [ ] **Step 1: Write the failing test for the read-only list join**

```ts
import {describe, it, expect} from 'vitest'
import {buildSessionList} from '../../../src/api/chat/session.js'
import {createMemorySessionStore} from '../../../src/store/session-store.js'

describe('buildSessionList', () => {
  it('unions our records with unwrapped harness transcripts (no writes)', async () => {
    const store = createMemorySessionStore()
    await store.create({
      id: 'conciv_a',
      harnessSessionId: 'tok-a',
      harnessKind: 'claude',
      origin: 'chat',
      title: 'Mine',
      model: null,
      usage: null,
      cwd: '/app',
    })
    const harnessList = [
      {id: 'tok-a', derivedTitle: 'ignored', updatedAt: 10, messageCount: 3},
      {id: 'tok-ext', derivedTitle: 'External', updatedAt: 20, messageCount: 1},
    ]
    const rows = await buildSessionList({store, harnessList, runningKeys: new Set<string>()})
    const mine = rows.find((r) => r.id === 'conciv_a')!
    const ext = rows.find((r) => r.id === 'tok-ext')!
    expect(mine.title).toBe('Mine') // our record wins
    expect(ext.origin).toBe('external') // unwrapped transcript shown under its harness id
    expect(await store.findByHarnessId('tok-ext')).toBeNull() // list did NOT write
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run packages/core/test/api/chat/sessions-list.test.ts`
Expected: FAIL — `buildSessionList` not exported.

- [ ] **Step 3: Implement the join + wire the routes**

```ts
// session.ts
export type HarnessRow = {id: string; derivedTitle: string; updatedAt: number; messageCount: number}

export async function buildSessionList(args: {
  store: SessionStore
  harnessList: HarnessRow[]
  runningKeys: Set<string>
}): Promise<ChatSessionMeta[]> {
  const records = await args.store.list()
  const byHarness = new Map(records.filter((r) => r.harnessSessionId).map((r) => [r.harnessSessionId!, r]))
  const ours = records.map((r) => {
    const h = r.harnessSessionId ? args.harnessList.find((x) => x.id === r.harnessSessionId) : undefined
    return {
      id: r.id,
      title: r.title ?? h?.derivedTitle ?? 'New session',
      updatedAt: h?.updatedAt ?? r.updatedAt,
      messageCount: h?.messageCount ?? 0,
      running: args.runningKeys.has(r.id),
      origin: r.origin === 'external' ? 'external' : 'conciv',
      usage: r.usage,
    } satisfies ChatSessionMeta
  })
  const unwrapped = args.harnessList
    .filter((h) => !byHarness.has(h.id))
    .map((h) => ({
      id: h.id,
      title: h.derivedTitle,
      updatedAt: h.updatedAt,
      messageCount: h.messageCount,
      running: false,
      origin: 'external' as const,
      usage: null,
    }))
  return [...ours, ...unwrapped].sort((a, b) => b.updatedAt - a.updatedAt)
}
```

Rewire `GET /api/chat/sessions` to call `buildSessionList`. Rewire `GET /api/chat/session` to read the record by our id (404 when unknown), returning `{sessionId, harnessSessionId, name, origin, ...}`. Rewire `GET /api/chat/history` to read `record.harnessSessionId` (null → `[]`).

- [ ] **Step 4: Run, verify it passes**

Run: `npx vitest run packages/core/test/api/chat/sessions-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/api/chat/session.ts packages/core/test/api/chat/sessions-list.test.ts
git commit -m "feat(core): read-only /sessions join + /session,/history keyed by our id"
```

---

### Task 6: Core — turn.ts (lock/usage/onSessionId/resume by our id)

**Files:**

- Modify: `packages/core/src/api/chat/turn.ts`
- Test: `packages/core/test/api/chat/turn-session.test.ts` (unit around the session bits)

- [ ] **Step 1: Write the failing test (onSessionId persists the token; resume reads it)**

```ts
import {describe, it, expect} from 'vitest'
import {createMemorySessionStore} from '../../../src/store/session-store.js'
import {resumeTokenFor, recordMintedToken} from '../../../src/api/chat/turn.js'

describe('turn session helpers', () => {
  it('resumeTokenFor returns the stored harness token (null when new)', async () => {
    const store = createMemorySessionStore()
    await store.create({
      id: 'conciv_a',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/app',
    })
    expect(await resumeTokenFor(store, 'conciv_a')).toBeNull()
    await recordMintedToken(store, 'conciv_a', 'tok-1')
    expect(await resumeTokenFor(store, 'conciv_a')).toBe('tok-1')
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run packages/core/test/api/chat/turn-session.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement + rewire the turn**

```ts
// turn.ts
export const resumeTokenFor = async (store: SessionStore, id: string) => (await store.get(id))?.harnessSessionId ?? null
export const recordMintedToken = (store: SessionStore, id: string, token: string) =>
  store.update(id, {harnessSessionId: token})
```

In `POST /api/chat`: `const sessionId = sessionIdFromHeaders(...)` (now our id, non-null because the client always resolves first — reject with 400 if null); `acquireLock(stateRoot, sessionId, ...)`; `resumeSessionId = await resumeTokenFor(store, sessionId)`; `onSessionId: (tok) => recordMintedToken(store, sessionId, tok)`; usage written via `store.update(sessionId, {usage})`.

- [ ] **Step 4: Run, verify it passes**

Run: `npx vitest run packages/core/test/api/chat/turn-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/api/chat/turn.ts packages/core/test/api/chat/turn-session.test.ts
git commit -m "feat(core): turn lock/usage/resume keyed by our id, token persisted on mint"
```

---

### Task 7: Core — rename/launch/delete + agent hand-off, then green the package

**Files:**

- Modify: `packages/core/src/api/chat/session.ts` (rename → `record.title`, delete → `store.delete`)
- Modify: `packages/core/src/api/chat/launch.ts` (resume token from record)
- Modify: `packages/core/src/api/chat/chat.ts` (agent hand-off seeds a record)
- Test: `packages/core/test/api/chat/agent-handoff.test.ts`

- [ ] **Step 1: Write the failing test (agent hand-off seeds a wrapping record)**

```ts
import {describe, it, expect} from 'vitest'
import {createMemorySessionStore} from '../../../src/store/session-store.js'
import {seedAgentSession} from '../../../src/api/chat/chat.js'

describe('seedAgentSession', () => {
  it('wraps an initial harness id as an conciv_ record (origin agent), idempotent', async () => {
    const store = createMemorySessionStore()
    const a = await seedAgentSession(
      {store, harnessKind: 'claude', cwd: '/app', mintId: () => 'conciv_seed'},
      'tok-init',
    )
    expect(a.origin).toBe('agent')
    const b = await seedAgentSession(
      {store, harnessKind: 'claude', cwd: '/app', mintId: () => 'conciv_other'},
      'tok-init',
    )
    expect(b.id).toBe('conciv_seed') // idempotent by harness id
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run packages/core/test/api/chat/agent-handoff.test.ts`
Expected: FAIL — `seedAgentSession` not exported.

- [ ] **Step 3: Implement the remaining route rewires**

```ts
// chat.ts
export async function seedAgentSession(deps: ResolveDeps, harnessId: string): Promise<SessionRecord> {
  const existing = await deps.store.findByHarnessId(harnessId)
  if (existing) return existing
  const mint = deps.mintId ?? (() => `conciv_${randomUUID()}`)
  return deps.store.create({
    id: mint(),
    harnessSessionId: harnessId,
    harnessKind: deps.harnessKind,
    origin: 'agent',
    title: null,
    model: null,
    usage: null,
    cwd: deps.cwd,
  })
}
```

At app boot, if `cfg.sessionId` (the handed-off harness id) is set, call `seedAgentSession`. Rewire `POST /api/chat/sessions/title` to `store.update(body.sessionId, {title: clean})` returning `{ok: true, title: clean}`. Rewire `DELETE /api/chat/session` to kill the lock + `store.delete(sessionId)`. Rewire `launch.ts` to `(await store.get(sessionId))?.harnessSessionId`.

- [ ] **Step 4: Run the test + full core suite + typecheck**

Run: `npx vitest run packages/core/test/api/chat/agent-handoff.test.ts`
Expected: PASS.
Run: `npx turbo run typecheck test --filter=@conciv/core`
Expected: PASS — Phase 1 verify gate green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/api/chat/session.ts packages/core/src/api/chat/launch.ts packages/core/src/api/chat/chat.ts packages/core/test/api/chat/agent-handoff.test.ts
git commit -m "feat(core): rename/launch/delete + agent hand-off on SessionStore; core green"
```

---

## Phase 2 — Typed client (right after the endpoints)

### Task 8a: Widget — the one transport (`route` + `stream`)

**Files:**

- Create: `packages/widget/src/transport.ts`
- Test: `packages/widget/test/transport.test.ts`

This is the single network seam for ALL `/api/*` calls (session + page-bus + test-runner + editor). `defineClient` (8b) layers the session header on top; non-session callers use a header-less transport.

- [ ] **Step 1: Write the failing test**

```ts
import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import {createServer, type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import {z} from 'zod'
import {createTransport} from '../src/transport.js'

// Real server — NO mocks. It echoes the received session header so we assert what actually went over the wire.
let server: Server
let base = ''
beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/p')
      return void res.end(JSON.stringify({ok: true, echo: req.headers['conciv-session-id'] ?? null}))
    res.statusCode = 500
    res.end('nope')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

describe('createTransport (real server)', () => {
  it('route() parses the response and sends the injected header', async () => {
    const t = createTransport({apiBase: base, headers: () => ({'conciv-session-id': 'conciv_1'})})
    const out = await t.route({
      method: 'POST',
      path: '/api/p',
      request: z.object({a: z.number()}),
      response: z.object({ok: z.boolean(), echo: z.string().nullable()}),
    })({a: 1})
    expect(out).toEqual({ok: true, echo: 'conciv_1'})
  })
  it('throws ApiError on non-2xx', async () => {
    const t = createTransport({apiBase: base})
    await expect(t.route({method: 'GET', path: '/api/missing', response: z.object({})})()).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run packages/widget/test/transport.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the transport**

```ts
// packages/widget/src/transport.ts — the only place that touches the network
import {z} from 'zod'

export class ApiError extends Error {
  constructor(
    public path: string,
    public status: number,
  ) {
    super(`${path} → ${status}`)
  }
}
type Args<T> = {} extends T ? [body?: T] : [body: T]

export function createTransport(opts: {apiBase: string; headers?: () => Record<string, string>}) {
  const base = opts.apiBase.replace(/\/+$/, '')
  const extra = opts.headers ?? (() => ({}))
  function route<Res extends z.ZodTypeAny>(spec: {
    method: 'GET' | 'DELETE'
    path: string
    response: Res
  }): () => Promise<z.infer<Res>>
  function route<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny>(spec: {
    method: 'POST'
    path: string
    request: Req
    response: Res
  }): (...a: Args<z.infer<Req>>) => Promise<z.infer<Res>>
  function route(spec: {method: string; path: string; request?: z.ZodTypeAny; response: z.ZodTypeAny}) {
    return (body?: unknown) => {
      const headers: Record<string, string> = {...extra()}
      const payload = spec.request ? JSON.stringify(body) : undefined
      if (payload) headers['content-type'] = 'application/json'
      return fetch(`${base}${spec.path}`, {method: spec.method, credentials: 'include', headers, body: payload})
        .then((r) => (r.ok ? r.json() : Promise.reject(new ApiError(spec.path, r.status))))
        .then((j) => spec.response.parse(j))
    }
  }
  return {
    route,
    url: (path: string) => `${base}${path}`, // for the AG-UI chat stream transport
    headers: extra, // ditto (header function it consumes)
    eventSource: (path: string) => new EventSource(`${base}${path}`, {withCredentials: true}),
  }
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npx vitest run packages/widget/test/transport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/transport.ts packages/widget/test/transport.test.ts
git commit -m "feat(widget): one typed transport (route + stream) for all /api calls"
```

---

### Task 8b: Widget — `defineClient` (session instance) over the transport

**Files:**

- Create: `packages/widget/src/session-client.ts`
- Delete: `packages/widget/src/chat-api.ts` (after Phase 3 importers are migrated)
- Test: `packages/widget/test/session-client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import {createServer, type Server} from 'node:http'
import type {AddressInfo} from 'node:net'
import {defineClient} from '../src/session-client.js'

// Real server — NO mocks. Captures the last session header it actually received.
let server: Server
let base = ''
let lastSessionHeader: string | null = null
beforeAll(async () => {
  server = createServer((req, res) => {
    lastSessionHeader = (req.headers['conciv-session-id'] as string | undefined) ?? null
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/chat/session/resolve') return void res.end(JSON.stringify({sessionId: 'conciv_x'}))
    if (req.url === '/api/chat/sessions') return void res.end(JSON.stringify({sessions: []}))
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

describe('defineClient (real server)', () => {
  it('resolve() returns the branded id; the header is attached only after setSessionId', async () => {
    const client = defineClient({apiBase: base})
    expect((await client.resolve()).sessionId).toBe('conciv_x') // no header before set
    expect(lastSessionHeader).toBeNull()
    client.setSessionId('conciv_x' as never)
    await client.sessions()
    expect(lastSessionHeader).toBe('conciv_x') // server actually received our id
    expect(client.chatStreamUrl()).toBe(`${base}/api/chat`)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run packages/widget/test/session-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `defineClient` on the transport, exposing EVERY session call**

```ts
// packages/widget/src/session-client.ts
import {createSignal} from 'solid-js'
import {z} from 'zod'
import {createTransport} from './transport.js'
import {
  CONCIV_SESSION_HEADER,
  type SessionId,
  ChatSessionSchema,
  ChatSessionsSchema,
  ChatHistorySchema,
  ChatModelsSchema,
  ChatLaunchSchema,
  ChatLaunchRequestSchema,
  RenameSessionSchema,
  ResolveRequestSchema,
  ResolveResponseSchema,
  RenameResponseSchema,
  OkSchema,
  PermissionDecisionSchema, // {renderId, approved}
} from '@conciv/protocol/chat-types'

export function defineClient(opts: {apiBase: string}) {
  const [sessionId, setSessionId] = createSignal<SessionId | null>(null)
  const sessionHeaders = () => {
    const id = sessionId()
    return id ? {[CONCIV_SESSION_HEADER]: id} : {}
  }
  const t = createTransport({apiBase: opts.apiBase, headers: sessionHeaders})
  return {
    sessionId,
    setSessionId,
    // AG-UI chat stream transport reads these (POST SSE handled by @tanstack/ai-client)
    chatStreamUrl: () => t.url('/api/chat'),
    chatHeaders: sessionHeaders,
    // request/response routes — every session-scoped call lives here
    resolve: t.route({
      method: 'POST',
      path: '/api/chat/session/resolve',
      request: ResolveRequestSchema,
      response: ResolveResponseSchema,
    }),
    session: t.route({method: 'GET', path: '/api/chat/session', response: ChatSessionSchema}),
    sessions: t.route({method: 'GET', path: '/api/chat/sessions', response: ChatSessionsSchema}),
    history: t.route({method: 'GET', path: '/api/chat/history', response: ChatHistorySchema}),
    models: t.route({method: 'GET', path: '/api/chat/models', response: ChatModelsSchema}),
    rename: t.route({
      method: 'POST',
      path: '/api/chat/sessions/title',
      request: RenameSessionSchema,
      response: RenameResponseSchema,
    }),
    launch: t.route({
      method: 'POST',
      path: '/api/chat/launch',
      request: ChatLaunchRequestSchema,
      response: ChatLaunchSchema,
    }),
    remove: t.route({method: 'DELETE', path: '/api/chat/session', response: OkSchema}),
    permissionDecision: t.route({
      method: 'POST',
      path: '/api/chat/permission-decision',
      request: PermissionDecisionSchema,
      response: OkSchema,
    }),
  }
}
```

(Add `PermissionDecisionSchema = z.object({renderId: z.string(), approved: z.boolean()})` to `@conciv/protocol/chat-types.ts` in this step — it backs the approval gate.)

- [ ] **Step 4: Run, verify it passes + typecheck**

Run: `npx vitest run packages/widget/test/session-client.test.ts`
Expected: PASS.
Run: `npx turbo run typecheck --filter=@conciv/widget`
Expected: errors only in the not-yet-rewired importers (Phase 3); `session-client.ts` itself clean.

- [ ] **Step 5: Commit**

```bash
git add packages/widget/src/session-client.ts packages/protocol/src/chat-types.ts packages/widget/test/session-client.test.ts
git commit -m "feat(widget): defineClient over transport — all session routes incl models + permission"
```

---

## Phase 3 — Widget rewiring

### Task 9: `widget-shell.tsx` — client instance, persist our id, drop `activeToken`

**Files:**

- Modify: `packages/widget/src/widget-shell.tsx`

- [ ] **Step 1: Replace the session signal with a client + persisted our-id**

Remove the `activeToken` signal and the `onSessionLabel` token plumbing added during debugging. Create `const client = defineClient({apiBase})`; seed `client.setSessionId(readStorage('conciv-active-session', parseConcivId, null))` on mount; persist on change. `onNew` → `await client.resolve()` then `client.setSessionId(id)` + `writeStorage`. Pass `activeId={() => client.sessionId()}` to the selector.

- [ ] **Step 2: Typecheck**

Run: `npx turbo run typecheck --filter=@conciv/widget`
Expected: errors shrink to the remaining components (selector, panes, panel).

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/widget-shell.tsx
git commit -m "refactor(widget): shell uses defineClient + persisted our id; remove activeToken"
```

---

### Task 10: `session-selector.tsx` — key by our id, resolve on switch

**Files:**

- Modify: `packages/widget/src/session-selector.tsx`
- Modify: `packages/widget/src/session-store-client.ts` (surface rows keyed by our id)

- [ ] **Step 1: Rewire selection through `resolve`**

`onSwitch(rowId)` → `const {sessionId} = await client.resolve({id: rowId}); client.setSessionId(sessionId)` (this adopts an external row). `activeId` matches rows by our id. `makeSurfaceRow`/`mergeSurface` keyed by our id.

- [ ] **Step 2: Typecheck**

Run: `npx turbo run typecheck --filter=@conciv/widget`
Expected: errors shrink to panes + panel.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/session-selector.tsx packages/widget/src/session-store-client.ts
git commit -m "refactor(widget): selector keys by our id, resolves (adopts) on switch"
```

---

### Task 11: `quick-terminal.tsx` — per-pane client

**Files:**

- Modify: `packages/widget/src/quick-terminal.tsx`

- [ ] **Step 1: Give each pane its own client**

Each pane creates `defineClient({apiBase})`; pane "new" → `resolve()`; pane layout persistence (the `conciv-qt-panes` list) stores our ids. Remove harness-id surface keying. Replace the direct `fetch(DELETE /api/chat/session)` in `forgetSession` (`quick-terminal.tsx:71`) with the closing pane's `client.remove()`.

- [ ] **Step 2: Typecheck**

Run: `npx turbo run typecheck --filter=@conciv/widget`
Expected: errors shrink to chat-panel only.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/quick-terminal.tsx
git commit -m "refactor(widget): per-pane defineClient, panes persist our ids"
```

---

### Task 12: `chat-panel.tsx` + `session-info.tsx` — client incl. the chat STREAM + permission gate

**Files:**

- Modify: `packages/widget/src/chat-panel.tsx`
- Modify: `packages/widget/src/session-info.tsx`

- [ ] **Step 1: Route ALL panel comms — including the stream — through the client**

`chat-panel` takes the pane/modal's `client`. Replace:

- `api.session()` / `api.history()` → `client.session()` / `client.history()`; `loadedSessionId` tracks our id.
- the AG-UI transport (`chat-panel.tsx:352`): `fetchServerSentEvents(client.chatStreamUrl(), () => ({...}))` with `headers: client.chatHeaders()`.
- the compact POST (`chat-panel.tsx:541` `fetch(api.chatUrl, ...)`) → a `client` method or `fetch(client.chatStreamUrl(), {headers: client.chatHeaders()})`.
- the approval gate's decision POST → `client.permissionDecision({renderId, approved})`.
  `session-info` shows `harnessSessionId` as read-only "extra info" only — never used for comms.

- [ ] **Step 2: Typecheck the whole widget — should be green**

Run: `npx turbo run typecheck --filter=@conciv/widget`
Expected: PASS (chat-api.ts now has no importers; ensure it's deleted).

- [ ] **Step 3: Commit**

```bash
git rm packages/widget/src/chat-api.ts
git add packages/widget/src/chat-panel.tsx packages/widget/src/session-info.tsx
git commit -m "refactor(widget): chat-panel stream + permission via client; drop chat-api"
```

---

### Task 13: `model-selector.tsx` — `client.models()`

**Files:**

- Modify: `packages/widget/src/model-selector.tsx`

- [ ] **Step 1: Replace `createChatApi(...).models()` with a transport call**

The model selector isn't session-scoped, so it uses a header-less client: `const client = defineClient({apiBase: ctx.apiBase})` (no `setSessionId`) and calls `client.models()`. Remove the `createChatApi` import.

- [ ] **Step 2: Typecheck + commit**

Run: `npx turbo run typecheck --filter=@conciv/widget`
Expected: PASS.

```bash
git add packages/widget/src/model-selector.tsx
git commit -m "refactor(widget): model-selector via client.models()"
```

---

### Task 14: composer actions — `new-session-action` → `resolve`, `open-in-terminal-action` → `launch`

**Files:**

- Modify: `packages/widget/src/new-session-action.tsx`
- Modify: `packages/widget/src/open-in-terminal-action.tsx`

- [ ] **Step 1: Rewire both actions**

`new-session-action.tsx:16` calls the deleted `newSession()` (`POST /session/new`). Replace with the shell/pane flow: `const {sessionId} = await client.resolve()` then set it active — these actions receive the active `client` via `ctx`. `open-in-terminal-action.tsx:16` → `client.launch({model})`. Remove both `createChatApi` imports.

- [ ] **Step 2: Typecheck + commit**

Run: `npx turbo run typecheck --filter=@conciv/widget`
Expected: PASS.

```bash
git add packages/widget/src/new-session-action.tsx packages/widget/src/open-in-terminal-action.tsx
git commit -m "refactor(widget): composer actions use resolve()/launch() (drop /session/new)"
```

---

### Task 15: `mount.tsx` — availability probe target

**Files:**

- Modify: `packages/widget/src/mount.tsx`
- Modify: `packages/widget/src/transport.ts` (or a small `probeChatAvailable` helper) — probe a NON-session route

- [ ] **Step 1: Move the probe off `/session`**

The old probe hit header-less `GET /api/chat/session`; that now 404s on unknown ids, so it can't distinguish "chat unavailable" from "no session." Probe `GET /api/chat/models` instead (always present when chat is mounted, not session-scoped): a 2xx → available, network error / 404 → not mounted. Update `mount.tsx:56` to use this probe; drop `createChatApi`/`probeChatAvailable` from the deleted `chat-api`.

- [ ] **Step 2: Typecheck + commit**

Run: `npx turbo run typecheck --filter=@conciv/widget`
Expected: PASS.

```bash
git add packages/widget/src/mount.tsx packages/widget/src/transport.ts
git commit -m "refactor(widget): probe chat availability via /models, not /session"
```

---

### Task 16: `page-bus.ts` — over the transport

**Files:**

- Modify: `packages/widget/src/page-bus.ts`

- [ ] **Step 1: Use the transport for the page bus**

`const t = createTransport({apiBase})`; `t.eventSource('/api/page/stream')` for the subscription; `t.route({method: 'POST', path: '/api/page/reply', request: PageReplySchema, response: OkSchema})` for the reply (add `PageReplySchema` to protocol if not present). Replace the raw `new EventSource` + `fetch`.

- [ ] **Step 2: Typecheck + manual smoke (page-bus has IT coverage) + commit**

Run: `npx turbo run typecheck --filter=@conciv/widget`
Expected: PASS.

```bash
git add packages/widget/src/page-bus.ts packages/protocol/src/chat-types.ts
git commit -m "refactor(widget): page-bus over the shared transport"
```

---

### Task 17: `test-card.tsx` — over the transport

**Files:**

- Modify: `packages/widget/src/test-card.tsx`

- [ ] **Step 1: Use the transport**

`t.eventSource('/api/test-runner/stream')` for the live tree; `t.route({method: 'POST', path: '/api/editor/open', request: EditorOpenSchema, response: OkSchema})` for "open in editor". Replace the raw `EventSource` + `fetch`.

- [ ] **Step 2: Typecheck + commit**

Run: `npx turbo run typecheck --filter=@conciv/widget`
Expected: PASS.

```bash
git add packages/widget/src/test-card.tsx packages/protocol/src/chat-types.ts
git commit -m "refactor(widget): test-card (runner stream + editor open) over the transport"
```

---

### Task 18: Widget browser IT — reload restores, switch, adopt, rename

**Files:**

- Modify: `packages/widget/test/widget.it.test.ts` (re-point the reload test at the new model; extend the existing **real** `http.createServer` test server with the `resolve` route — this is a real server, not a mock)

- [ ] **Step 1: Extend the real test server + the reload regression test**

Add `POST /api/chat/session/resolve` to the existing real test server: no id → return a fresh `conciv_` id and remember it (stateful in the server closure); `conciv_` id → echo; harness id → return a deterministic `conciv_` wrapper. Keep `/sessions` returning the two rows. The reload test: open chat, send a message (new session, server mints `conciv_` via resolve), reload, reopen — assert the thread + selector title persist. Add a switch+reload test and an adopt-external test.

- [ ] **Step 2: Run the widget IT (real browser)**

Run: `npx vitest run packages/widget/test/widget.it.test.ts`
Expected: PASS — including `restores the active session across a page reload`.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/test/widget.it.test.ts
git commit -m "test(widget): reload-restore + switch + adopt ITs on the one-id model"
```

---

## Phase 4 — Harness enrichment + cleanup

### Task 19: claude `history.ts` enrichment + final sweep

**Files:**

- Modify: `packages/harness/src/claude/history.ts`
- Modify: `packages/protocol/src/harness-types.ts` (extend `HarnessSessionMeta`)
- Test: `packages/harness/test/claude/history.test.ts`

- [ ] **Step 1: Write the failing test for enrichment parsing**

```ts
import {describe, it, expect} from 'vitest'
import {parseSessionMeta} from '../../src/claude/history.js'

describe('parseSessionMeta', () => {
  it('extracts model + token totals + last message from a transcript', () => {
    const jsonl = [
      JSON.stringify({type: 'system', session_id: 'tok', model: 'claude-opus-4-8'}),
      JSON.stringify({type: 'result', usage: {input_tokens: 10, output_tokens: 5}}),
    ].join('\n')
    const meta = parseSessionMeta('tok', jsonl, 123)
    expect(meta.model).toBe('claude-opus-4-8')
    expect(meta.updatedAt).toBe(123)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run packages/harness/test/claude/history.test.ts`
Expected: FAIL — `parseSessionMeta` / fields not present.

- [ ] **Step 3: Implement enrichment**

Extend `HarnessSessionMeta` with `model?: string | null`, `totalTokens?: number`, `lastMessage?: string | null`, `createdAt?: number`. Add `parseSessionMeta` and use it in `listSessions`.

- [ ] **Step 4: Run, verify it passes + full build**

Run: `npx vitest run packages/harness/test/claude/history.test.ts`
Expected: PASS.
Run: `npx turbo run build typecheck test lint`
Expected: PASS across all packages.

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/claude/history.ts packages/protocol/src/harness-types.ts packages/harness/test/claude/history.test.ts
git commit -m "feat(harness): enrich session metadata (model, tokens, last message)"
```

---

## Self-review notes (author checklist, done)

- **Spec coverage:** one-id principle (Tasks 1,3,4,6), SessionStore/unstorage (2), resolve seam (4), read-only list + adopt (5,10,18), branded-id invariant + transport/client (1,8a,8b), persistence/reload (9,18), title in store / titles-store deleted (1,3,7), harness enrichment (19), agent hand-off (7). All spec sections map to a task.
- **Every backend call site covered (swept):** chat stream + compact + permission gate (12), `session`/`history`/`sessions`/`rename` (5,10,12), `models` (13), `new-session`/`launch` actions (14), availability probe (15), qt `forgetSession` (11), page-bus (16), test-runner/editor (17). `chat-api.ts` has no importers left → deleted (12).
- **No stubs/mocks:** transport (8a) and client (8b) tests use a real `http.createServer`; widget behavior verified in a real browser (18); core uses real unstorage drivers (2). No `vi.fn`/`stubGlobal` anywhere.
- **Placeholders:** none — every code step shows code; verify steps show commands + expected output.
- **Type consistency:** `SessionRecord` field names and `resolveSession`/`buildSessionList`/`seedAgentSession`/`resumeTokenFor` signatures are reused verbatim across tasks.
