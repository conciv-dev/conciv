# Multi-session quick terminal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each quick-terminal pane a real, independent agent session — true parallel runs, per-session history, restore on reload — and expose a per-session label + Floating UI popover.

**Architecture:** Identity is a client-minted session id sent in an `mandarax-session-id` header. The server keys its session state, lock, and persisted resume-token map by that id; pane layout lives in the client's `localStorage`. The harness contract is unchanged (new session = spawn with `resumeSessionId: null`). A reusable Floating UI `Popover` surfaces the session name / harness id / source.

**Tech Stack:** TypeScript, Solid (widget), h3 + srvx (core), Zod, Vitest (unit + core IT), Playwright (widget IT), `@floating-ui/dom`.

**Spec:** `docs/superpowers/specs/2026-06-15-multi-session-quick-terminal-design.md`

**Conventions (from repo memory):** functions not classes; no IIFEs; one-line comments; build/typecheck via turbo (`pnpm turbo build` / `pnpm turbo typecheck`); no jsdom — widget UI is tested in a real browser; widget ITs use `browser.newPage()` not `newContext()`.

---

## File map

**Protocol** (`packages/protocol/src/`)

- `chat-types.ts` (modify) — add `MANDARAX_SESSION_HEADER` + `DEFAULT_SESSION_ID` constants; add `harnessId` + `name` to `ChatSessionSchema`; drop `sessionId` from `ChatRequestSchema`.
- `harness-types.ts` (modify) — add optional `nameFromTranscript?(raw): string | null` to `HarnessHistory`.

**Harness** (`packages/harness/src/`)

- `claude/history.ts` (modify) — implement `nameFromTranscript` (reads `summary` records).

**Core** (`packages/core/src/`)

- `state-paths.ts` (modify) — `lock: string` → `lockFor: (sessionId) => string`.
- `store/lock.ts` (modify) — all fns take `sessionId`; path `agent.<sessionId>.lock`.
- `store/session-store.ts` (modify) — reshape to `previewId → {sessionId: harnessToken}`; `readSessions` / `writeSession` / `removeSession`.
- `api/chat/session-id.ts` (create) — `sessionIdFromHeaders(headers)` helper.
- `api/chat/chat.ts` (modify) — `Map<sessionId, SessionState>` + `sessionFor` helper; pass to route groups.
- `api/chat/session.ts` (modify) — header-based `/session` (+ `harnessId`/`name`), `/history`, `DELETE /session`, `/stop`.
- `api/chat/turn.ts` (modify) — per-session lock + header + resume from map.

**Widget** (`packages/widget/src/`)

- `package.json` (modify) — add `@floating-ui/dom` dependency.
- `chat-api.ts` (modify) — header on all requests; `history()` drops its arg; add `sessionHeaders` + `deleteSession`.
- `popover.tsx` (create) — reusable Floating UI popover primitive.
- `session-info.tsx` (create) — popover content (name / copyable harness id / source).
- `chat-panel.tsx` (modify) — `sessionId` + `onSessionLabel` props; header on SSE; report label.
- `widget-shell.tsx` (modify) — `PanelContext.sessionId` + `onSessionLabel`; modal header label + popover; `chatPanelDef` pass-through.
- `quick-terminal.tsx` (modify) — mint session id per pane; restore from `localStorage`; pane-bar label + popover.

**Tests**

- `packages/harness/test/claude-history.test.ts` (create or extend) — `nameFromTranscript`.
- `packages/core/test/store/lock.test.ts` (create) — per-session lock isolation.
- `packages/core/test/store/session-store.test.ts` (create) — read/write/remove.
- `packages/core/test/api/chat/chat.it.test.ts` (modify) — header, parallel sessions, per-session resume.
- `packages/core/test/fixtures/fake-claude.ts` (modify) — emit a `summary` record.
- `packages/widget/test/widget.it.test.ts` (modify) — multi-pane browser IT.

---

## Task 1: Protocol constants + schema changes

**Files:**

- Modify: `packages/protocol/src/chat-types.ts`
- Modify: `packages/protocol/src/harness-types.ts`

- [ ] **Step 1: Add the header constant + reshape schemas in `chat-types.ts`**

Add near the top (after the imports), and edit the two schemas:

```ts
// The HTTP header carrying our client-minted session id on every chat request.
export const MANDARAX_SESSION_HEADER = 'mandarax-session-id'
// The session a request falls back to when it sends no header (the modal + the probe).
export const DEFAULT_SESSION_ID = 'default'
```

Change `ChatRequestSchema` to drop `sessionId` (identity now lives only in the header):

```ts
// POST /api/chat body — identity travels in the MANDARAX_SESSION_HEADER, not the body.
export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema),
})
```

Change `ChatSessionSchema` to add `harnessId` (display-only resume token) and `name`:

```ts
// GET /api/chat/session response.
export const ChatSessionSchema = z.object({
  sessionId: z.string(),
  harnessId: z.string().nullable(),
  name: z.string().nullable(),
  source: z.enum(['agent', 'chat', 'new']),
  cwd: z.string(),
  lock: z.object({held: z.boolean(), role: z.enum(['iterate', 'chat']).nullable()}),
})
```

- [ ] **Step 2: Add the optional name hook in `harness-types.ts`**

Edit the `HarnessHistory` type:

```ts
// Where a harness persists a session's transcript, and how to parse it into UIMessages.
export type HarnessHistory = {
  transcriptPath(cwd: string, sessionId: string): string
  parse(raw: string): UIMessage[]
  // Optional human-readable session name derived from the transcript (e.g. claude's `summary`
  // record). Harnesses that omit it fall back to a short id in the UI.
  nameFromTranscript?(raw: string): string | null
}
```

- [ ] **Step 3: Typecheck the protocol package**

Run: `pnpm turbo typecheck --filter=@mandarax/protocol`
Expected: PASS (no consumers compiled yet against the new shape; core/widget break in later tasks where we fix them).

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/src/chat-types.ts packages/protocol/src/harness-types.ts
git commit -m "feat(protocol): session header constant + harnessId/name on ChatSession"
```

---

## Task 2: claude `nameFromTranscript`

Claude writes one or more `{"type":"summary","summary":"<title>"}` records into its JSONL transcript. We read the last one as the session name.

**Files:**

- Modify: `packages/harness/src/claude/history.ts`
- Test: `packages/harness/test/claude-history.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/harness/test/claude-history.test.ts`:

```ts
import {describe, it, expect} from 'vitest'
import {claudeHistory} from '../src/claude/history.js'

describe('claudeHistory.nameFromTranscript', () => {
  it('returns the last summary record', () => {
    const jsonl = [
      JSON.stringify({type: 'summary', summary: 'First guess'}),
      JSON.stringify({type: 'user', message: {content: 'hi'}}),
      JSON.stringify({type: 'summary', summary: 'Fix the checkout layout bug'}),
    ].join('\n')
    expect(claudeHistory.nameFromTranscript?.(jsonl)).toBe('Fix the checkout layout bug')
  })

  it('returns null when there is no summary', () => {
    const jsonl = JSON.stringify({type: 'user', message: {content: 'hi'}})
    expect(claudeHistory.nameFromTranscript?.(jsonl)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @mandarax/harness exec vitest run test/claude-history.test.ts`
Expected: FAIL — `nameFromTranscript` is `undefined`.

- [ ] **Step 3: Implement `nameFromTranscript` in `history.ts`**

Add a Zod schema + function, and attach it to `claudeHistory`:

```ts
const SummaryRecordSchema = z.object({type: z.literal('summary'), summary: z.string()}).loose()

// The last `summary` record claude wrote for this transcript, or null if none.
export function nameFromTranscript(jsonl: string): string | null {
  let name: string | null = null
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = SummaryRecordSchema.safeParse(JSON.parse(trimmed))
      if (parsed.success && parsed.data.summary) name = parsed.data.summary
    } catch {
      // not JSON — skip
    }
  }
  return name
}
```

Then change the exported object:

```ts
// Claude's HarnessHistory implementation.
export const claudeHistory: HarnessHistory = {transcriptPath, parse: parseHistory, nameFromTranscript}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @mandarax/harness exec vitest run test/claude-history.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add packages/harness/src/claude/history.ts packages/harness/test/claude-history.test.ts
git commit -m "feat(harness): claude nameFromTranscript reads summary records"
```

---

## Task 3: Per-session lock

**Files:**

- Modify: `packages/core/src/state-paths.ts`
- Modify: `packages/core/src/store/lock.ts`
- Test: `packages/core/test/store/lock.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/store/lock.test.ts`:

```ts
import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {acquireLock, readLock, releaseLock} from '../../src/store/lock.js'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'mandarax-lock-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
})

describe('per-session lock', () => {
  it('locks are independent per session id', () => {
    const root = tmp()
    expect(acquireLock(root, 'sess-a', 'chat', process.pid)).toBe(true)
    expect(readLock(root, 'sess-a').held).toBe(true)
    // A different session is unaffected.
    expect(readLock(root, 'sess-b').held).toBe(false)
    expect(acquireLock(root, 'sess-b', 'chat', process.pid)).toBe(true)
    releaseLock(root, 'sess-a')
    expect(readLock(root, 'sess-a').held).toBe(false)
    expect(readLock(root, 'sess-b').held).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @mandarax/core exec vitest run test/store/lock.test.ts`
Expected: FAIL — `acquireLock`/`readLock`/`releaseLock` don't take a session id yet (type error / wrong path).

- [ ] **Step 3: Change `state-paths.ts` to a per-session lock path**

Replace the `lock` field with a function:

```ts
import {join} from 'node:path'

// The `.mandarax/` layout under the state root, named in one place.
export type StatePaths = {dir: string; lockFor: (sessionId: string) => string; sessions: string; systemPrompt: string}

export function statePaths(stateRoot: string): StatePaths {
  const dir = join(stateRoot, '.mandarax')
  return {
    dir,
    lockFor: (sessionId) => join(dir, `agent.${sessionId}.lock`),
    sessions: join(dir, 'chat-sessions.json'),
    systemPrompt: join(dir, 'chat-system-prompt.txt'),
  }
}
```

- [ ] **Step 4: Thread `sessionId` through `lock.ts`**

Edit the three exported functions (the `pidAlive` helper is unchanged):

```ts
export function readLock(stateRoot: string, sessionId: string): LockState {
  const parsed = readJson(statePaths(stateRoot).lockFor(sessionId), LockFileSchema, {})
  if (typeof parsed.pid !== 'number' || !pidAlive(parsed.pid)) return {held: false, role: null, pid: null}
  return {held: true, role: parsed.role ?? null, pid: parsed.pid}
}

export function acquireLock(stateRoot: string, sessionId: string, role: LockRole, pid: number): boolean {
  if (readLock(stateRoot, sessionId).held) return false
  writeJson(statePaths(stateRoot).lockFor(sessionId), {role, pid, startedTs: Date.now()})
  return true
}

export function releaseLock(stateRoot: string, sessionId: string): void {
  try {
    rmSync(statePaths(stateRoot).lockFor(sessionId))
  } catch {
    // already gone
  }
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm --filter @mandarax/core exec vitest run test/store/lock.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit** (callers still broken — fixed in Task 6; commit the store layer now)

```bash
git add packages/core/src/state-paths.ts packages/core/src/store/lock.ts packages/core/test/store/lock.test.ts
git commit -m "feat(core): per-session agent lock keyed by session id"
```

---

## Task 4: Session store reshape

**Files:**

- Modify: `packages/core/src/store/session-store.ts`
- Test: `packages/core/test/store/session-store.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/store/session-store.test.ts`:

```ts
import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readSessions, writeSession, removeSession} from '../../src/store/session-store.js'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'mandarax-sess-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
})

describe('session store', () => {
  it('writes, reads, and removes per-preview session tokens', () => {
    const root = tmp()
    expect(readSessions(root, 'p1')).toEqual({})
    writeSession(root, 'p1', 'sess-a', 'claude-1')
    writeSession(root, 'p1', 'sess-b', 'claude-2')
    writeSession(root, 'p2', 'sess-a', 'claude-9')
    expect(readSessions(root, 'p1')).toEqual({'sess-a': 'claude-1', 'sess-b': 'claude-2'})
    expect(readSessions(root, 'p2')).toEqual({'sess-a': 'claude-9'})
    removeSession(root, 'p1', 'sess-a')
    expect(readSessions(root, 'p1')).toEqual({'sess-b': 'claude-2'})
  })

  it('ignores empty preview/session/token', () => {
    const root = tmp()
    writeSession(root, '', 'sess-a', 'claude-1')
    writeSession(root, 'p1', 'sess-a', '')
    expect(readSessions(root, 'p1')).toEqual({})
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @mandarax/core exec vitest run test/store/session-store.test.ts`
Expected: FAIL — `readSessions`/`removeSession` don't exist; `writeSession` has the old signature.

- [ ] **Step 3: Rewrite `session-store.ts`**

Replace the whole file body below the header comment:

```ts
import {z} from 'zod'
import {readJson, writeJson} from '../fs.js'
import {statePaths} from '../state-paths.js'

// Persists each chat session's harness resume token, keyed previewId → { ourSessionId:
// harnessToken }, so a session reopens across page reloads and dev-server restarts. Pane
// layout (which sessions, in what order) is client-side localStorage, not here.

const SessionMapSchema = z.record(z.string(), z.string())
const PreviewMapSchema = z.record(z.string(), SessionMapSchema)

function readAll(stateRoot: string): Record<string, Record<string, string>> {
  return readJson(statePaths(stateRoot).sessions, PreviewMapSchema, {})
}

// All { ourSessionId: harnessToken } for this preview, or {} if none recorded yet.
export function readSessions(stateRoot: string, previewId: string): Record<string, string> {
  if (!previewId) return {}
  return readAll(stateRoot)[previewId] ?? {}
}

// Upsert one session's harness token. No-op without all three values.
export function writeSession(stateRoot: string, previewId: string, sessionId: string, harnessToken: string): void {
  if (!previewId || !sessionId || !harnessToken) return
  const all = readAll(stateRoot)
  all[previewId] = {...(all[previewId] ?? {}), [sessionId]: harnessToken}
  writeJson(statePaths(stateRoot).sessions, all)
}

// Drop one session from a preview (called when a pane closes).
export function removeSession(stateRoot: string, previewId: string, sessionId: string): void {
  if (!previewId || !sessionId) return
  const all = readAll(stateRoot)
  const map = all[previewId]
  if (!map || !(sessionId in map)) return
  delete map[sessionId]
  all[previewId] = map
  writeJson(statePaths(stateRoot).sessions, all)
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @mandarax/core exec vitest run test/store/session-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/store/session-store.ts packages/core/test/store/session-store.test.ts
git commit -m "feat(core): session store keyed by previewId -> sessionId -> harness token"
```

---

## Task 5: `sessionIdFromHeaders` helper

**Files:**

- Create: `packages/core/src/api/chat/session-id.ts`
- Test: `packages/core/test/api/chat/session-id.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/api/chat/session-id.test.ts`:

```ts
import {describe, it, expect} from 'vitest'
import {sessionIdFromHeaders} from '../../../src/api/chat/session-id.js'
import {DEFAULT_SESSION_ID} from '@mandarax/protocol/chat-types'

describe('sessionIdFromHeaders', () => {
  it('returns the header value when present', () => {
    expect(sessionIdFromHeaders(new Headers({'mandarax-session-id': 'sess-a'}))).toBe('sess-a')
  })
  it('falls back to the default when absent or blank', () => {
    expect(sessionIdFromHeaders(new Headers())).toBe(DEFAULT_SESSION_ID)
    expect(sessionIdFromHeaders(new Headers({'mandarax-session-id': '  '}))).toBe(DEFAULT_SESSION_ID)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @mandarax/core exec vitest run test/api/chat/session-id.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `session-id.ts`**

```ts
import {MANDARAX_SESSION_HEADER, DEFAULT_SESSION_ID} from '@mandarax/protocol/chat-types'

// The session id a request targets: the MANDARAX_SESSION_HEADER value, or the default session.
export function sessionIdFromHeaders(headers: Headers): string {
  const raw = headers.get(MANDARAX_SESSION_HEADER)?.trim()
  return raw || DEFAULT_SESSION_ID
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @mandarax/core exec vitest run test/api/chat/session-id.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/api/chat/session-id.ts packages/core/test/api/chat/session-id.test.ts
git commit -m "feat(core): sessionIdFromHeaders helper"
```

---

## Task 6: Wire the chat routes to per-session state

This is the core change: `chat.ts` holds the `Map`, `session.ts` and `turn.ts` resolve the session id from the header.

**Files:**

- Modify: `packages/core/src/api/chat/chat.ts`
- Modify: `packages/core/src/api/chat/session.ts`
- Modify: `packages/core/src/api/chat/turn.ts`
- Modify: `packages/core/test/api/chat/chat.it.test.ts` (the 409 test)

- [ ] **Step 1: Rewrite `chat.ts` — the session map + `sessionFor`**

```ts
import type {H3} from 'h3'
import type {HarnessAdapter} from '@mandarax/protocol/harness-types'
import {DEFAULT_SESSION_ID} from '@mandarax/protocol/chat-types'
import type {UiBus} from '../../runtime/ui-bus.js'
import {readSessions} from '../../store/session-store.js'
import {makePermissionGate, registerPermissionRoutes} from './permission.js'
import {registerSessionRoutes, type SessionState, type SessionLookup} from './session.js'
import {registerTurnRoutes, type SpawnHarness} from './turn.js'

export type {SpawnHarness} from './turn.js'

export type ChatRouteOpts = {
  cwd: string
  stateRoot: string
  previewId: string
  initialSessionId: string
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  systemPromptFile?: string
  systemPromptText?: string
  uiBus: UiBus
}

// Wire the chat HTTP surface — composition only; behaviour lives in permission/session/turn.
export function registerChatRoutes(app: H3, opts: ChatRouteOpts): void {
  const uiBus = opts.uiBus
  const gate = makePermissionGate(uiBus)

  // One SessionState per OUR session id, created lazily. The default session adopts the agent
  // hand-off (initialSessionId); every session seeds its token from the persisted map.
  const sessions = new Map<string, SessionState>()
  const sessionFor: SessionLookup = (sessionId) => {
    let s = sessions.get(sessionId)
    if (!s) {
      const stored = readSessions(opts.stateRoot, opts.previewId)[sessionId] ?? ''
      const seed = sessionId === DEFAULT_SESSION_ID ? opts.initialSessionId || stored : stored
      s = {harnessSessionId: seed}
      sessions.set(sessionId, s)
    }
    return s
  }

  registerPermissionRoutes(app, gate, opts.harness.capabilities.permissionGate === 'hook')
  registerSessionRoutes(app, {
    cwd: opts.cwd,
    stateRoot: opts.stateRoot,
    previewId: opts.previewId,
    initialSessionId: opts.initialSessionId,
    harness: opts.harness,
    sessionFor,
  })
  registerTurnRoutes(app, {
    cwd: opts.cwd,
    stateRoot: opts.stateRoot,
    previewId: opts.previewId,
    harness: opts.harness,
    spawnHarness: opts.spawnHarness,
    systemPromptFile: opts.systemPromptFile,
    systemPromptText: opts.systemPromptText,
    uiBus,
    sessionFor,
  })
}
```

- [ ] **Step 2: Rewrite `session.ts` — header-based reads + DELETE + name/harnessId**

```ts
import {type H3} from 'h3'
import type {HarnessAdapter} from '@mandarax/protocol/harness-types'
import type {ChatSession} from '@mandarax/protocol/chat-types'
import {DEFAULT_SESSION_ID} from '@mandarax/protocol/chat-types'
import {readLock} from '../../store/lock.js'
import {removeSession} from '../../store/session-store.js'
import {readFileOrEmpty} from '../../fs.js'
import {sessionIdFromHeaders} from './session-id.js'

// Mutable per-session holder, created by chat.ts's sessionFor and shared with the turn route.
export type SessionState = {harnessSessionId: string}
export type SessionLookup = (sessionId: string) => SessionState

export type SessionRouteDeps = {
  cwd: string
  stateRoot: string
  previewId: string
  initialSessionId: string
  harness: HarnessAdapter
  sessionFor: SessionLookup
}

// The harness session name from its transcript, or null (no token / no name hook / no file).
function nameFor(deps: SessionRouteDeps, token: string): string | null {
  const hist = deps.harness.history
  if (!token || !hist?.nameFromTranscript) return null
  const raw = readFileOrEmpty(hist.transcriptPath(deps.cwd, token))
  return raw ? hist.nameFromTranscript(raw) : null
}

//   GET    /api/chat/session  → which session + harness id/name + lock state
//   DELETE /api/chat/session  → forget a session (pane closed): kill + drop its token
//   GET    /api/chat/history  → prior turns for the header session (transcript harnesses)
//   POST   /api/chat/stop     → SIGTERM the header session's lock holder
export function registerSessionRoutes(app: H3, deps: SessionRouteDeps): void {
  app.get('/api/chat/session', (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    const token = deps.sessionFor(sessionId).harnessSessionId
    const lock = readLock(deps.stateRoot, sessionId)
    const adopted = sessionId === DEFAULT_SESSION_ID && Boolean(deps.initialSessionId)
    const source: ChatSession['source'] = token ? (adopted ? 'agent' : 'chat') : 'new'
    const body: ChatSession = {
      sessionId,
      harnessId: token || null,
      name: nameFor(deps, token),
      source,
      cwd: deps.cwd,
      lock: {held: lock.held, role: lock.role},
    }
    return body
  })

  app.delete('/api/chat/session', (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    const lock = readLock(deps.stateRoot, sessionId)
    if (lock.pid) {
      try {
        process.kill(lock.pid, 'SIGTERM')
      } catch {
        // already gone
      }
    }
    removeSession(deps.stateRoot, deps.previewId, sessionId)
    return {ok: true}
  })

  app.get('/api/chat/history', (event) => {
    if (!deps.harness.capabilities.transcriptHistory || !deps.harness.history) return []
    const sessionId = sessionIdFromHeaders(event.req.headers)
    const token = deps.sessionFor(sessionId).harnessSessionId
    if (!token) return []
    const jsonl = readFileOrEmpty(deps.harness.history.transcriptPath(deps.cwd, token))
    return jsonl ? deps.harness.history.parse(jsonl) : []
  })

  app.post('/api/chat/stop', (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    const lock = readLock(deps.stateRoot, sessionId)
    if (lock.pid) {
      try {
        process.kill(lock.pid, 'SIGTERM')
      } catch {
        // already gone
      }
    }
    return {ok: true}
  })
}
```

- [ ] **Step 3: Rewrite `turn.ts` — header session id, per-session lock + resume**

```ts
import {type H3, HTTPError, readValidatedBody} from 'h3'
import {chat, toServerSentEventsStream, type StreamChunk} from '@tanstack/ai'
import {harnessText} from '@mandarax/harness'
import type {HarnessAdapter, HarnessChild} from '@mandarax/protocol/harness-types'
import {UiSpecSchema} from '@mandarax/protocol/ui-types'
import {ChatRequestSchema} from '@mandarax/protocol/chat-types'
import {acquireLock, readLock, releaseLock} from '../../store/lock.js'
import {writeSession} from '../../store/session-store.js'
import type {UiBus} from '../../runtime/ui-bus.js'
import {toChatMessages} from './messages.js'
import type {SessionLookup} from './session.js'
import {sessionIdFromHeaders} from './session-id.js'
import {sseHeaders} from '../sse.js'

export type SpawnHarness = (args: string[], cwd: string) => HarnessChild

export type TurnDeps = {
  cwd: string
  stateRoot: string
  previewId: string
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  systemPromptFile?: string
  systemPromptText?: string
  uiBus: UiBus
  sessionFor: SessionLookup
}

// The live-turn routes, both uiBus consumers:
//   POST /api/chat/ui → inject agent generative UI onto the live turn (non-blocking)
//   POST /api/chat    → stream a turn (409 if that session's lock is held)
export function registerTurnRoutes(app: H3, deps: TurnDeps): void {
  const {harness, uiBus} = deps

  app.post('/api/chat/ui', async (event) => {
    const spec = await readValidatedBody(event, UiSpecSchema)
    return {renderId: spec.renderId, injected: uiBus.inject(spec)}
  })

  app.post('/api/chat', async (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    if (readLock(deps.stateRoot, sessionId).held) throw new HTTPError({status: 409, message: 'agent busy'})
    const chatReq = await readValidatedBody(event, ChatRequestSchema)
    const session = deps.sessionFor(sessionId)
    const resumeSessionId = harness.capabilities.resume ? session.harnessSessionId || null : null
    const origin = `http://${event.req.headers.get('host') ?? '127.0.0.1:3000'}`
    const mode = harness.capabilities.systemPrompt
    const sysText = mode === 'file' ? (deps.systemPromptFile ?? '') : (deps.systemPromptText ?? '')
    const abort = new AbortController()

    const adapter = harnessText(harness, {
      cwd: deps.cwd,
      spawnHarness: deps.spawnHarness,
      systemPrompt: sysText,
      resumeSessionId,
      permissionUrl: harness.capabilities.permissionGate === 'hook' ? `${origin}/api/chat/permission` : undefined,
      mcpUrl: harness.capabilities.mcp === 'http' ? `${origin}/api/mcp` : undefined,
      onSessionId: (id) => {
        session.harnessSessionId = id
        writeSession(deps.stateRoot, deps.previewId, sessionId, id)
      },
      onSpawn: (child) => {
        acquireLock(deps.stateRoot, sessionId, 'chat', child.pid)
        event.req.signal.addEventListener('abort', () => {
          abort.abort()
          child.kill()
        })
      },
    })

    const stream = chat({
      adapter,
      messages: toChatMessages(chatReq),
      systemPrompts: sysText ? [sysText] : [],
      abortController: abort,
    })
    const merged = uiBus.run(stream)
    const sse = toServerSentEventsStream(withLockRelease(merged, deps.stateRoot, sessionId), abort)
    return new Response(sse, {status: 200, headers: sseHeaders(event)})
  })
}

// Release the session's lock when its merged stream finishes OR the client disconnects.
async function* withLockRelease(
  src: AsyncIterable<StreamChunk>,
  stateRoot: string,
  sessionId: string,
): AsyncGenerator<StreamChunk> {
  try {
    for await (const c of src) yield c
  } finally {
    releaseLock(stateRoot, sessionId)
  }
}
```

> Note: `toChatMessages(chatReq)` no longer receives a `sessionId` field on `chatReq` — confirm `messages.ts` only reads `chatReq.messages` (it does). No change needed there.

- [ ] **Step 4: Update the 409 test in `chat.it.test.ts`**

The lock is now per-session. Change the busy-state test (around line 115-122) to acquire the default session's lock:

```ts
it('refuses with 409 while the lock is held by iterate', async () => {
  const stateRoot = tmp()
  const server = await startTestServer({stateRoot, spawnHarness: fakeSpawn()})
  state.server = server
  acquireLock(stateRoot, DEFAULT_SESSION_ID, 'iterate', process.pid)
  const res = await server.post('/api/chat', {messages: []})
  expect(res.status).toBe(409)
})
```

Add the import at the top of the test file:

```ts
import {DEFAULT_SESSION_ID} from '@mandarax/protocol/chat-types'
```

- [ ] **Step 5: Typecheck + run the core test suite**

Run: `pnpm turbo typecheck --filter=@mandarax/core`
Expected: PASS.
Run: `pnpm --filter @mandarax/core exec vitest run`
Expected: PASS — existing `--resume` test still green (single default session resumes `sess-fake`), 409 test green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/api/chat packages/core/test/api/chat/chat.it.test.ts
git commit -m "feat(core): per-session chat routes keyed by mandarax-session-id header"
```

---

## Task 7: Core IT — header isolates sessions + parallel resume

**Files:**

- Modify: `packages/core/test/helpers/server.ts` (let `post`/`postChat` send a session header)
- Modify: `packages/core/test/api/chat/chat.it.test.ts`

- [ ] **Step 1: Extend the test server helper to send a session header**

In `server.ts`, change `post` and `postChat` to accept an optional session id, and add a `getSession` helper:

```ts
const post = (path: string, body: unknown, sessionId?: string): Promise<Response> =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {'content-type': 'application/json', ...(sessionId ? {'mandarax-session-id': sessionId} : {})},
    body: JSON.stringify(body),
  })
const postChat = async (message: unknown, sessionId?: string): Promise<string> =>
  (await post('/api/chat', {messages: [message]}, sessionId)).text()
const getSession = async (sessionId?: string): Promise<Response> =>
  fetch(`${base}/api/chat/session`, {headers: sessionId ? {'mandarax-session-id': sessionId} : {}})
```

Update the `TestServer` type accordingly:

```ts
export type TestServer = {
  base: string
  stateRoot: string
  post: (path: string, body: unknown, sessionId?: string) => Promise<Response>
  postChat: (message: unknown, sessionId?: string) => Promise<string>
  getSession: (sessionId?: string) => Promise<Response>
  close: () => Promise<void>
}
```

And return `getSession` from `startTestServer`.

- [ ] **Step 2: Write the failing test — two sessions stay isolated**

Add to `chat.it.test.ts`:

```ts
it('keeps per-session resume independent under distinct headers', async () => {
  const server = await startTestServer({spawnHarness: fakeSpawn()})
  state.server = server
  await server.postChat(turn('hi'), 'sess-a')
  // sess-b is a fresh session: its /session reports source 'new' before any turn.
  const beforeB = ChatSessionSchema.parse(await (await server.getSession('sess-b')).json())
  expect(beforeB.source).toBe('new')
  expect(beforeB.harnessId).toBeNull()
  // sess-a already ran a turn → it has the fake harness token.
  const afterA = ChatSessionSchema.parse(await (await server.getSession('sess-a')).json())
  expect(afterA.harnessId).toBe('sess-fake')
  expect(afterA.source).toBe('chat')
})

it('does NOT 409 a second session while a different one would be busy', async () => {
  const stateRoot = tmp()
  const server = await startTestServer({stateRoot, spawnHarness: fakeSpawn()})
  state.server = server
  acquireLock(stateRoot, 'sess-a', 'chat', process.pid)
  const res = await server.post('/api/chat', {messages: []}, 'sess-b')
  expect(res.status).toBe(200)
})
```

Add the import:

```ts
import {ChatSessionSchema} from '@mandarax/protocol/chat-types'
```

- [ ] **Step 3: Run it**

Run: `pnpm --filter @mandarax/core exec vitest run test/api/chat/chat.it.test.ts`
Expected: PASS — proves header-scoped isolation + per-session lock (no cross-session 409).

- [ ] **Step 4: Commit**

```bash
git add packages/core/test
git commit -m "test(core): IT for header-scoped session isolation + parallel locks"
```

---

## Task 8: Add `@floating-ui/dom` to the widget

**Files:**

- Modify: `packages/widget/package.json`

- [ ] **Step 1: Add the dependency**

Add to `dependencies` in `packages/widget/package.json` (alphabetical placement near the top):

```json
"@floating-ui/dom": "^1.7.6",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: resolves `@floating-ui/dom@1.7.6` from the existing lockfile entry (no new download).

- [ ] **Step 3: Commit**

```bash
git add packages/widget/package.json pnpm-lock.yaml
git commit -m "chore(widget): add @floating-ui/dom dependency"
```

---

## Task 9: Reusable `Popover` component

A small Solid wrapper over `@floating-ui/dom`: positions a floating panel against an anchor, repositions with `autoUpdate`, closes on outside-click + Escape.

**Files:**

- Create: `packages/widget/src/popover.tsx`

- [ ] **Step 1: Create `popover.tsx`**

```tsx
import {createEffect, onCleanup, Show, type JSX} from 'solid-js'
import {computePosition, autoUpdate, offset, flip, shift, type Placement} from '@floating-ui/dom'

// A floating panel anchored to `anchor`, positioned with Floating UI. Closes on outside-click
// and Escape. Render it inside the widget's shadow container so styles stay scoped.
export function Popover(props: {
  anchor: HTMLElement | undefined
  open: () => boolean
  setOpen: (v: boolean) => void
  placement?: Placement
  children: JSX.Element
}): JSX.Element {
  let panel: HTMLDivElement | undefined

  // Position + keep positioned while open; tear down autoUpdate when closed/unmounted.
  createEffect(() => {
    const anchor = props.anchor
    if (!props.open() || !anchor || !panel) return
    const stop = autoUpdate(anchor, panel, () => {
      if (!panel) return
      void computePosition(anchor, panel, {
        placement: props.placement ?? 'bottom-start',
        middleware: [offset(6), flip(), shift({padding: 8})],
      }).then(({x, y}) => {
        if (panel) Object.assign(panel.style, {left: `${x}px`, top: `${y}px`})
      })
    })
    onCleanup(stop)
  })

  // Dismiss on outside pointerdown + Escape, only while open.
  createEffect(() => {
    if (!props.open()) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panel && !panel.contains(t) && props.anchor && !props.anchor.contains(t)) props.setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.setOpen(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    onCleanup(() => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    })
  })

  return (
    <Show when={props.open()}>
      <div
        class="pw-popover"
        role="dialog"
        ref={(el) => {
          panel = el
        }}
      >
        {props.children}
      </div>
    </Show>
  )
}
```

- [ ] **Step 2: Add popover styles**

Append to the widget's stylesheet (the same file that defines `pw-qt-*` / `pw-chat-*` — locate via `grep -rl "pw-qt-pane" packages/widget/src`):

```css
.pw-popover {
  position: absolute;
  z-index: 2147483647;
  min-width: 220px;
  max-width: 320px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--pw-surface, #1b1b1f);
  color: var(--pw-text, #e6e6e6);
  border: 1px solid var(--pw-border, #333);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
  font-size: 12px;
}
```

> If the project uses CSS-in-JS / a constants module instead of a `.css` file, follow that pattern — match how `pw-qt` styles are declared in the same package.

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo typecheck --filter=@mandarax/widget`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/popover.tsx packages/widget/src
git commit -m "feat(widget): reusable Floating UI Popover component"
```

---

## Task 10: Session-info popover content

**Files:**

- Create: `packages/widget/src/session-info.tsx`

- [ ] **Step 1: Create `session-info.tsx`**

```tsx
import {createSignal, Show, type JSX} from 'solid-js'

export type SessionInfo = {name: string | null; harnessId: string | null; source: 'new' | 'chat' | 'agent'}

// The body of the session-info popover: name, copyable harness id, source.
export function SessionInfoCard(props: {info: SessionInfo}): JSX.Element {
  const [copied, setCopied] = createSignal(false)
  const copy = () => {
    const id = props.info.harnessId
    if (!id) return
    void navigator.clipboard.writeText(id).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <div class="pw-session-info">
      <div class="pw-session-info-name">{props.info.name ?? 'New session'}</div>
      <Show when={props.info.harnessId}>
        {(id) => (
          <div class="pw-session-info-row">
            <span class="pw-session-info-key">session</span>
            <code class="pw-session-info-id">{id()}</code>
            <button type="button" class="pw-session-info-copy" aria-label="Copy session id" onClick={copy}>
              {copied() ? 'copied' : 'copy'}
            </button>
          </div>
        )}
      </Show>
      <div class="pw-session-info-row">
        <span class="pw-session-info-key">source</span>
        <span class="pw-session-info-val">{props.info.source}</span>
      </div>
    </div>
  )
}

// The resolved one-line label for a surface (pane bar / modal subtitle).
export function sessionLabel(info: {name: string | null; harnessId: string | null}): string {
  if (info.name) return info.name
  if (info.harnessId) return info.harnessId.slice(0, 8)
  return 'New session'
}
```

- [ ] **Step 2: Add styles** (same stylesheet as Task 9)

```css
.pw-session-info-name {
  font-weight: 600;
  margin-bottom: 6px;
  word-break: break-word;
}
.pw-session-info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.pw-session-info-key {
  opacity: 0.6;
  width: 52px;
  flex: none;
}
.pw-session-info-id {
  font-family: ui-monospace, monospace;
  word-break: break-all;
}
.pw-session-info-copy {
  margin-left: auto;
  flex: none;
  cursor: pointer;
  background: none;
  border: 1px solid var(--pw-border, #333);
  border-radius: 4px;
  color: inherit;
  padding: 1px 6px;
  font-size: 11px;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo typecheck --filter=@mandarax/widget`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/session-info.tsx packages/widget/src
git commit -m "feat(widget): session-info popover content + label resolver"
```

---

## Task 11: `chat-api.ts` — session header on every request

**Files:**

- Modify: `packages/widget/src/chat-api.ts`

- [ ] **Step 1: Rewrite the `ChatApi` type + `createChatApi`**

```ts
import type {UIMessage} from '@tanstack/ai-client'
import {ChatSessionSchema, ChatHistorySchema, type ChatSession} from '@mandarax/protocol/chat-types'
import {MANDARAX_SESSION_HEADER} from '@mandarax/protocol/chat-types'

function metaContent(name: string): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

function resolveBase(apiBase?: string): string {
  return (apiBase ?? metaContent('pw-api-base')).replace(/\/+$/, '')
}

export async function probeChatAvailable(apiBase?: string): Promise<boolean> {
  const base = resolveBase(apiBase)
  try {
    const res = await fetch(`${base}/api/chat/session`, {credentials: 'include'})
    return res.ok
  } catch {
    return false
  }
}

export type ChatApi = {
  base: string
  chatUrl: string
  sessionHeaders: () => Record<string, string>
  session: () => Promise<ChatSession>
  history: () => Promise<UIMessage[]>
  deleteSession: () => Promise<Response>
  permissionDecision: (renderId: string, approved: boolean) => Promise<Response>
}

export function createChatApi(deps: {apiBase?: string; sessionId?: string} = {}): ChatApi {
  const base = resolveBase(deps.apiBase)
  const sessionHeaders = (): Record<string, string> =>
    deps.sessionId ? {[MANDARAX_SESSION_HEADER]: deps.sessionId} : {}
  return {
    base,
    chatUrl: `${base}/api/chat`,
    sessionHeaders,
    session: async () => {
      const res = await fetch(`${base}/api/chat/session`, {credentials: 'include', headers: sessionHeaders()})
      return ChatSessionSchema.parse(await res.json())
    },
    history: async () => {
      const res = await fetch(`${base}/api/chat/history`, {credentials: 'include', headers: sessionHeaders()})
      return ChatHistorySchema.parse(await res.json())
    },
    deleteSession: () =>
      fetch(`${base}/api/chat/session`, {method: 'DELETE', credentials: 'include', headers: sessionHeaders()}),
    permissionDecision: (renderId: string, approved: boolean) =>
      fetch(`${base}/api/chat/permission-decision`, {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json', ...sessionHeaders()},
        body: JSON.stringify({renderId, approved}),
      }),
  }
}
```

- [ ] **Step 2: Typecheck (expect ChatPanel to break — fixed next task)**

Run: `pnpm turbo typecheck --filter=@mandarax/widget`
Expected: FAIL in `chat-panel.tsx` (`api.history(session.sessionId)` now takes no arg, and `session.sessionId` is still valid). Note the errors; Task 12 fixes them.

- [ ] **Step 3: Commit**

```bash
git add packages/widget/src/chat-api.ts
git commit -m "feat(widget): chat-api sends mandarax-session-id header on all requests"
```

---

## Task 12: `ChatPanel` — session id, header on SSE, label reporting

**Files:**

- Modify: `packages/widget/src/chat-panel.tsx`

- [ ] **Step 1: Add the two new props**

Edit the `ChatPanel` props type:

```tsx
export function ChatPanel(props: {
  apiBase: string
  sessionId?: string
  active?: boolean
  onWorkingChange?: (working: boolean) => void
  onSessionLabel?: (label: {name: string | null; harnessId: string | null}) => void
  composerActions?: () => ComposerActionDef[]
}): JSX.Element {
```

- [ ] **Step 2: Pass the session id into the api + SSE connection**

Replace the `const api = ...` and `const chat = useChat(...)` lines:

```tsx
const api = createChatApi({apiBase: props.apiBase, sessionId: props.sessionId})
```

```tsx
const chat = useChat({
  ...createChatClientOptions({
    connection: fetchServerSentEvents(api.chatUrl, () => ({headers: api.sessionHeaders(), credentials: 'include'})),
  }),
  onCustomEvent: onMandaraxUi,
})
```

- [ ] **Step 3: Update `hydrate` to use the header + report the label**

Replace the `hydrate` function:

```tsx
const hydrate = async () => {
  if (hydrateState.done) return
  hydrateState.done = true
  try {
    const session = await api.session()
    props.onSessionLabel?.({name: session.name, harnessId: session.harnessId})
    if (session.source === 'new') return
    const prior = await api.history()
    if (prior.length > 0) chat.setMessages(prior)
  } catch {
    // No transcript / not resumable → start from the greeting.
  }
}
```

- [ ] **Step 4: Refresh the label when a turn finishes (the name first appears then)**

Add an effect after the existing `onWorkingChange` effect (a turn just ended → re-fetch the label):

```tsx
// When a turn finishes, the harness may have minted/renamed the session — refresh the label.
let wasWorking = false
createEffect(() => {
  const working = isThinking() || isStreaming()
  if (wasWorking && !working) {
    void api.session().then((s) => props.onSessionLabel?.({name: s.name, harnessId: s.harnessId}))
  }
  wasWorking = working
})
```

- [ ] **Step 5: Pass `sessionId` + `onSessionLabel` through `chatPanelDef`**

Edit the bottom of the file:

```tsx
export function chatPanelDef(apiBase: string): PanelDef {
  return {
    id: 'chat',
    title: 'mandarax',
    create: (ctx) => (
      <ChatPanel
        apiBase={apiBase}
        sessionId={ctx.sessionId?.()}
        active={ctx.active()}
        onWorkingChange={ctx.onWorkingChange}
        onSessionLabel={ctx.onSessionLabel}
        composerActions={ctx.composerActions}
      />
    ),
  }
}
```

- [ ] **Step 6: Typecheck (PanelContext members don't exist yet — fixed next task)**

Run: `pnpm turbo typecheck --filter=@mandarax/widget`
Expected: FAIL — `ctx.sessionId` / `ctx.onSessionLabel` not on `PanelContext`. Fixed in Task 13.

- [ ] **Step 7: Commit**

```bash
git add packages/widget/src/chat-panel.tsx
git commit -m "feat(widget): ChatPanel threads session id header + reports session label"
```

---

## Task 13: `PanelContext` additions + modal header label/popover

**Files:**

- Modify: `packages/widget/src/widget-shell.tsx`

- [ ] **Step 1: Extend `PanelContext`**

Add the two optional members to the `PanelContext` type:

```tsx
export type PanelContext = {
  active: () => boolean
  onWorkingChange: (working: boolean) => void
  onUsageChange: (usage: UsageSnapshot | null) => void
  // The pane's session id (quick-terminal panes mint one; the modal omits it → default session).
  sessionId?: () => string | undefined
  // The content reports its resolved session label (name + harness id) for the chrome to show.
  onSessionLabel?: (label: {name: string | null; harnessId: string | null}) => void
  composerActions: () => ComposerActionDef[]
}
```

- [ ] **Step 2: Wire the modal header to show the label + popover**

In `ModalLayout`, add label state and pass `onSessionLabel` to `props.panel.create`. Add near the other signals (`const [working, setWorking] = ...`):

```tsx
const [label, setLabel] = createSignal<{name: string | null; harnessId: string | null}>({name: null, harnessId: null})
const [infoOpen, setInfoOpen] = createSignal(false)
let labelEl: HTMLButtonElement | undefined
```

Update the `props.panel.create({...})` call to pass the callback (the modal sends no `sessionId` → default session):

```tsx
const content = props.panel.create({
  active: () => props.open(),
  onWorkingChange: setWorking,
  onUsageChange: setUsage,
  onSessionLabel: setLabel,
  composerActions: props.composerActions,
})
```

In the header JSX (next to `<span class="pw-chat-title">{props.panel.title}</span>`), add the clickable subtitle + popover. Import `Popover`, `SessionInfoCard`, `sessionLabel` at the top of the file:

```tsx
import {Popover} from './popover.js'
import {SessionInfoCard, sessionLabel} from './session-info.js'
```

```tsx
<button
  type="button"
  class="pw-chat-subtitle"
  ref={(el) => {
    labelEl = el
  }}
  onClick={() => setInfoOpen((v) => !v)}
>
  {sessionLabel(label())}
</button>
<Popover anchor={labelEl} open={infoOpen} setOpen={setInfoOpen} placement="bottom-start">
  <SessionInfoCard info={{name: label().name, harnessId: label().harnessId, source: label().harnessId ? 'chat' : 'new'}} />
</Popover>
```

- [ ] **Step 3: Typecheck the whole widget**

Run: `pnpm turbo typecheck --filter=@mandarax/widget`
Expected: PASS — `chat-panel.tsx` now matches `PanelContext`.

- [ ] **Step 4: Commit**

```bash
git add packages/widget/src/widget-shell.tsx
git commit -m "feat(widget): modal header session label + info popover"
```

---

## Task 14: Quick-terminal panes — mint, restore, pane-bar label/popover

**Files:**

- Modify: `packages/widget/src/quick-terminal.tsx`

- [ ] **Step 1: Add session-id minting + localStorage layout**

At the top of `QuickTerminalLayout`, add the panes-layout persistence next to the existing `FOCUS_KEY` block. Extend the `Pane` type to carry the session id + its reported label:

```tsx
import {createSignal} from 'solid-js'
import {Popover} from './popover.js'
import {SessionInfoCard, sessionLabel} from './session-info.js'

type PaneLabel = {name: string | null; harnessId: string | null}
type Pane = {
  id: number
  sessionId: string
  content: JSX.Element
  label: () => PaneLabel
  setLabel: (l: PaneLabel) => void
}
```

Add the layout store (near `FOCUS_KEY`):

```tsx
const PANES_KEY = 'mandarax-qt-panes'
const readPaneIds = (): string[] => {
  try {
    const raw = localStorage.getItem(PANES_KEY)
    const arr: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const writePaneIds = (ids: string[]) => {
  try {
    localStorage.setItem(PANES_KEY, JSON.stringify(ids))
  } catch {
    // storage unavailable — layout just won't persist
  }
}
```

- [ ] **Step 2: Mint a session id in `addPane`, persist layout, wire the label callback**

First add a `forgetSession` helper inside `QuickTerminalLayout` (closing a pane DELETEs its
server session so the resume-token map doesn't accumulate orphans; the modal's api owns its
own requests, so the quick terminal fires this fetch directly with the same header):

```tsx
const forgetSession = (sessionId: string) => {
  const base = (document.querySelector<HTMLMetaElement>('meta[name="pw-api-base"]')?.content ?? '').replace(/\/+$/, '')
  void fetch(`${base}/api/chat/session`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {'mandarax-session-id': sessionId},
  }).catch(() => {})
}
```

Then replace `addPane` and `closePane`:

```tsx
const addPane = (sessionId: string = crypto.randomUUID()) => {
  const id = ++seq
  const [label, setLabel] = createSignal<PaneLabel>({name: null, harnessId: null})
  const content = props.panel.create({
    active: () => props.open() && focused() === id,
    onWorkingChange: () => {},
    onSessionLabel: setLabel,
    sessionId: () => sessionId,
    composerActions: props.composerActions,
  })
  setPanes((ps) => [...ps, {id, sessionId, content, label, setLabel}])
  writePaneIds(panes().map((p) => p.sessionId))
  focusPane(id)
}

const closePane = (id: number) => {
  const target = panes().find((p) => p.id === id)
  const remaining = panes().filter((p) => p.id !== id)
  if (target) forgetSession(target.sessionId)
  writePaneIds(remaining.map((p) => p.sessionId))
  if (remaining.length === 0) {
    props.setOpen(false)
    return
  }
  const refocus = focused() === id
  setPanes(remaining)
  if (refocus) focusPane(remaining[remaining.length - 1]!.id)
  if (rowEl) for (const el of rowEl.querySelectorAll<HTMLElement>('.pw-qt-pane')) el.style.flex = ''
}
```

- [ ] **Step 3: Seed panes from the saved layout instead of always one fresh pane**

Replace the single `addPane()` seed call (currently around line 98) with:

```tsx
// Restore the saved pane layout (one pane per persisted session id); else seed one fresh pane.
const savedIds = readPaneIds()
if (savedIds.length > 0) for (const sid of savedIds) addPane(sid)
else addPane()
```

- [ ] **Step 4: Render the real label + popover in the pane bar**

Add popover open-state per pane. Simplest: a single signal keyed by pane id. Near the other signals:

```tsx
const [infoFor, setInfoFor] = createSignal<number | null>(null)
const anchors = new Map<number, HTMLButtonElement>()
```

Replace the pane name span (currently `<span class="pw-qt-pane-name">session-{pane.id}</span>`):

```tsx
<button
  type="button"
  class="pw-qt-pane-name"
  ref={(el) => anchors.set(pane.id, el)}
  onClick={(e) => {
    e.stopPropagation()
    setInfoFor((cur) => (cur === pane.id ? null : pane.id))
  }}
>
  {sessionLabel(pane.label())}
</button>
<Popover
  anchor={anchors.get(pane.id)}
  open={() => infoFor() === pane.id}
  setOpen={(v) => setInfoFor(v ? pane.id : null)}
  placement="bottom-start"
>
  <SessionInfoCard
    info={{name: pane.label().name, harnessId: pane.label().harnessId, source: pane.label().harnessId ? 'chat' : 'new'}}
  />
</Popover>
```

> `.pw-qt-pane-name` is now a `<button>` — ensure the existing CSS rule for it resets button chrome (`background: none; border: 0; color: inherit; cursor: pointer; font: inherit; padding: 0;`). Add those declarations to the existing `.pw-qt-pane-name` rule.

- [ ] **Step 5: Typecheck**

Run: `pnpm turbo typecheck --filter=@mandarax/widget`
Expected: PASS.

- [ ] **Step 6: Build the widget**

Run: `pnpm turbo build --filter=@mandarax/widget`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/widget/src/quick-terminal.tsx packages/widget/src
git commit -m "feat(widget): per-pane sessions, localStorage layout, pane-bar label + popover"
```

---

## Task 15: fake-claude summary fixture + widget multi-pane IT

**Files:**

- Modify: `packages/core/test/fixtures/fake-claude.ts`
- Modify: `packages/widget/test/widget.it.test.ts`

- [ ] **Step 1: Emit a `summary` record from fake-claude**

In `fake-claude.ts`, add a summary line to the emitted transcript stream (after the `init` system record), so `/session` reports a name. For both the plain and rich event arrays, insert:

```ts
{type: 'summary', summary: 'Fake session title'},
```

> This is what the live stream emits to the decoder. The decoder ignores `summary` (only `system`/`result` carry the session id), so existing decode tests are unaffected — verify by running `pnpm --filter @mandarax/harness exec vitest run` after the edit.

- [ ] **Step 2: Write the failing widget IT**

In `packages/widget/test/widget.it.test.ts`, add a multi-pane test. Use `browser.newPage()` (NOT `newContext()` — see repo memory). Mirror the existing test's harness/server setup in that file; the assertions:

```ts
it('runs two quick-terminal panes as independent parallel sessions', async () => {
  const page = await browser.newPage()
  await page.goto(harnessUrl) // however the existing IT boots the widget page

  // Open the quick terminal (the configured hotkey) and split into a second pane.
  await page.keyboard.press('Control+`') // match the configured QT binding in the test harness
  await page.locator('.pw-qt-open').waitFor()
  await page.getByRole('button', {name: 'Split pane'}).click()
  expect(await page.locator('.pw-qt-pane').count()).toBe(2)

  // Each pane has its own composer; send a message in pane 1 then pane 2 without waiting.
  const composers = page.locator('.pw-qt-pane .pw-chat-input')
  await composers.nth(0).fill('hello from pane one')
  await composers.nth(0).press('Enter')
  await composers.nth(1).fill('hello from pane two')
  await composers.nth(1).press('Enter')

  // Neither pane shows the 409 "agent busy" error — both stream.
  await expect(page.locator('.pw-chat-error')).toHaveCount(0)
  // Each pane bar shows a label; clicking it opens the session-info popover.
  await page.locator('.pw-qt-pane-name').nth(0).click()
  await page.locator('.pw-popover').waitFor()
  await expect(page.locator('.pw-session-info-name')).toBeVisible()

  await page.close()
})
```

> Adapt `harnessUrl`, the hotkey, and the fake-harness wiring to match the EXISTING widget IT in this file — read it first and copy its setup verbatim. The new assertions (two panes, no error, popover) are the only additions.

- [ ] **Step 3: Run the widget IT**

Run: `pnpm --filter @mandarax/widget exec vitest run test/widget.it.test.ts`
Expected: PASS — two panes stream in parallel, labels + popover render.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/fixtures/fake-claude.ts packages/widget/test/widget.it.test.ts
git commit -m "test: fake-claude summary record + multi-pane parallel-session widget IT"
```

---

## Task 16: Full build + typecheck gate

- [ ] **Step 1: Typecheck + build the whole workspace**

Run: `pnpm turbo typecheck build`
Expected: PASS across all packages.

- [ ] **Step 2: Run the full unit/IT suites**

Run: `pnpm turbo test`
Expected: PASS (core unit + IT, harness unit, widget IT).

- [ ] **Step 3: Manual smoke (optional but recommended)**

Boot the dev widget, open the quick terminal, split into two panes, send a message in each, confirm both stream simultaneously, each pane bar shows a distinct label, clicking a label opens the popover with a copyable id, and reloading restores both panes with their transcripts.

- [ ] **Step 4: Final commit (if any smoke fixes)**

```bash
git add -A
git commit -m "chore: multi-session quick terminal — build/typecheck/test green"
```

---

## Self-review notes

- **Spec coverage:** session header + default fallback (Tasks 1, 5, 11), per-session state map + seeding (Task 6), per-session lock + parallel (Tasks 3, 6, 7), session-store reshape (Task 4), `harnessId`/`name` on `/session` (Tasks 1, 6), optional `nameFromTranscript` (Task 2), label resolution name→short-id→New session (Task 10), Popover on Floating UI (Tasks 8, 9), session-info content name/copy-id/source (Task 10), label on both surfaces (Tasks 12, 13, 14), client localStorage layout + restore (Task 14), DELETE-on-close server cleanup (Tasks 6, 14), tests incl. parallel-no-409 + multi-pane browser IT (Tasks 7, 15). No `/panes` endpoint (client-owned layout) — matches the refined spec.
- **Type consistency:** `sessionFor`/`SessionLookup` and `SessionState` shared across `chat.ts`/`session.ts`/`turn.ts`; `acquireLock(stateRoot, sessionId, role, pid)` and `readLock/releaseLock(stateRoot, sessionId)` consistent across Tasks 3/6/7; `ChatApi.history()` (no arg) consistent across Tasks 11/12; `sessionLabel(info)` + `SessionInfo` shared across Tasks 10/12/14.
- **Known adaptation points (not placeholders):** Task 9/10 styling location depends on how the widget declares CSS (a `.css` file vs constants) — follow the existing `pw-qt`/`pw-chat` pattern. Task 15's widget IT must copy the existing test's boot/harness wiring (hotkey, fake harness, URL) — the file is the source of truth for that setup.
