# Multi-session + Session Selector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each surface a real, independent, concurrently-runnable agent session, then add a header **session selector** that lists every Claude session in the CWD (marking which were started by conciv), switches between them, starts new ones, and renames them.

**Architecture:** Identity is a client-minted id sent in an `conciv-session-id` header (the **header id**). The server keys session state, lock, uiBus channel, and usage **all by the header id**; the list keys rows by harness token and joins back through the `previewId → {headerId: token}` map. `HarnessHistory.list(cwd, home?)` enumerates transcripts; an Ark Combobox `SessionSelector` (pill in the modal header, borderless `bar` variant in qt pane bars) drives switch/new/rename, fed by one shared client cache. Discovered (externally-started) sessions are referenced directly by harness token; the server seeds an unmapped transcript-backed id as its own resume token.

**Tech Stack:** TypeScript, Solid (widget), h3 + srvx (core), Zod, Ark UI Combobox (`@ark-ui/solid`), `@floating-ui/dom`, Vitest (unit + core IT), Playwright (widget IT, `browser.newPage()`).

**Specs:** `docs/superpowers/specs/2026-06-16-session-selector-design.md` (v3, esp. §2b canonical-id model) and base `docs/superpowers/specs/2026-06-15-multi-session-quick-terminal-design.md`.

**Conventions (repo memory):** functions not classes; no IIFEs; one-line comments; build/typecheck via `pnpm turbo build` / `pnpm turbo typecheck`; no jsdom — widget UI tested in a real browser; widget ITs use `browser.newPage()`; UI = Ark primitives + existing `pw-*` CSS; animate with the existing CSS-transition tokens for parity.

### Canonical id model (READ FIRST — every task below depends on it)

- **Header id is canonical for all live state.** It is what the client sends in `conciv-session-id`: a
  client-minted uuid for a new session, the **harness token** for a discovered/external one. **Lock, uiBus
  channel, and usage are ALL keyed by the header id** — never re-keyed to the harness token mid-turn.
- **The list keys rows by the harness token** (transcript filename). `GET /sessions` joins to live state
  through the `previewId → {headerId: token}` map (invert it: token → headerIds).
- **`conciv ui` (cross-process inject)** routes by the header id injected into the agent's spawn env
  (`CONCIV_SESSION_ID`) and echoed back as the header.
- **`origin='conciv'`** iff a token appears in the map under a key **≠ itself** (new session: `uuid→token`;
  adopted external: `token→token`). This is true "started by conciv" and never poisons on resume.

---

## Phase A — Multi-session foundation

Phase A delivers the foundation the selector builds on. Most of it is the existing plan
`docs/superpowers/plans/2026-06-15-multi-session-quick-terminal.md`; the concurrency-critical tasks are
owned here (A6, A17–A19) with corrected bodies because the review found the foundation's versions buggy.

**Execute in this order:**

1. **Foundation Tasks 1, 2, 3, 4, 5** — verbatim from the 2026-06-15 plan. They deliver: protocol header
   constants (`CONCIV_SESSION_HEADER`, `DEFAULT_SESSION_ID`) + `harnessId`/`name` on `ChatSessionSchema` +
   drop `ChatRequestSchema.sessionId` (Task 1); claude `nameFromTranscript` (Task 2); **per-session lock**
   `agent.<sessionId>.lock` (Task 3); session-store reshape to `previewId → {sessionId: token}` with
   `readSessions`/`writeSession`/`removeSession` (Task 4); `sessionIdFromHeaders` (Task 5).
2. **Task A6** (below) — replaces foundation Task 6.
3. **Foundation Tasks 7–16** — verbatim. They deliver: header-scoped core ITs (Task 7, incl. the
   `postChat(msg, sessionId)` / `getSession(id)` test-server helpers); `@floating-ui/dom` (8); `Popover` (9);
   `SessionInfoCard` + `sessionLabel` (10); `chat-api` header transport + `sessionHeaders()` (11); `ChatPanel`
   `sessionId` prop + `onSessionLabel` (12); `PanelContext` + modal header label/popover (13); qt per-pane
   `sessionId` + mint + `localStorage` layout + pane-bar label (14); fake-claude `summary` + multi-pane IT (15).
4. **Tasks A17, A18, A19** (below) — after A6 / Task 7 / Task 12 respectively.

> Foundation Tasks 1–5/7–16 are not reproduced here; open that plan for their step-by-step bodies. Tasks
> A6/A17/A18/A19 below supersede or extend it and contain everything needed.

### Task A6: Per-session chat routes (replaces foundation Task 6) — preserve usage/intent, key by header id

The foundation's shown Task 6 rewrite of `turn.ts` drops the existing usage-write, `onUsage`/`injectUsage`, and the `intent`/`turnKind`/compact-fallback logic. This version keeps all of it and keys per-session state by the header id.

**Files:**

- Modify: `packages/core/src/api/chat/chat.ts` (session `Map` + `sessionFor`)
- Modify: `packages/core/src/api/chat/session.ts` (header-based `/session`, `/history`, `/stop`, `DELETE`)
- Modify: `packages/core/src/api/chat/turn.ts` (per-session lock + header id, KEEP usage/intent/compact)
- Modify: `packages/core/test/api/chat/chat.it.test.ts` (409 test → default-session lock)

- [ ] **Step 1: `chat.ts` — session map + `sessionFor` with a discovered-session seed hook**

```ts
import {existsSync} from 'node:fs'
import {DEFAULT_SESSION_ID} from '@conciv/protocol/chat-types'
import {readSessions} from '../../store/session-store.js'
// ...
const sessions = new Map<string, SessionState>()
const sessionFor: SessionLookup = (sessionId) => {
  let s = sessions.get(sessionId)
  if (!s) {
    const stored = readSessions(opts.stateRoot, opts.previewId)[sessionId] ?? ''
    let seed = sessionId === DEFAULT_SESSION_ID ? opts.initialSessionId || stored : stored
    // Discovered/external session referenced by its harness token: adopt the token as the resume id
    // (so switching to a terminal-started session resumes it). Charset-validated upstream (§4.5).
    if (!seed && opts.harness.history && existsSync(opts.harness.history.transcriptPath(opts.cwd, sessionId))) {
      seed = sessionId
    }
    s = {harnessSessionId: seed}
    sessions.set(sessionId, s)
  }
  return s
}
```

Pass `sessionFor` + `previewId` into both `registerSessionRoutes` and `registerTurnRoutes` (per the foundation's `SessionLookup`/`SessionState` types in `session.ts`).

- [ ] **Step 2: `session.ts` — header-based reads, keep `usage`/`name`/`harnessId`**

Keep the foundation's `/session` (returns `sessionId`/`harnessId`/`name`/`source`/`cwd`/`lock`), `/history`, `/stop`, `DELETE /session`. The only correction vs the foundation draft: **retain the `readUsage` import** and include `usage` on `/session` if the foundation kept it (the v3 selector reads usage from `/sessions`, not `/session`, so `/session` need not carry usage — but do not break existing consumers; match foundation Task 1's `ChatSessionSchema`). Resolve session id via `sessionIdFromHeaders(event.req.headers)` and `deps.sessionFor(id)`.

- [ ] **Step 3: `turn.ts` — per-session lock + header id, PRESERVE usage/onUsage/intent/compact**

Start from the CURRENT `turn.ts` (which has intent/turnKind, compact fallback, model resolution, `onUsage`, and the `RUN_FINISHED` usage write). Apply only these changes:

```ts
const sessionId = sessionIdFromHeaders(event.req.headers)        // header id (canonical)
if (readLock(deps.stateRoot, sessionId).held) throw new HTTPError({status: 409, message: 'session busy'})
const session = deps.sessionFor(sessionId)
const resumeSessionId = harness.capabilities.resume ? session.harnessSessionId || null : null
// ...
onSessionId: (id) => { session.harnessSessionId = id; writeSession(deps.stateRoot, deps.previewId, sessionId, id) },
onUsage: (usage) => uiBus.injectUsage(sessionId, usage),        // header id (A17 makes injectUsage keyed)
onSpawn: (child) => { acquireLock(deps.stateRoot, sessionId, 'chat', child.pid); /* abort listener as today */ },
// ...
const merged = uiBus.run(sessionId, stream)                      // header id (A17)
const sse = toServerSentEventsStream(withLockRelease(merged, deps.stateRoot, sessionId), abort)
```

Keep the `intent`/`turnKind`, compact-fallback prompt substitution, and `model` resolution exactly as today. `withLockRelease` keeps the `RUN_FINISHED` usage write but keyed on **`sessionId`** (the header id — A18 hardens this):

```ts
async function* withLockRelease(src, stateRoot, sessionId): AsyncGenerator<StreamChunk> {
  try {
    for await (const c of src) {
      if (c.type === EventType.RUN_FINISHED && c.usage) writeUsage(stateRoot, sessionId, tokenUsageToSnapshot(c.usage))
      yield c
    }
  } finally {
    releaseLock(stateRoot, sessionId)
  }
}
```

- [ ] **Step 4: Update the 409 test** to acquire the default-session lock (`acquireLock(stateRoot, DEFAULT_SESSION_ID, 'iterate', process.pid)`), import `DEFAULT_SESSION_ID`.

- [ ] **Step 5: Typecheck + test**

Run: `pnpm turbo typecheck --filter=@conciv/core && pnpm --filter @conciv/core exec vitest run`
Expected: PASS (existing resume + usage + 409 tests green).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/api/chat packages/core/test/api/chat/chat.it.test.ts
git commit -m "feat(core): per-session chat routes keyed by header id (usage/intent preserved)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task A17: Turn-scoped uiBus + agent learns its header id

Today `ui-bus.ts` keeps one global `state.channel`; concurrent turns clobber it. And the spawned agent has no session id in its env, so `POST /api/chat/ui` can't route. Fix both.

**Files:**

- Modify: `packages/core/src/runtime/ui-bus.ts`
- Modify: `packages/core/src/api/chat/turn.ts` (route `/ui` by header id; inject env)
- Modify: the spawn path so the child env carries the turn's header id (`packages/core/src/engine.ts` / wherever `spawnHarness`/`childEnv` is built — search `CONCIV_PORT`)
- Modify: `packages/cli/src/cli-http.ts` (send `conciv-session-id` from `process.env.CONCIV_SESSION_ID`)
- Test: `packages/core/test/runtime/ui-bus.test.ts` (create) + a core IT over HTTP

- [ ] **Step 1: Write the failing unit test (registry routing)**

```ts
import {describe, it, expect} from 'vitest'
import {makeUiBus} from '../../src/runtime/ui-bus.js'
import {EventType} from '@tanstack/ai'

async function* slow(chunk: unknown) {
  yield chunk
  await new Promise((r) => setTimeout(r, 5))
}

describe('uiBus per-session channels', () => {
  it('routes inject to the matching header id only', async () => {
    const bus = makeUiBus()
    const a = bus.run('h-a', slow({type: EventType.RUN_STARTED}) as never)
    const b = bus.run('h-b', slow({type: EventType.RUN_STARTED}) as never)
    expect(bus.inject('h-a', {renderId: 'r1', kind: 'card'} as never)).toBe(true)
    expect(bus.inject('h-missing', {renderId: 'r2', kind: 'card'} as never)).toBe(false)
    const drain = async (g: AsyncGenerator<unknown>) => {
      const o: unknown[] = []
      for await (const c of g) o.push(c)
      return o
    }
    const [ca, cb] = await Promise.all([drain(a), drain(b)])
    const custom = (cs: unknown[]) => cs.filter((c) => (c as {type: string}).type === EventType.CUSTOM)
    expect(custom(ca).length).toBe(1)
    expect(custom(cb).length).toBe(0)
  })
})
```

- [ ] **Step 2: Run it — confirm fail** (`run`/`inject` don't take a key).

Run: `pnpm --filter @conciv/core exec vitest run test/runtime/ui-bus.test.ts` → FAIL.

- [ ] **Step 3: Rewrite `ui-bus.ts` to a per-header-id registry**

```ts
export type UiBus = {
  inject: (sessionId: string, spec: UiSpec) => boolean // false if no live turn for this id
  injectUsage: (sessionId: string, usage: UsageSnapshot) => void
  run: (sessionId: string, harnessEvents: AsyncIterable<StreamChunk>) => AsyncGenerator<StreamChunk>
}
export function makeUiBus(): UiBus {
  const channels = new Map<string, Channel>()
  const inject = (sessionId, spec) => {
    const ch = channels.get(sessionId)
    if (!ch) return false
    ch.push(aguiCustomFor(spec))
    return true
  }
  const injectUsage = (sessionId, usage) => {
    channels.get(sessionId)?.push(aguiUsageFor(usage))
  }
  async function* run(sessionId, harnessEvents) {
    const channel = makeChannel()
    channels.set(sessionId, channel)
    async function pump() {
      try {
        for await (const c of harnessEvents) channel.push(c)
      } finally {
        channel.close()
      }
    }
    const p = pump()
    try {
      for await (const c of channel.iterate()) yield c
    } finally {
      if (channels.get(sessionId) === channel) channels.delete(sessionId)
      await p
    }
  }
  return {inject, injectUsage, run}
}
```

(`makeChannel`, `aguiCustomFor`, `aguiUsageFor` unchanged.)

- [ ] **Step 4: Give the agent its header id, route `/ui` by it**

- In the spawn path (search for where `childEnv` / `CONCIV_PORT` is set — `engine.ts`), make the child env per-turn and add `CONCIV_SESSION_ID: <the turn's header id>`. This means `spawnHarness` must receive the header id (thread it from `turn.ts`'s `onSpawn`/spawn call).
- In `packages/cli/src/cli-http.ts`, add `conciv-session-id` from `process.env.CONCIV_SESSION_ID` to the `/api/chat/ui` POST headers.
- In `turn.ts`, the `/api/chat/ui` handler: `const sessionId = sessionIdFromHeaders(event.req.headers); return {renderId: spec.renderId, injected: uiBus.inject(sessionId, spec)}`.

- [ ] **Step 5: Add a core IT driving `/api/chat/ui` over HTTP**

In `chat.it.test.ts` (or a new `ui-inject.it.test.ts`): start a turn for `h-a`, POST `/api/chat/ui` with the `conciv-session-id: h-a` header, assert the SSE for `h-a` contains the CUSTOM event and a concurrent `h-b` turn's SSE does not. (This is the cross-process path the unit test can't cover.)

- [ ] **Step 6: Run + typecheck**

Run: `pnpm --filter @conciv/core exec vitest run test/runtime/ui-bus.test.ts && pnpm turbo typecheck --filter=@conciv/core`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/runtime/ui-bus.ts packages/core/src/api/chat/turn.ts packages/core/src/engine.ts packages/cli/src/cli-http.ts packages/core/test
git commit -m "fix(core): per-session uiBus channels + agent learns its header id for /ui routing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task A18: Usage keyed on the header id (verified, not re-keyed to the token)

A6 Step 3 already keys `writeUsage` on the header `sessionId`. This task adds the cross-write regression test.

**Files:**

- Modify: `packages/core/test/fixtures/fake-claude.ts` (distinct per-turn usage)
- Modify: `packages/core/test/api/chat/chat.it.test.ts`

- [ ] **Step 1: Make fake-claude emit controllable per-turn usage**

Have the fixture emit distinct `input_tokens` per invocation (e.g. from an env var the spawn sets, or increment a counter persisted to a temp file). Keep its `session_id` distinct per header id if feasible; if it always emits `sess-fake`, drive distinctness via the env.

- [ ] **Step 2: Write the failing IT**

```ts
it('writes usage under the turn header id, not a shared pointer', async () => {
  const server = await startTestServer({spawnHarness: fakeSpawn()})
  state.server = server
  await server.postChat(turn('hi'), 'h-a') // usage U_a
  await server.postChat(turn('yo'), 'h-b') // usage U_b
  const ua = readUsage(server.stateRoot, 'h-a')
  const ub = readUsage(server.stateRoot, 'h-b')
  expect(ua?.inputTokens).not.toBe(ub?.inputTokens) // no cross-write
})
```

Import `readUsage` from `../../../src/store/usage-store.js`.

- [ ] **Step 3: Run** → with A6's header-keyed write this should PASS; if it fails, the write is still keyed on a shared field — fix in A6 Step 3.

Run: `pnpm --filter @conciv/core exec vitest run test/api/chat/chat.it.test.ts`

- [ ] **Step 4: Commit**

```bash
git add packages/core/test
git commit -m "test(core): usage keyed on header id under interleaved turns

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task A19: Compact carries the session header

**Files:** Modify `packages/widget/src/chat-panel.tsx` (the `compact` fetch).

- [ ] **Step 1:** In `compact()`'s `fetch`, add the header: `headers: {'content-type': 'application/json', ...api.sessionHeaders()}`.
- [ ] **Step 2:** `pnpm turbo typecheck --filter=@conciv/widget` → PASS.
- [ ] **Step 3: Commit** `git commit -m "fix(widget): compact turn carries the conciv-session-id header\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

## Phase B — Session selector

### Task B1: Protocol — list meta + contracts + SessionId

**Files:** Modify `packages/protocol/src/harness-types.ts`, `packages/protocol/src/chat-types.ts`.

- [ ] **Step 1: `harness-types.ts` — optional `list`**

`list` is OPTIONAL so the foundation's `nameFromTranscript`-only adapter still typechecks.

```ts
export type HarnessSessionMeta = {id: string; derivedTitle: string; updatedAt: number; messageCount: number}
export type HarnessHistory = {
  transcriptPath(cwd: string, sessionId: string): string
  parse(raw: string): UIMessage[]
  nameFromTranscript?(raw: string): string | null
  // Enumerate the cwd's sessions, newest first, bounded. `home` is injectable for testing.
  list?(cwd: string, home?: string): HarnessSessionMeta[] | Promise<HarnessSessionMeta[]>
}
```

- [ ] **Step 2: `chat-types.ts` — contracts**

```ts
export const SessionId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
export const ChatSessionMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  messageCount: z.number(),
  running: z.boolean(),
  origin: z.enum(['conciv', 'external']),
  usage: UsageSnapshotSchema.nullable(),
})
export const ChatSessionsSchema = z.object({sessions: z.array(ChatSessionMetaSchema)})
export type ChatSessionMeta = z.infer<typeof ChatSessionMetaSchema>
export type ChatSessions = z.infer<typeof ChatSessionsSchema>
export const RenameSessionSchema = z.object({sessionId: SessionId, title: z.string().max(120)})
```

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo typecheck --filter=@conciv/protocol`
Expected: PASS (protocol has no in-package consumer of `claudeHistory`; `list` is optional). Note: `@conciv/harness` is unaffected because `list` is optional — B2 adds it.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/src
git commit -m "feat(protocol): session-list meta, ChatSessions, SessionId, rename body

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B2: Claude `listSessions(cwd, home)` — bounded + path-safe

**Files:** Modify `packages/harness/src/claude/history.ts`; extend `packages/harness/test/claude-history.test.ts`.

- [ ] **Step 1: Write the failing tests** (deterministic mtimes via `utimesSync`; >50 cap; missing dir)

```ts
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {encodeProjectDir, listSessions} from '../src/claude/history.js'

function seed(home: string, cwd: string, id: string, body: string, mtimeSec: number) {
  const dir = join(home, '.claude', 'projects', encodeProjectDir(cwd))
  mkdirSync(dir, {recursive: true})
  const p = join(dir, `${id}.jsonl`)
  writeFileSync(p, body)
  utimesSync(p, mtimeSec, mtimeSec)
}

it('lists newest-first with title + count', async () => {
  const home = mkdtempSync(join(tmpdir(), 'conciv-home-'))
  const cwd = '/proj/x'
  seed(home, cwd, 'old', JSON.stringify({type: 'user', message: {content: 'first task'}}) + '\n', 1000)
  seed(
    home,
    cwd,
    'new',
    [
      JSON.stringify({type: 'user', message: {content: 'newer task'}}),
      JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: 'ok'}]}}),
    ].join('\n') + '\n',
    2000,
  )
  const out = await listSessions(cwd, home)
  expect(out.map((s) => s.id)).toEqual(['new', 'old'])
  expect(out[0]).toMatchObject({derivedTitle: 'newer task', messageCount: 2})
  rmSync(home, {recursive: true, force: true})
})

it('caps at 50 and does not read the 51st', async () => {
  const home = mkdtempSync(join(tmpdir(), 'conciv-home-'))
  const cwd = '/proj/y'
  for (let i = 0; i < 51; i++)
    seed(
      home,
      cwd,
      `s${String(i).padStart(2, '0')}`,
      JSON.stringify({type: 'user', message: {content: `t${i}`}}) + '\n',
      1000 + i,
    )
  const out = await listSessions(cwd, home)
  expect(out.length).toBe(50)
  expect(out.some((s) => s.id === 's00')).toBe(false) // oldest dropped
  rmSync(home, {recursive: true, force: true})
})

it('returns [] for a missing dir', async () => {
  expect(await listSessions('/no/such', mkdtempSync(join(tmpdir(), 'conciv-home-')))).toEqual([])
})
```

- [ ] **Step 2: Run → FAIL** (`listSessions` not exported).

Run: `pnpm --filter @conciv/harness exec vitest run test/claude-history.test.ts`

- [ ] **Step 3: Implement** (stat → sort → read top 50; first-line title type-narrowed; never throw)

`parseRecord`/`partsFrom` are private same-module helpers — reuse them directly, do NOT import.

```ts
import {readdir, stat, readFile} from 'node:fs/promises'
const MAX_SESSIONS = 50

function titleFromHead(raw: string): string {
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const rec = parseRecord(t)
    if (rec?.type === 'user') {
      const parts = partsFrom(rec.message?.content)
      const text = parts.find((p) => p.type === 'text')
      if (text && text.type === 'text' && typeof text.content === 'string')
        return text.content.replace(/\s+/g, ' ').trim().slice(0, 80)
    }
  }
  return ''
}

export async function listSessions(cwd: string, home: string = homedir()): Promise<HarnessSessionMeta[]> {
  const dir = join(home, '.claude', 'projects', encodeProjectDir(cwd))
  let names: string[]
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.jsonl'))
  } catch {
    return []
  }
  const stamped = (
    await Promise.all(
      names.map(async (name) => {
        try {
          return {name, mtime: (await stat(join(dir, name))).mtimeMs}
        } catch {
          return null
        }
      }),
    )
  ).filter(Boolean) as {name: string; mtime: number}[]
  const top = stamped.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_SESSIONS)
  return Promise.all(
    top.map(async (f) => {
      const raw = await readFile(join(dir, f.name), 'utf8').catch(() => '')
      return {
        id: f.name.replace(/\.jsonl$/, ''),
        derivedTitle: titleFromHead(raw),
        updatedAt: Math.round(f.mtime),
        messageCount: parseHistory(raw).length,
      }
    }),
  )
}

export const claudeHistory: HarnessHistory = {
  transcriptPath,
  parse: parseHistory,
  nameFromTranscript,
  list: listSessions,
}
```

- [ ] **Step 4: Path-containment guard + test**

Add to `history.ts` and use it wherever a session id reaches `transcriptPath` reads (history route, list):

```ts
import {resolve, sep} from 'node:path'
// True iff the resolved transcript path stays inside the project dir (defense-in-depth vs traversal).
export function withinProject(cwd: string, sessionId: string, home: string = homedir()): boolean {
  const root = resolve(join(home, '.claude', 'projects', encodeProjectDir(cwd)))
  return resolve(transcriptPath(cwd, sessionId, home)).startsWith(root + sep)
}
```

Test: `withinProject('/proj', '../../etc/passwd')` → `false`; a normal uuid → `true`.

- [ ] **Step 5: Extend `capability-matrix.test.ts`** — assert `typeof claude.history?.list === 'function'`.

- [ ] **Step 6: Run + typecheck**

Run: `pnpm --filter @conciv/harness exec vitest run test/claude-history.test.ts && pnpm turbo typecheck --filter=@conciv/protocol --filter=@conciv/harness`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/harness/src/claude/history.ts packages/harness/test
git commit -m "feat(harness): claude listSessions (bounded, path-safe, injectable home)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B3: Title store (atomic, mutexed)

**Files:** Modify `packages/core/src/state-paths.ts`; create `packages/core/src/store/session-titles-store.ts` + test.

- [ ] **Step 1: Add a `titles` path to `state-paths.ts`**

Add `titles: join(dir, 'session-titles.json')` to `StatePaths` + `statePaths()` (alongside `lock`/`sessions`).

- [ ] **Step 2: Write the failing test (incl. concurrent no-lost-update)**

```ts
import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readTitle, writeTitle} from '../../src/store/session-titles-store.js'
const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'conciv-titles-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
})

it('writes, reads, clears', async () => {
  const root = tmp()
  expect(readTitle(root, 'a')).toBeNull()
  await writeTitle(root, 'a', 'Checkout bug')
  expect(readTitle(root, 'a')).toBe('Checkout bug')
  await writeTitle(root, 'a', '')
  expect(readTitle(root, 'a')).toBeNull()
})
it('no lost update under concurrent writes', async () => {
  const root = tmp()
  await Promise.all([writeTitle(root, 'a', 'X'), writeTitle(root, 'b', 'Y'), writeTitle(root, 'a', 'Z')])
  expect(readTitle(root, 'a')).toBe('Z')
  expect(readTitle(root, 'b')).toBe('Y')
})
```

- [ ] **Step 3: Run → FAIL** (module missing).

- [ ] **Step 4: Implement (promise-chain mutex + atomic tmp+rename)**

```ts
import {writeFileSync, renameSync, mkdirSync} from 'node:fs'
import {dirname} from 'node:path'
import {z} from 'zod'
import {readJson} from '../fs.js'
import {statePaths} from '../state-paths.js'
const TitleMap = z.record(z.string(), z.string())

export function readTitle(stateRoot: string, sessionId: string): string | null {
  if (!sessionId) return null
  const t = readJson(statePaths(stateRoot).titles, TitleMap, {})[sessionId]
  return typeof t === 'string' && t ? t : null
}
let queue: Promise<void> = Promise.resolve()
export function writeTitle(stateRoot: string, sessionId: string, title: string): Promise<void> {
  if (!sessionId) return Promise.resolve()
  queue = queue.then(() => {
    const path = statePaths(stateRoot).titles
    const map = readJson(path, TitleMap, {})
    if (title) map[sessionId] = title
    else delete map[sessionId]
    mkdirSync(dirname(path), {recursive: true})
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(map))
    renameSync(tmp, path)
  })
  return queue
}
```

- [ ] **Step 5: Run → PASS.** **Step 6: Commit**

```bash
git add packages/core/src/state-paths.ts packages/core/src/store/session-titles-store.ts packages/core/test/store/session-titles-store.test.ts
git commit -m "feat(core): atomic mutexed session-titles store

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B4: `readLocks` enumerator

**Files:** Modify `packages/core/src/store/lock.ts`; extend `packages/core/test/store/lock.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import {readLocks} from '../../src/store/lock.js'
it('enumerates live lock keys (header ids), not the old global name', () => {
  const root = tmp()
  acquireLock(root, 'h-a', 'chat', process.pid)
  acquireLock(root, 'h-b', 'iterate', process.pid)
  expect(
    readLocks(root)
      .map((l) => l.key)
      .sort(),
  ).toEqual(['h-a', 'h-b'])
})
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** (depends on Phase A Task 3's `agent.<id>.lock` path)

```ts
import {readdirSync} from 'node:fs'
export function readLocks(stateRoot: string): {key: string; role: LockRole | null; pid: number}[] {
  let files: string[]
  try {
    files = readdirSync(statePaths(stateRoot).dir).filter((f) => /^agent\..+\.lock$/.test(f))
  } catch {
    return []
  }
  const out: {key: string; role: LockRole | null; pid: number}[] = []
  for (const f of files) {
    const key = f.replace(/^agent\./, '').replace(/\.lock$/, '')
    const lock = readLock(stateRoot, key)
    if (lock.held && lock.pid) out.push({key, role: lock.role, pid: lock.pid})
  }
  return out
}
```

- [ ] **Step 4: Run → PASS. Step 5: Commit**

```bash
git add packages/core/src/store/lock.ts packages/core/test/store/lock.test.ts
git commit -m "feat(core): readLocks enumerates live session locks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B5: `GET /sessions` + `POST /sessions/title` (join, origin, validation)

**Files:** Modify `packages/core/src/api/chat/session.ts`, `packages/core/src/api/chat/session-id.ts`; thread an injectable Claude `home` for tests; create `packages/core/test/api/chat/sessions.it.test.ts`.

- [ ] **Step 1: Validate the header id in `session-id.ts`**

```ts
import {CONCIV_SESSION_HEADER, DEFAULT_SESSION_ID, SessionId} from '@conciv/protocol/chat-types'
export function sessionIdFromHeaders(headers: Headers): string {
  const raw = headers.get(CONCIV_SESSION_HEADER)?.trim()
  if (!raw) return DEFAULT_SESSION_ID
  return SessionId.safeParse(raw).success ? raw : DEFAULT_SESSION_ID // bad → default, never a path
}
```

- [ ] **Step 2: Thread an injectable Claude home** so the route's `list` can be pointed at a temp home in tests. Add an optional `claudeHome?: string` to the chat-route opts (default `undefined` → adapter uses `homedir()`); `GET /sessions` calls `hist.list(deps.cwd, deps.claudeHome)`. `startTestServer` accepts + forwards it.

- [ ] **Step 3: Write the failing IT** (seed a real transcript + a mapped session in a temp home)

```ts
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {encodeProjectDir} from '@conciv/harness/claude/history' // or re-export
import {ChatSessionsSchema} from '@conciv/protocol/chat-types'

it('lists sessions with origin/title/running joined to the map', async () => {
  const home = mkdtempSync(join(tmpdir(), 'conciv-home-'))
  const cwd = process.cwd()
  const dir = join(home, '.claude', 'projects', encodeProjectDir(cwd))
  mkdirSync(dir, {recursive: true})
  writeFileSync(
    join(dir, 'tok-conciv.jsonl'),
    JSON.stringify({type: 'user', message: {content: 'made in conciv'}}) + '\n',
  )
  writeFileSync(
    join(dir, 'tok-ext.jsonl'),
    JSON.stringify({type: 'user', message: {content: 'made in terminal'}}) + '\n',
  )
  const server = await startTestServer({cwd, claudeHome: home, spawnHarness: fakeSpawn()})
  state.server = server
  // Map a client uuid -> tok-conciv so origin resolves to 'conciv'; tok-ext stays external.
  writeSession(server.stateRoot, server.previewId, 'uuid-1', 'tok-conciv')
  const {sessions} = ChatSessionsSchema.parse(await (await server.getSessions()).json())
  expect(sessions.find((s) => s.id === 'tok-conciv')?.origin).toBe('conciv')
  expect(sessions.find((s) => s.id === 'tok-ext')?.origin).toBe('external')
})

it('rename persists into the next list', async () => {
  /* ...as above... */
  await server.post('/api/chat/sessions/title', {sessionId: 'tok-ext', title: 'My title'})
  const {sessions} = ChatSessionsSchema.parse(await (await server.getSessions()).json())
  expect(sessions.find((s) => s.id === 'tok-ext')?.title).toBe('My title')
})

it('rejects a bad session id', async () => {
  const res = await server.post('/api/chat/sessions/title', {sessionId: '../etc', title: 'x'})
  expect(res.status).toBe(400)
})
```

Add a `getSessions()` GET helper to `startTestServer` (mirrors `getSession`).

- [ ] **Step 4: Run → FAIL** (routes missing).

- [ ] **Step 5: Implement the routes** (join via the map; origin per §2b)

```ts
app.get('/api/chat/sessions', async () => {
  const hist = deps.harness.history
  if (!deps.harness.capabilities.transcriptHistory || !hist?.list) return {sessions: []}
  const metas = await hist.list(deps.cwd, deps.claudeHome)
  const map = readSessions(deps.stateRoot, deps.previewId) // headerId -> token
  const headerIdsByToken = new Map<string, string[]>()
  for (const [headerId, token] of Object.entries(map)) {
    const arr = headerIdsByToken.get(token) ?? []
    arr.push(headerId)
    headerIdsByToken.set(token, arr)
  }
  const lockKeys = new Set(readLocks(deps.stateRoot).map((l) => l.key))
  const sessions = metas.map((m) => {
    const headers = headerIdsByToken.get(m.id) ?? []
    return {
      id: m.id,
      title: readTitle(deps.stateRoot, m.id) ?? m.derivedTitle,
      updatedAt: m.updatedAt,
      messageCount: m.messageCount,
      running: lockKeys.has(m.id) || headers.some((h) => lockKeys.has(h)),
      origin: Object.entries(map).some(([k, v]) => v === m.id && k !== m.id) ? 'conciv' : 'external',
      usage: readUsage(deps.stateRoot, m.id) ?? headers.map((h) => readUsage(deps.stateRoot, h)).find(Boolean) ?? null,
    }
  })
  return {sessions}
})

app.post('/api/chat/sessions/title', async (event) => {
  const {sessionId, title} = await readValidatedBody(event, RenameSessionSchema)
  const clean = title
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  await writeTitle(deps.stateRoot, sessionId, clean)
  return {ok: true, title: clean}
})
```

Re-import `readUsage` (`usage-store.js`), `readSessions` (`session-store.js`), `readLocks` (`lock.js`), `readTitle`/`writeTitle` (`session-titles-store.js`), `RenameSessionSchema` (protocol). Thread `previewId` + `claudeHome` into `SessionRouteDeps`.

- [ ] **Step 6: Run + typecheck → PASS. Step 7: Commit**

```bash
git add packages/core/src/api/chat packages/core/test
git commit -m "feat(core): /sessions (join origin/running/usage) + /sessions/title + id validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B6: `chat-api` — `sessions()` + `renameSession()` (zod-validated)

**Files:** Modify `packages/widget/src/chat-api.ts`.

- [ ] **Step 1: Add the methods**

```ts
import {ChatSessionsSchema, type ChatSessionMeta} from '@conciv/protocol/chat-types'
import {z} from 'zod'
const RenameResp = z.object({ok: z.boolean(), title: z.string()})

// on ChatApi:
sessions: async () => {
  try {
    const res = await fetch(`${base}/api/chat/sessions`, {credentials: 'include'})
    if (res.status === 404) return {status: 'unsupported' as const, sessions: []}
    if (!res.ok) return {status: 'error' as const, sessions: []}
    return {status: 'ok' as const, sessions: ChatSessionsSchema.parse(await res.json()).sessions}
  } catch { return {status: 'error' as const, sessions: [] as ChatSessionMeta[]} }
},
renameSession: async (sessionId: string, title: string) => {
  const res = await fetch(`${base}/api/chat/sessions/title`, {
    method: 'POST', credentials: 'include',
    headers: {'content-type': 'application/json'}, body: JSON.stringify({sessionId, title}),
  })
  if (!res.ok) throw new Error('rename failed')
  return RenameResp.parse(await res.json()).title
},
```

- [ ] **Step 2: Typecheck → PASS. Step 3: Commit**

```bash
git add packages/widget/src/chat-api.ts
git commit -m "feat(widget): chat-api sessions() + renameSession()

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B7: Shared session-list cache + surface merge

**Files:** Create `packages/widget/src/session-store-client.ts`.

- [ ] **Step 1: Implement** (one fetch shared; 404→hide, error→Retry; optimistic rename; surface union)

```ts
import {createSignal} from 'solid-js'
import type {ChatSessionMeta} from '@conciv/protocol/chat-types'
import {createChatApi} from './chat-api.js'

type Status = 'idle' | 'loading' | 'ready' | 'error'
const [fetched, setFetched] = createSignal<ChatSessionMeta[]>([])
const [status, setStatus] = createSignal<Status>('idle')
// Surfaces' just-born sessions (headerId/token known locally before the file flushes), keyed by token.
const [surfaces, setSurfaces] = createSignal<Record<string, ChatSessionMeta>>({})
let inflight: Promise<void> | null = null

function refetch(apiBase: string): Promise<void> {
  setStatus('loading')
  inflight = createChatApi({apiBase})
    .sessions()
    .then((r) => {
      setFetched(r.sessions)
      setStatus(r.status === 'error' ? 'error' : 'ready')
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}
export function loadSessions(apiBase: string): Promise<void> {
  return inflight ?? refetch(apiBase)
}
export function invalidateSessions(apiBase: string): Promise<void> {
  inflight = null
  return refetch(apiBase)
}
export function applyTitle(id: string, title: string): void {
  setFetched((p) => p.map((s) => (s.id === id ? {...s, title} : s)))
}
// A surface contributes its current session so a brand-new one shows as one row before it's on disk.
export function mergeSurface(token: string | null, row: ChatSessionMeta | null): void {
  setSurfaces((p) => {
    const n = {...p}
    if (token && row) n[token] = row
    return n
  })
}
// Rendered list: fetched rows, with surface rows unioned in and deduped by token (fetched wins).
export function sessions(): ChatSessionMeta[] {
  const byId = new Map(Object.values(surfaces()).map((s) => [s.id, s]))
  for (const s of fetched()) byId.set(s.id, s)
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}
export {status}
```

- [ ] **Step 2: Typecheck → PASS. Step 3: Commit**

```bash
git add packages/widget/src/session-store-client.ts
git commit -m "feat(widget): shared session-list cache with surface union

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B8: `SessionSelector` component

Build against spec §5.2 (structure/variants), §5.5 (states), §6 (a11y), §7 (animation) — those are the detailed acceptance criteria. Model the Ark Combobox wiring on `model-selector.tsx`.

**Files:** Create `packages/widget/src/session-selector.tsx`.

- [ ] **Step 1: Props + reactive collection (verified Ark mechanics)**

```tsx
import {createSignal, createEffect, For, Show, onMount, type JSX} from 'solid-js'
import {Combobox, useListCollection} from '@ark-ui/solid/combobox'
import {Check, ChevronsUpDown, Sparkles, SquarePen, Plus} from 'lucide-solid'
import type {ChatSessionMeta} from '@conciv/protocol/chat-types'
import {sessions, status, loadSessions} from './session-store-client.js'

export function SessionSelector(props: {
  variant: 'pill' | 'bar'
  apiBase: string
  activeId: () => string | null
  busy: () => boolean
  lockedElsewhere: (id: string) => boolean
  onSwitch: (id: string) => void
  onNew: () => void
  announce: (msg: string, assertive?: boolean) => void
}): JSX.Element {
  const [query, setQuery] = createSignal('')
  const coll = useListCollection<ChatSessionMeta>({
    initialItems: [],
    itemToValue: (s) => s.id,
    itemToString: (s) => s.title,
    filter: (text, q, item) => `${item.title} ${item.id}`.toLowerCase().includes(q.toLowerCase()),
  })
  // VERIFIED (@ark-ui/solid 5.37.1): initialItems is read once; the only reactive update path is set().
  // set() also clears the filter text, so re-apply our query after. Don't recreate useListCollection.
  createEffect(() => {
    coll.set(sessions())
    if (query()) coll.filter(query())
  })
  onMount(() => void loadSessions(props.apiBase))
  // ... Combobox.Root with a unique `ids` prefix per instance; positioner portal inside the panel.
  return null as unknown as JSX.Element
}
```

- [ ] **Step 2: Build the body to satisfy §5.2/§5.5/§6/§7**, in this order, checking each against its spec line:
  1. **Trigger** — `pill` (bordered, `min-width:0;flex:1 1 auto`, ellipsized current title) vs `bar`
     (borderless, inherits mono, dot+caret). `aria-disabled` + handler-blocked while `busy()`; reason via
     Ark Tooltip / `aria-describedby` (not bare `title`). `aria-label` names the session.
  2. **Popover header** (outside the listbox, Tab order): search input (controlled by `query()`, calls
     `coll.filter`), a **"Rename current session"** button → inline `<input>` (autofocus, Enter commit / Esc
     cancel, `stopPropagation` so Enter/Esc don't reach the combobox or modal trap; optimistic `applyTitle`
     - `renameSession` + rollback + commit-once; disabled when `activeId()` is a not-yet-born fresh id),
       and a **"+ New session"** button (`props.onNew()`, disabled while `busy()`). A Retry button when
       `status()==='error'`.
  3. **List** — Ark `Combobox.Item`s grouped by recency buckets (`Today`/`Yesterday`/`Earlier` from
     `updatedAt`) via `Combobox.ItemGroupLabel`. Row: title (ellipsis + `title`/`aria-label`), meta line as
     an `aria-label` ("Edited … · N messages · started in conciv/externally"; glyphs `aria-hidden`), check on
     `activeId()`, a `running` pulse dot when `lockedElsewhere(id)`, and the **origin marker** (`Sparkles`,
     `aria-hidden`) on `origin==='conciv'`.
  4. **States** — skeleton rows (`pw-session-skel`, `aria-busy`, `role="status"` "Loading sessions…") while
     `status()==='loading'`; `role="status"` empty lines ("No other sessions yet" / "No sessions match");
     error row + Retry.
  5. **Select** — on `onValueChange`, if id `!== activeId()` and not `busy()` → `props.onSwitch(id)` +
     `announce('Switched to ' + title)`.

- [ ] **Step 3: Typecheck → PASS. Step 4: Commit**

```bash
git add packages/widget/src/session-selector.tsx
git commit -m "feat(widget): SessionSelector (reactive collection, variants, origin marker, full states)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B9: CSS — `pw-session-*`, shared popover motion, reduced-motion

**Files:** the widget stylesheet (`grep -rl "pw-qt-pane" packages/widget/src`).

- [ ] **Step 1:** Add `pw-session-trigger`/`-bar`/`-item`/`-meta`/`-origin`/`-running`/`-skel`/`-empty`/`-error`/`-rename` per §5.2/§5.5. Touch targets ≥44px; disabled cue not color-only (grey + glyph + tooltip). `bar` variant: borderless, inherit mono; below a pane-width breakpoint (container query on `.pw-qt-pane`) collapse `ContextTracker` to ring-only.
- [ ] **Step 2:** Add a shared `pw-combo-content[data-state=open|closed]` entrance (opacity + 4px translateY, ~120ms `var(--pw-ease)`); apply to BOTH the session popover and `model-selector` content (relax model-selector's `[hidden]`-removes so the close frame plays). Add `pw-session-skel` shimmer (1.2s linear). Add `.pw-chat-hydrating .pw-chat-msg{animation:none}`.
- [ ] **Step 3:** In the existing `@media (prefers-reduced-motion: reduce)` block, add by name: `pw-session-skel`, `pw-combo-content`, `pw-chat-switching` (gentle-pulse substitute, like `pw-compact-pulse`), rename swap.
- [ ] **Step 4:** `pnpm turbo build --filter=@conciv/widget` → PASS. **Step 5: Commit**

```bash
git add packages/widget/src
git commit -m "feat(widget): session-selector styles + shared combo popover motion + reduced-motion

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B10: ChatPanel switch — load-then-swap, 409, invalidate on turn-end

**Files:** Modify `packages/widget/src/chat-panel.tsx`.

- [ ] **Step 1: Replace the `hydrateState.done` boolean with a `loadedSessionId` ref** shared by first-activation hydrate and switching, so neither double-`setMessages`.
- [ ] **Step 2: Switch on `props.sessionId()` change (≠ `loadedSessionId`), load-then-swap:**
      `chat.stop()` → fetch `api.history()` (header carries the id) → on success: add `pw-chat-hydrating` on the
      log, `setMessages(prior)`, set usage from cached meta, set `loadedSessionId`, remove the class; on empty:
      greeting + `invalidateSessions`; **on failure: keep the current thread, revert `loadedSessionId`, show
      `pw-chat-error` "Couldn't load that session" + Retry, `announce(..., true)`**. Show a `pw-chat-switching`
      overlay (`role="status"`) while loading; move focus to it (don't orphan it) and re-disable composer.
- [ ] **Step 3: Send-time 409** → a distinct `pw-chat-busy` inline state ("Busy in another pane"), not raw `chat.error()`; Retry once free.
- [ ] **Step 4: Debounced `invalidateSessions(props.apiBase)` on turn-end** (when `isThinking()||isStreaming()` falls to false).
- [ ] **Step 5:** `pnpm turbo typecheck build --filter=@conciv/widget` → PASS. **Step 6: Commit**

```bash
git add packages/widget/src/chat-panel.tsx
git commit -m "feat(widget): ChatPanel session switch (load-then-swap, 409 busy, turn-end invalidate)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B11: Wire selector into modal header + qt pane bar; live region; surface merge

**Files:** Modify `packages/widget/src/widget-shell.tsx`, `packages/widget/src/quick-terminal.tsx`.

- [ ] **Step 1: Modal** — replace the foundation's static label/`SessionInfoCard` trigger in `pw-chat-head` with `<SessionSelector variant="pill" …>` fed by the modal's `sessionId` signal; `onSwitch` sets it; `onNew` mints a fresh uuid. Add ONE shell-level polite + assertive live region OUTSIDE any pane; pass its writer as `announce`.
- [ ] **Step 2: Quick-terminal** — replace the per-pane label with `<SessionSelector variant="bar" …>` fed by the pane's `sessionId` signal; wire the pane's working signal into `busy` (thread `onWorkingChange`, today a no-op there). `lockedElsewhere(id) = sessions().find((s)=>s.id===id)?.running && id!==activeId()`.
- [ ] **Step 3: Surface merge + invalidate** — each surface calls `mergeSurface(token, row)` from its `onSessionLabel` (so a just-born session shows as one row); call `invalidateSessions(apiBase)` on pane add/close.
- [ ] **Step 4:** `pnpm turbo typecheck build --filter=@conciv/widget` → PASS. **Step 5: Commit**

```bash
git add packages/widget/src/widget-shell.tsx packages/widget/src/quick-terminal.tsx
git commit -m "feat(widget): session selector in modal header + qt pane bars + live region + surface merge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B12: Widget IT (browser-only behavior)

The widget IT has no harness / `~/.claude`; list/origin/seed correctness is proven in B5's core IT. Here, verify browser-side behavior against a **scripted** `/api/chat/sessions` response.

**Files:** Modify `packages/widget/test/widget.it.test.ts`.

- [ ] **Step 1: Extend the scripted server** with a `/api/chat/sessions` branch returning two canned rows (one `origin:'conciv'`, one `'external'`, distinct titles) and a `/api/chat/sessions/title` 200, and per-session `/api/chat/history` keyed by the `conciv-session-id` header.
- [ ] **Step 2: Write the IT (`browser.newPage()`):** open modal → selector shows both rows; the `origin:'conciv'` row shows the marker, the `external` one does not; click a row → a `/history` fetch fires with the new header and the thread swaps; "+ New session" → greeting + divider; rename → optimistic title shows; Tab from trigger→search→rename→rows never leaves the dialog; two mounted selectors don't share an `aria-controls` id. `page.close()`.
- [ ] **Step 3: Run the red step first** (against the pre-selector bundle the new assertions must fail), then implement-side already done → run green.

Run: `pnpm --filter @conciv/widget exec vitest run test/widget.it.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/test
git commit -m "test(widget): session selector browser IT (render/switch/new/rename/origin/focus)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task B13: Full gate

- [ ] **Step 1:** `pnpm turbo typecheck build test` → PASS across all packages.
- [ ] **Step 2: Manual smoke** — on a repo with several Claude sessions: modal selector lists them with origin markers (conciv vs terminal), recency groups; switch loads history; rename persists across reload; split a qt pane onto a different session → both stream in parallel (no 409); generative-UI (`conciv ui`) from a qt pane renders in the right pane; reduced-motion honored.
- [ ] **Step 3: Final commit (if smoke fixes)**

```bash
git add -A
git commit -m "chore: multi-session + selector — build/typecheck/test green

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** list (B2/B5/B7/B8), origin marker (B5 join + B8 row), switch (B10/B11), new (B10/B11), rename (B3/B5/B6/B8), per-session concurrency + canonical id (A6/A17/A18/A19), `sessionId` validation + path containment (B2/B5), discovered-session seed (A6), shared cache + invalidation + surface union (B7/B10/B11), a11y/animation/states (B8/B9/B10 against §5.5/§6/§7), tests (A17/A18/B2/B3/B4/B5/B12). Foundation scaffolding (header transport, lock, popover, label, localStorage) = referenced Phase A tasks 1–5/7–16.
- **Canonical-id consistency:** lock + uiBus + usage all keyed by header id (A6/A17/A18); list joins via the `previewId` map (B5); `conciv ui` routes by the env-injected header id (A17); `origin` = key≠value (B5). No uuid/token split remains.
- **Type consistency:** `HarnessSessionMeta`/`listSessions` (B1/B2); `ChatSessionMeta`/`ChatSessions`/`SessionId`/`RenameSessionSchema` (B1) used in B5/B6/B7/B8; `readLocks` (B4)→B5; `readTitle`/`writeTitle` (B3)→B5; `sessions()`/`status`/`mergeSurface`/`invalidateSessions`/`applyTitle` (B7)→B8/B10/B11; `sessions()`/`renameSession()` (B6)→B7/B8.
- **Verified externals:** `useListCollection` `initialItems` is read once; update via `set()` + re-`filter()` (checked against `@ark-ui/solid@5.37.1` source) — B8 Step 1.
- **Adaptation points (not placeholders):** B5/B12 test-server helpers (`getSessions`, `claudeHome` forwarding, header-aware `post`/`postChat`) extend the foundation's Task 7 helpers — read those first. B8's exhaustive body is specified by spec §5.2/§5.5/§6/§7. The A17 spawn-env change touches whatever module builds `childEnv` (search `CONCIV_PORT`).
- **Dependency:** Phase A precedes Phase B; B-tasks assume header transport, per-session map/lock, `Popover`, `SessionInfoCard`, and per-pane `sessionId` from Phase A.
