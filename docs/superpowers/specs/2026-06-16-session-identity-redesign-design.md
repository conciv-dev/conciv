# Session identity redesign — one id, one store

Date: 2026-06-16
Status: design (no implementation yet)

## Problem

A chat session has **two identities** today, and the code treats them as interchangeable when they are not:

- **header id** — the `mandarax-session-id` we send (`'default'` or a client `crypto.randomUUID()`). Stable from t=0.
- **harness token** — the harness's own session id (`harnessId`). `null` until the first turn mints it; the session _list_ is keyed by it.

They coincide only when you switch to an existing row; for any mandarax-started session they diverge. A server-side map (`headerId → token`, `.mandarax/chat-sessions.json`) bridges them. Symptoms of the split:

- **Sessions don't persist / "+New" vanishes on refresh** — the active id was sometimes compared against a list keyed by the _other_ id space.
- **Usage is keyed inconsistently** — written by header id (`turn.ts`), read by token in `/sessions` → a session's usage silently fails to appear in the list.
- **Scattered, racy storage** — the map, titles, and usage live in three shared JSON files; parallel sessions read-modify-write the same file and can clobber each other.
- **`DEFAULT_SESSION_ID` special-case** — a third id representation that forces `=== 'default'` branching throughout.

## Core principle

> **Our id is the primary key for everything. The harness's id is an attribute of a session (`harnessSessionId`), passed to the harness _only_ for `--resume`. Nothing else ever keys off it.**

- Our id is `mandarax_<uuid>`. The `mandarax_` prefix makes "ours vs a raw harness id" decidable at a glance and in code.
- `harnessSessionId: null` means "new — has not run yet" (replaces the magic `'default'`).
- The harness still owns _its_ identity; we never force it (no `--session-id`). We adopt the id it mints.

## Data model

One **session record**, keyed by our id, is the single source of truth for durable session state:

```
SessionRecord {
  id: string                 // mandarax_<uuid> — primary key
  harnessSessionId: string | null  // resume token; null = never run
  harnessKind: string        // 'claude' | 'codex' ... — routes resume
  origin: 'chat' | 'agent' | 'external'
                             // chat = born in widget; agent = handed off via MANDARAX_SESSION_ID;
                             // external = discovered transcript, adopted on open
  title: string | null       // user override; null = derive from harness. Lives HERE — replaces session-titles-store.
  model: string | null       // last model used / selected
  usage: UsageSnapshot | null// last persisted usage
  cwd: string
  createdAt: number
  updatedAt: number
}
```

**Stored vs joined-at-read.** The record holds durable owned state. At list/read time we join it with:

- **harness-derived live data** (`harness.list()` / transcript parse): `derivedTitle`, `messageCount`, `updatedAt` (mtime), and the enrichment below.
- **lock state** (scan of per-id lock files): `running`.

**Harness enrichment (gather as much as we can).** Extend `HarnessSessionMeta` + claude transcript parsing to surface: model, cumulative token usage, last-message preview, first-event timestamp (true `createdAt`), git branch if present. These are joined at read time for the selector rows, and persisted onto the record at write points (turn end, adopt).

## Storage — adapter-agnostic, two swappable seams

The store is layered so callers never see the backend and the backend never sees the callers:

1. **Domain interface — `SessionStore`.** The only thing the rest of core imports. Methods speak `SessionRecord`, not storage primitives:
   ```
   SessionStore {
     create(record): Promise<SessionRecord>
     get(id): Promise<SessionRecord | null>
     update(id, patch): Promise<SessionRecord>
     delete(id): Promise<void>
     list(): Promise<SessionRecord[]>
   }
   ```
   No `getItem`/keys/driver/unstorage types ever leak past this seam.
2. **unstorage-backed implementation.** Maps domain ops onto unstorage (`getItem`/`setItem`/`removeItem`/`getKeys`). unstorage is itself **driver-agnostic**, so the backend swaps with a one-line driver change.
3. **Driver.** `fs` now; **memory** driver for core unit tests (no filesystem, fast, no leftover state); `sqlite`/`redis`/etc. later — none of which touches layers 1–2 or any caller.

Details:

- **Dependency:** unstorage (new, approved).
- **fs layout:** `.mandarax/sessions/<previewId>/mandarax_<uuid>.json`, key = our id, value = `SessionRecord`.
- **One file per session** → atomic per-session writes → the cross-session clobber race is gone by construction.
- **Replaces:** `store/session-store.ts` (the map), `store/session-titles-store.ts`, `store/usage-store.ts`.
- **Locks stay separate:** `agent.<our-id>.lock` (pid + role), scanned by readdir for the running indicator; a dead pid = auto-free crash recovery. Transient lock state is deliberately _not_ in the durable record.

## Identity lifecycle

- **One resolve seam.** `POST /api/chat/session/resolve { id? }` always returns `{ sessionId: mandarax_<uuid> }`:
  - **no id** → mint a new record `{ id: mandarax_<uuid>, harnessSessionId: null, origin: 'chat' }` (new session).
  - **a harness id** (unadopted external row) → find-or-create the wrapping record (idempotent: look up by `harnessSessionId` first), `origin: 'external'`.
  - **our `mandarax_` id** → return it, mark last-active.
    The client calls `resolve` for every "become this session" action (new / switch / open-external), then uses the returned id as its header from there on. (One round-trip before the first turn of a brand-new session.)
- **New session:** `harnessSessionId: null`. The composer shows it; nothing to resume yet.
- **First turn:** spawn with no `--resume`. When the harness emits its id (`onSessionId`), `store.update(id, { harnessSessionId })`. Lock acquired under our id; usage written under our id.
- **Resume (later turn / reload):** client sends our id → record → spawn with `--resume record.harnessSessionId`.
- **Agent hand-off:** launched with `MANDARAX_SESSION_ID = <harness id>` → at boot, ensure a record exists wrapping it (`origin: 'agent'`, `harnessSessionId` pre-filled).
- **External discovery:** `GET /sessions` is read-only — it returns our records (id = `mandarax_…`) plus harness transcripts with no record yet (row id = the raw harness id, the only id they have). The client hands whichever row id to `resolve`, which normalizes it to an `mandarax_` id (adopting the external transcript on first open). No write-on-list.

## Client identity invariant (hard rule)

**The widget only ever knows, stores, and transmits our `mandarax_` id. The harness id is never used for any backend communication, routing, selection, or persistence — it may appear only as read-only display ("extra info").**

- **Comms chokepoint:** every request goes through the `defineClient` instance (`session-client.ts`); the `mandarax-session-id` header and all request bodies carry our id, only. This is the single seam to guard.
- **Selection/state keyed by our id:** session list rows, the active-row match, surface rows, quick-terminal panes, and the persisted active id are all our `mandarax_` id. The `activeToken` debugging hack is deleted — there is no token in client routing.
- **`harnessSessionId` reaches the client only as a display field** (e.g. `session-info`'s short slice). It is never read back into a header, a body (except `resolve`, below), a list key, or localStorage.
- **One sanctioned exception — the `resolve` endpoint.** External/discovered rows may carry a raw harness id. The client never _routes_ by it; it passes the row id once to `POST /api/chat/session/resolve`, which returns the canonical `mandarax_` id. From that point every request uses the `mandarax_` id. `resolve` is the only endpoint that accepts a non-`mandarax_` id, and its sole job is to normalize any id to ours.

## API surface (reshaped)

All routes key by our id (the `mandarax-session-id` header), never the token.

- `POST /api/chat/session/resolve { id? }` → returns `{ sessionId: mandarax_<uuid> }`. The **only** id-normalization seam: no id → mint new; harness id → find-or-create wrapper; our id → return + mark last-active. (Replaces the old `/session/new`, mint, and adopt.)
- `GET /api/chat/sessions` → **read-only** list = store records ∪ unwrapped harness transcripts, joined with lock state + harness enrichment. (No writes.)
- `GET /api/chat/session` (header = our id) → look up record → session view. Unknown id → 404 (client re-resolves with no id to get a fresh one).
- `GET /api/chat/history` (header = our id) → `record.harnessSessionId ? readTranscript : []`.
- `POST /api/chat` (turn) → record; resume by `harnessSessionId`; `onSessionId` sets it; lock + usage by our id.
- `DELETE /api/chat/session` (header = our id) → kill lock + delete record file.
- `POST /api/chat/sessions/title { id, title }` → update `record.title`.
- `POST /api/chat/launch` → resume terminal with `record.harnessSessionId`.

## Typed API client (single comms seam, derived from zod)

No OpenAPI in the client path — client and server share `@mandarax/protocol`, so we infer types from the zod schemas and validate with the same schemas. Each route is declared once as a **contract**; both the server handler and the widget client derive from it. (H3 route `meta` is reserved for an optional future OpenAPI _docs_ page — orthogonal to this client.)

**1. Branded session id** — makes the client invariant a compile error, not a convention:

```ts
// @mandarax/protocol
export const SessionId = z
  .string()
  .regex(/^mandarax_[A-Za-z0-9_-]{1,128}$/)
  .brand<'MandaraxSessionId'>()
export type SessionId = z.infer<typeof SessionId>
```

**2. Request/response schemas (protocol)** — the shared source of truth, validated on both ends. No registry object. Reuse the existing schemas (`ChatSession`, `ChatSessions`, `ChatModels`, `ChatHistory`, `RenameSession`, `ChatLaunch`) and add the few that are new:

```ts
// @mandarax/protocol/chat-types.ts
export const ResolveRequestSchema = z.object({id: z.string().optional()}) // plain string: harness id OR ours
export const ResolveResponseSchema = z.object({sessionId: SessionId})
export const RenameResponseSchema = z.object({ok: z.boolean(), title: z.string()})
export const OkSchema = z.object({ok: z.boolean()})
```

Each route is declared **once, inline** in the client below; the server imports these same schemas for `readValidatedBody`. (If we want to guarantee paths match too, export them as `Paths.resolve` constants — still no registry object.)

**3. The client — `defineClient`** — a per-instance closure that _owns_ its active session id. Each pane (and the modal) holds its own. Routes are declared **inline** via a generic `route(spec)` — no registry object, no `Object.fromEntries`, no cast. Method types are _inferred_ from the schemas, so nothing is typed twice:

```ts
// @mandarax/widget/session-client.ts
import {createSignal} from 'solid-js'
import {z} from 'zod'
import {
  MANDARAX_SESSION_HEADER,
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
} from '@mandarax/protocol/chat-types'

export function defineClient(deps: {apiBase: string}) {
  const base = deps.apiBase.replace(/\/+$/, '')
  const [sessionId, setSessionId] = createSignal<SessionId | null>(null) // this instance's session

  // route(spec) -> a typed method. GET/DELETE take no arg; POST takes the request body, but the
  // body is OPTIONAL when the schema has no required fields — so `client.resolve()` is legal while
  // `client.rename({...})` stays required. Args<T>: omit the param when {} satisfies T, else require it.
  type Args<T> = {} extends T ? [body?: T] : [body: T]
  function route<Res extends z.ZodTypeAny>(spec: {
    method: 'GET' | 'DELETE'
    path: string
    response: Res
    sendsSessionId?: boolean
  }): () => Promise<z.infer<Res>>
  function route<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny>(spec: {
    method: 'POST'
    path: string
    request: Req
    response: Res
    sendsSessionId?: boolean
  }): (...args: Args<z.infer<Req>>) => Promise<z.infer<Res>>
  function route(spec: {
    method: string
    path: string
    request?: z.ZodTypeAny
    response: z.ZodTypeAny
    sendsSessionId?: boolean
  }) {
    return (body?: unknown) => {
      const headers: Record<string, string> = {}
      if (spec.sendsSessionId) {
        const id = sessionId() // only our branded id ever reaches the wire
        if (id) headers[MANDARAX_SESSION_HEADER] = id
      }
      const payload = spec.request ? JSON.stringify(body) : undefined
      if (payload) headers['content-type'] = 'application/json'
      return fetch(`${base}${spec.path}`, {method: spec.method, credentials: 'include', headers, body: payload})
        .then((r) => (r.ok ? r.json() : Promise.reject(new ApiError(spec.path, r.status))))
        .then((j) => spec.response.parse(j))
    }
  }

  return {
    sessionId,
    setSessionId,
    resolve: route({
      method: 'POST',
      path: '/api/chat/session/resolve',
      request: ResolveRequestSchema,
      response: ResolveResponseSchema,
    }),
    session: route({method: 'GET', path: '/api/chat/session', response: ChatSessionSchema, sendsSessionId: true}),
    sessions: route({method: 'GET', path: '/api/chat/sessions', response: ChatSessionsSchema}),
    history: route({method: 'GET', path: '/api/chat/history', response: ChatHistorySchema, sendsSessionId: true}),
    models: route({method: 'GET', path: '/api/chat/models', response: ChatModelsSchema}),
    rename: route({
      method: 'POST',
      path: '/api/chat/sessions/title',
      request: RenameSessionSchema,
      response: RenameResponseSchema,
    }),
    launch: route({
      method: 'POST',
      path: '/api/chat/launch',
      request: ChatLaunchRequestSchema,
      response: ChatLaunchSchema,
      sendsSessionId: true,
    }),
    remove: route({method: 'DELETE', path: '/api/chat/session', response: OkSchema, sendsSessionId: true}),
  }
}
```

`defineClient`'s return type is _inferred_ from the `route(...)` calls — no annotation, no `SessionClient` type to maintain, and `client.nope` is a compile error because it isn't a property. (`route`'s implementation signature is the conventional broad overload impl; the two public overloads above it are exact.)

**Per-instance usage** — each pane owns a client; the modal owns one:

```ts
const client = defineClient({apiBase})
client.setSessionId(restored) // on mount, from localStorage (owner persists)

const {sessionId} = await client.resolve() // new session → mandarax_ id (no args — body is all-optional)
client.setSessionId(sessionId)

const onSwitch = async (rowId: string) => {
  // switch / open external row
  const {sessionId: id} = await client.resolve({id: rowId})
  client.setSessionId(id)
}

const meta = await client.session() // header carries this instance's id, automatically
const list = await client.sessions()
await client.rename({sessionId, title: 'Refactor auth'})

client.session() // ✓ no args (GET)
await client.rename() // ✗ compile error — body required (has required fields)
await client.nope() // ✗ compile error — no such method
await client.rename({sessionId: 'raw-harness-id', title: 'x'}) // ✗ not a SessionId
```

**Notes.** `sessionId()` is reactive, so the selector trigger/label and the running indicator read it directly; **persistence stays with the owner** (shell/quick-terminal seeds `setSessionId` from `localStorage` and writes on change — the client doesn't own storage). The branded id rides the _schemas_ (`RenameSessionSchema.sessionId` is `SessionId`), so a raw harness `string` is rejected outside `resolve`. **Server reuse:** handlers import the same request/response schemas for `readValidatedBody`, so client and server can't drift.

## Touch map (one clean cut, no back-compat — pre-release, no users)

**Protocol — `packages/protocol/src`**

- `chat-types.ts`: delete `DEFAULT_SESSION_ID`; reshape `ChatSession` (`sessionId` = our id, `harnessId` → `harnessSessionId: string | null`); `ChatSessionMeta.id` = our id (or raw harness id for unwrapped external); `RenameSessionSchema.sessionId` = our id; **`SessionId` becomes a branded `mandarax_…` schema**; add `SessionRecord`, `ResolveRequest`/`ResolveResponse`, `RenameResponse`, `Ok` schemas. These schemas are the shared source of truth (no registry object); client and server both import them.
- `harness-types.ts`: enrich `HarnessSessionMeta` (model, usage, lastMessage, createdAt, branch). Harness still speaks native ids.
- `config-types.ts`: `sessionId?`/`claudeSessionId?` (agent hand-off) carry a harness id → wrapped at boot.

**Core — `packages/core/src`**

- **NEW** `store/session-store.ts` — the `SessionStore` domain interface + an unstorage-backed implementation (driver injected: fs in prod, memory in tests) + list-join helpers. Replaces the old map `session-store.ts`, `session-titles-store.ts`, `usage-store.ts`.
- `state-paths.ts`: drop the three JSON paths; add the unstorage base; keep `lockFor`.
- `api/chat/session-id.ts`: header → our id or `null`; no `DEFAULT` fallback.
- `api/chat/chat.ts`: delete `sessionFor` map-seeding, the `DEFAULT_SESSION_ID` branch, transcript-adoption — replace with store reads; agent hand-off seeds a record.
- `api/chat/session.ts`: all routes re-keyed to our id; `/sessions` joins store + harness list + locks (read-only); add the single `resolve` route (new / adopt / switch).
- `api/chat/turn.ts`: lock + usage by our id; `onSessionId` → store update; resume from record.
- `api/chat/launch.ts`: read `harnessSessionId` from store.
- `engine.ts`: revisit `MANDARAX_SESSION_ID` child env (now our id).

**Harness — `packages/harness/src`**

- `claude/history.ts`: extend `listSessions` + transcript parse for enrichment fields. Native ids unchanged.

**Widget — `packages/widget/src`** (net simplification)

- `widget-shell.tsx`: persist `sessionId` (our id); **remove the `activeToken` signal + token plumbing** added during debugging; `onNew` → `resolve()` (no id) then set the returned id.
- `session-selector.tsx`: `activeId` = our id, matches our rows directly; selecting any row → `resolve(rowId)` → set the returned `mandarax_` id (this is where an external row gets adopted).
- `chat-api.ts` → **`session-client.ts`**: replaced by `defineClient` — a per-instance closure that owns its session id (the modal and each quick-terminal pane create their own); the sole comms seam; routes declared inline; header = our branded id.
- Server handlers (`api/chat/*`) import the same request/response schemas for validation + typed responses.
- `session-store-client.ts`, `quick-terminal.tsx`, `chat-panel.tsx`, `session-info.tsx`: key by our id; surface-merge simplifies.

## Deleted

`DEFAULT_SESSION_ID`; `store/session-store.ts` (the map); `store/session-titles-store.ts`; `store/usage-store.ts`; the header-id/token conflation everywhere; the `activeToken` debugging hack.

## Implementation order (phases)

Backend first, then the typed client immediately after it, then the widget rewiring. Each phase ends at a green verify gate before the next starts.

**Phase 1 — Backend (first).**

1. Protocol: branded `SessionId`, `SessionRecord`, and the request/response schemas (`ResolveRequest`/`ResolveResponse`, `RenameResponse`, `Ok`). (Shared source of truth for everything downstream — no registry object.)
2. Core: `SessionStore` interface + unstorage impl (driver injected); memory driver for tests.
3. Core: reshaped endpoints keyed by our id — `resolve`, `/session`, `/sessions` (read-only join), `/history`, turn rewire, rename, launch, delete; lock re-keyed to our id; agent hand-off seeds a record. Delete the map store, titles store, usage store, and `DEFAULT_SESSION_ID`.

- **Verify:** core unit tests green against the memory driver (CRUD, lifecycle, resolve/adopt, agent hand-off, usage round-trip). Handlers validate via the shared schemas.

**Phase 2 — Typed client (right after the endpoints).** 4. Widget: `defineClient` (`session-client.ts`) — per-instance closure owning its session id, routes declared inline from the shared schemas; replaces `chat-api.ts`; branded id enforces the our-id-only invariant at compile time.

- **Verify:** typecheck — a raw harness `string` is rejected everywhere except `resolve`.

**Phase 3 — Widget rewiring.** 5. `widget-shell` (persist our id, delete `activeToken`), `session-selector` (key by our id, `resolve` on switch/open-external), `quick-terminal`, `chat-panel`, `session-store-client`, `session-info` (harness id display-only).

- **Verify:** widget browser IT (below).

**Phase 4 — Harness enrichment + cleanup.** 6. Extend claude `listSessions`/transcript parse for the enrichment fields; final dead-code sweep; lint + build.

## Testing strategy

- **Widget (real browser, Playwright IT):** new session → chat → **reload restores it**; switch → reload restores; adopt an external row → it gets an `mandarax_` id and persists; rename persists; running indicator reflects locks. (Keep the reload regression test already drafted, re-pointed at the new model.)
- **Core (unit):** run `SessionStore` against the **memory driver** (no filesystem). Record CRUD; lifecycle (mint → first-turn sets `harnessSessionId` → resume); adopt-on-open; agent hand-off seeding; usage round-trips under one key. The same suite is the contract any future driver must pass.
- **Harness (unit):** enrichment parsing from a fixture transcript.

## Risks / open notes

- **`resolve` round-trip** before the first message of a new session; panes wait on it. Acceptable; can be made optimistic later if it bites.
- **List carries two id formats** transiently (our `mandarax_` ids vs raw harness ids for never-opened external rows). The `mandarax_` prefix keeps it unambiguous, and `resolve` collapses it to our id on first open.
- **List cost** is bounded by `MAX_SESSIONS`; listing is read-only — records are created only via `resolve`, never on a plain list.
- **Other harnesses (codex):** model is harness-agnostic — codex mints `thread_id`, we adopt it the same way; `harnessKind` routes resume.
