# Canvas-Comments Infrastructure & Extension Interfaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (house rule: work inline, not dispatched subagents). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up the complete platform layer the canvas-comments extension needs — the two core services (`mx.db` live collections over TrailBase, `mx.sync` Yjs rooms) and the grown extension API — with every interface fully specified and verified against the real `trail`/`@tanstack/db` contracts, so it executes in one shot. The canvas-comments feature itself (overlay, pins, anchoring, doctor, AI) is a consumer built on this stable layer in a follow-up plan; its interface contracts are catalogued here (Part A7) so nothing is unknown.

**Architecture:** Core supervises one `trail` process (SQLite, loopback, sole client) and exposes it two ways: a server-side `trailbase` client for agent/tool writes + introspection, and a gated reverse-proxy of `/api/records/v1/*` so the browser's **native** `@tanstack/trailbase-db-collection` talks to core, never trail. `mx.sync` is a Yjs room engine whose snapshot persists as a trail BLOB (via a `SnapshotStore` seam) and which syncs to the browser over a gated SSE+POST relay. Both services are added to the one composable extension `mx` (server + client halves), alongside an event bus, a per-tool approval policy, and composer `runTool`.

**Tech Stack:** `trail` v0.22.9 (external PATH binary, SQLite); `trailbase@0.12.2` client (both sides); `@tanstack/db@0.6.9` + `@tanstack/solid-db@0.2.23` + `@tanstack/trailbase-db-collection@0.1.87` (browser); `yjs` + `y-indexeddb` (install gate); h3 server; Zod; jiti extension loader; Playwright + vitest (real binary / real browser, no mocks).

**Verified contracts (read before coding):** `docs/superpowers/notes/trailbase-api.md`, `docs/superpowers/notes/tanstack-db-contract.md`. Every signature below is grounded in those.

## Global Constraints

- **Worktree:** all work in `.claude/worktrees/canvas-comments` (branch `worktree-canvas-comments`). Never `cd` elsewhere.
- **`trail` is an external PATH binary**, spawned/supervised by core (like the `claude` harness). SQLite db under `<cwd>/.mandarax/trail/data/main.db`.
- **Browser never opens a socket to `trail`.** Browser ↔ core (gated by `api/cors.ts` + session token) ↔ `trail`. Core is the only direct trail client.
- **`trail` record APIs:** UUID/integer PK required (TEXT PK rejected); declare with `enable_subscriptions: true` + `acl_world` CRUD (loopback-only trust). UUIDs serialize base64url; CREATE returns `{ids}`; LIST returns `{cursor,records}`; search via `filter[col][$like]`. Join key is a separate `cid TEXT UNIQUE` (client UUID).
- **Code style:** functions not classes; no IIFEs; one-line comments only; oxfmt (no semicolons, single quotes); zero narration comments in prod code; map/reduce over if/else.
- **Testing:** real `trail`, real browser via Playwright `newPage()` (never `newContext()`); native assertions (getByRole/getByText/toBeVisible/aria, never querySelector/class selectors/`toBe(true)` on DOM); reach shadow root via `getByRole().getRootNode()`; no jsdom/happy-dom; no mocks/stubs. Each parallel test gets a unique trail + core port.
- **Build/typecheck via turbo.** Core/contract changes → restart `pnpm dev`; widget changes → hard reload.
- **Ask before installing npm deps** (Task 1 gate). **v0/pre-release:** reshape APIs freely, no shims.
- **No silent truncation:** every limit a clear error.

---

# Part A — Complete Interface Catalog (final, verified)

This is the whole platform surface. Tasks in Part C implement exactly these. Shared types live in `@mandarax/protocol` so `@mandarax/extensions` and `@mandarax/core` agree without a core→extensions cycle.

## A1. Extension contract additions (`packages/extensions/src/contract.ts`)

```ts
// .server(mx => …) — grows from {registerTool, systemPrompt}
type ServerApi = {
  registerTool: (tool: ToolDefinition) => void
  systemPrompt: {append: (text: string) => void}
  db: LiveDb // A2 — live collections (server side) + introspection
  sync: SyncEngine // A4 — Yjs rooms (server side)
  on: (event: ExtensionEvent, handler: (ctx: EventCtx) => void | Promise<void>) => void // A5
  approval: (toolName: string, policy: 'auto' | 'ask') => void // A5
}
// .client(mx => …) — grows from {ui, registerComposerAction}
type ClientApi = {
  ui: {
    /* existing */
  }
  registerComposerAction: (action: ExtComposerAction) => void
  db: ClientDb // A2 — reactive TanStack DB collections over the core proxy
  sync: ClientSync // A4 — Yjs provider over the core relay
}
type ComposerActionCtx = {
  insert: (t: string) => void
  notify: (m: string) => void
  runTool: (name: string, input: unknown) => Promise<unknown>
}
type ExtensionEvent = 'session_start' | 'tool_execution_start'
type EventCtx = {sessionId: string; previewId: string; tool?: string}
// Collected back to the engine alongside tools/systemPrompt:
type ExtensionServerContributions = {
  tools: ExtensionServerTool[]
  systemPrompt: string[]
  eventHandlers: Record<ExtensionEvent, ((ctx: EventCtx) => unknown)[]>
  approvalPolicies: Record<string, 'auto' | 'ask'>
}
```

## A2. `mx.db` — server `LiveDb` + client `ClientDb` (shared types in `@mandarax/protocol/db-types`)

```ts
// SERVER (core constructs; extension .server consumes)
type LiveDb = {
  collection: <T extends {cid: string}>(name: string, spec: ServerCollectionSpec<T>) => ServerCollection<T>
  list: () => CollectionInfo[]
  get: (name: string) => ServerCollection<{cid: string}> | null
}
type ServerCollectionSpec<T> = {
  schema: z.ZodType<T> // app-shape schema (cid + fields)
  columns: string // SQL column defs (NOT incl. id/cid; e.g. "body TEXT NOT NULL, status TEXT NOT NULL")
  fts?: string[] // columns to index in FTS5 (search via filter[col][$like])
}
type ServerCollection<T> = {
  name: string
  query: (filter?: Partial<T> & {search?: string; limit?: number}) => Promise<T[]>
  insert: (row: T) => Promise<T> // CREATE returns {ids}; impl read-backs by cid to return the row
  update: (cid: string, patch: Partial<T>) => Promise<T>
  delete: (cid: string) => Promise<void>
  recordApiName: string // the trail record-api name (= collection name) — used by the client proxy
}
type CollectionInfo = {name: string; table: string; schema: object /* JSON Schema */; fts: string[]}

// CLIENT (widget; extension .client consumes) — wraps the native trailbase adapter
type ClientDb = {
  collection: <TItem extends {cid: string}, TRecord = TItem>(
    name: string,
    spec: ClientCollectionSpec<TItem, TRecord>,
  ) => Collection<TItem> // @tanstack/db Collection
}
type ClientCollectionSpec<TItem, TRecord> = {
  schema: z.ZodType<TItem>
  parse: Conversions<TRecord, TItem> // trail scalars -> app types (required by the native adapter)
  serialize: Conversions<TItem, TRecord> // app types -> trail scalars
}
```

## A3. `mx.db` core reverse-proxy contract (`packages/core/src/db/proxy.ts`)

- Mounts on the existing h3 app, behind the global `registerCors` gate + the session header.
- `ALL /api/records/v1/**` (GET/POST/PATCH/DELETE) → forward verbatim to `http://localhost:<trailPort>` with method, query, headers (minus hop-by-hop), and body; return trail's status + body.
- `GET /api/records/v1/:name/subscribe/*` → forward as a **stream**: pipe trail's `text/event-stream` response body straight through (no buffering), carrying `sseHeaders(event)`.
- Browser base URL handed to `initClient` is the core origin (same origin the widget already uses), so the `trailbase` client's `/api/records/v1/*` calls hit core.

## A4. `mx.sync` — server + client (shared types in `@mandarax/protocol/sync-types`)

```ts
// SERVER
type SyncEngine = {room: (roomId: string) => SyncRoom}
type SyncRoom = {
  doc: import('yjs').Doc
  observe: (cb: (update: Uint8Array, origin: unknown) => void) => () => void
  apply: (update: Uint8Array, origin: unknown) => void
  snapshot: () => Uint8Array
}
type SnapshotStore = {
  load: (room: string) => Promise<Uint8Array | null>
  save: (room: string, ybin: Uint8Array) => Promise<void>
}
// CLIENT
type ClientSync = {room: (roomId: string) => ClientRoom}
type ClientRoom = {doc: import('yjs').Doc; connected: () => boolean; disconnect: () => void}
// origin tags (string consts) shared both sides:
const ORIGIN = {
  USER: 'user',
  AI: 'ai',
  REMOTE: 'remote',
  REHYDRATE: 'core-rehydrate',
  EXCALIDRAW: 'excalidraw',
} as const
```

Relay wire protocol (gated SSE+POST, `packages/core/src/sync/relay.ts`):

- `GET /api/sync/:room` (SSE) → on connect, emit one frame `{u: base64(Y.encodeStateAsUpdate(doc))}` (initial state), then a frame `{u: base64(update), o: originClientId}` for every room update whose origin ≠ this connection's clientId.
- `POST /api/sync/:room` body `{u: base64(update), c: clientId}` → `room.apply(update, clientId)`; the SSE side skips frames back to the same `clientId` (no echo).
- Both gated by `registerCors` + session token; `:room` validated against the active session.

## A5. Event bus + approval policy

- `mx.on(event, handler)` collected into `ExtensionServerContributions.eventHandlers`. The engine fires `session_start` when a session is created/attached and `tool_execution_start` before any tool `execute`. Handlers get `EventCtx`.
- `mx.approval(toolName, policy)` collected into `approvalPolicies`. The shared execute chokepoint (A also touches `packages/core/src/api/chat/permission.ts`) reads the policy: `auto` → run; `ask` → require confirmation (UI confirm for user-origin, in-thread approval for AI-origin — full UI is the consumer plan; here we wire the gate + a deny-until-approved default for `ask`).

## A6. Shared protocol types (`packages/protocol/src/`)

New: `db-types.ts` (LiveDb, ServerCollection, CollectionInfo, ClientDb, specs), `sync-types.ts` (SyncEngine, SyncRoom, SnapshotStore, ClientSync, ORIGIN). `@mandarax/extensions` imports these for `ServerApi`/`ClientApi`; `@mandarax/core` implements them. No core→extensions dependency.

## A7. canvas-comments extension contracts (catalogued now; BUILT in the follow-up consumer plan)

Laid out so the platform is provably sufficient. Not implemented in this plan.

```ts
// the comments collection (declared via mx.db on both halves)
const CommentSchema = z.object({
  cid: z.string().uuid(),
  previewId: z.string(),
  sessionId: z.string(),
  threadId: z.string(),
  parentId: z.string().nullable(),
  parts: z.array(PartSchema),
  authorKind: z.enum(['human', 'ai']),
  authorModel: z.string().nullable(),
  status: z.enum(['open', 'resolved', 'drifted', 'orphaned']),
  kind: z.enum(['source-linked', 'floating']),
  anchor: AnchorSchema.nullable(),
  anchorFile: z.string().nullable(),
  anchorComponent: z.string().nullable(),
  anchorHash: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
// the canvas room id = `${previewId}:${sessionId}`; pins live in the Yjs doc keyed by cid:
type Pin = {cid: string; x: number; y: number; elementId: string | null; pinState: 'locked' | 'offset'}
// tool set (each a defineTool, execute closes over mx.db/mx.sync; approval via mx.approval):
//   canvas.read/draw/connect/diagram/export/update/delete[ask]/clear[ask]
//   comment.create/list/read/reply/resolve[ask]/delete[ask]/reanchor/move · pin.setState
//   element.reference · anchor.resolve · doctor.run · session.switch · history.undo/redo
// AnchorResolver seam (capture/resolve/reanchor) — Part of the anchoring consumer plan.
```

These prove the platform is sufficient: comments = one `mx.db` collection (cid join) + tools; pins = `mx.sync` room entries keyed by cid; approval = `mx.approval`; doctor = `mx.on('session_start')`; composer pin = `runTool('comment.create')`.

---

# Part B — File Structure

- `packages/protocol/src/db-types.ts`, `packages/protocol/src/sync-types.ts` — shared interfaces (A2/A4/A6).
- `packages/core/src/db/trail-supervisor.ts` — spawn/ready/restart trail.
- `packages/core/src/db/trail-config.ts` — emit `config.textproto` + per-collection migration files.
- `packages/core/src/db/live-db.ts` — `createLiveDb` (server `collection`/`list`/`get` over the `trailbase` client).
- `packages/core/src/db/proxy.ts` — gated reverse proxy of `/api/records/v1/**` (A3).
- `packages/core/src/sync/snapshot-store.ts` — `SnapshotStore` backed by a trail `canvas_snapshots` collection.
- `packages/core/src/sync/sync-engine.ts` — Yjs room engine + debounced persist + rehydrate.
- `packages/core/src/sync/relay.ts` — gated SSE+POST relay (A4 wire protocol).
- `packages/extensions/src/contract.ts` — `ServerApi`/`ClientApi`/`ComposerActionCtx` additions (A1).
- `packages/extensions/src/discovery.ts` — `collectServerContributions(extensions, services)` (threads db/sync/on/approval; collects eventHandlers/approvalPolicies).
- `packages/plugin/src/core/extensions.ts` — `loadServerContributions(root, services)`.
- `packages/widget/src/db/client-db.ts` — `createClientDb(coreBaseUrl)` (initClient + native trailbase collection).
- `packages/widget/src/sync/client-sync.ts` — `createClientSync(coreBaseUrl, token)` (Yjs provider over the relay).
- `packages/widget/src/extension-runtime.ts` — supply `db`/`sync` into `ClientApi`; `runTool` into `ComposerActionCtx`.
- `packages/core/src/engine.ts` + `packages/plugin/src/core/boot.ts` — construct services, thread through `start` + `loadServerContributions`.
- Tests colocated per package (`*.it.test.ts` for real trail/browser).
- `mandarax/extensions/__probe.ts` (test fixture only) — proves every interface.

---

# Part C — Build Tasks

## Task 1: Install gate + shared protocol types

- [ ] **Step 1: Confirm install** — `yjs`, `y-indexeddb` (widget + core both need `yjs`; `y-indexeddb` widget-only). `@tanstack/*` + `trailbase` already installed. Confirm with user, then:
  - `pnpm --filter @mandarax/core add yjs`
  - `pnpm --filter @mandarax/widget add yjs y-indexeddb`
  - `pnpm --filter @mandarax/widget add trailbase` is already present; add `trailbase` to core too: `pnpm --filter @mandarax/core add trailbase`.
- [ ] **Step 2: Create `packages/protocol/src/db-types.ts` and `sync-types.ts`** with the A2/A4/A6 types verbatim (pure types + the `ORIGIN` const). Export from `packages/protocol/src/index.ts` (or a subpath per the repo's export convention).
- [ ] **Step 3: Typecheck** — `pnpm turbo typecheck --filter @mandarax/protocol` → passes.
- [ ] **Step 4: Commit** — `git commit -m "feat(canvas-comments): shared db/sync protocol types + deps"`.

## Task 2: trail supervisor

**Files:** `packages/core/src/db/trail-supervisor.ts`, `packages/core/test/trail-supervisor.it.test.ts`.
**Interfaces:** Produces `createTrailSupervisor({dataDir, port}): {start(): Promise<void>; stop(): Promise<void>; baseUrl: string; onExit(cb): void}`.

- [ ] **Step 1: Failing test** — `start()` resolves on the `Listening on` line; `${baseUrl}` answers. (Pattern + code as in `trailbase-api.md`: spawn `trail --data-dir D run -a localhost:PORT --stderr-logging --cors-allowed-origins ''`, resolve on `/Listening on/`.)
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** (spawn, ready-on-log, stop via SIGTERM, `onExit` for restart policy). Code per `trailbase-api.md` spawn contract.
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Restart-on-crash test** (kill externally → `onExit` fires; caller `start()` recovers).
- [ ] **Step 6: Commit.**

## Task 3: trail config + migration emitter

**Files:** `packages/core/src/db/trail-config.ts`, test.
**Interfaces:** `writeTrailConfig(dataDir, apis: {name: string}[])`, `emitMigration(dataDir, index, name, columns, fts)`.

- [ ] **Step 1: Failing test** — emitting a collection writes `migrations/main/U####__<name>.sql` (UUID PK + `cid TEXT NOT NULL` + UNIQUE index + columns + fts5 + triggers) and `config.textproto` (full skeleton + `record_apis` with `enable_subscriptions: true`, `acl_world` CRUD); booting a supervisor against that dir exposes the Record API (anon CRUD works).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — the migration SQL uses the verified pattern: `id BLOB PRIMARY KEY NOT NULL CHECK (is_uuid_v7(id)) DEFAULT (uuid_v7()), cid TEXT NOT NULL, <columns>`, `CREATE UNIQUE INDEX <t>_cid ON <t>(cid)`, fts5 + ai/ad/au triggers; `config.textproto` skeleton (`email{} server{application_name logs_retention_sec} auth{…} jobs{}`) + `record_apis`.
- [ ] **Step 4: Run → pass.** Confirm anon create/list/read against the booted API.
- [ ] **Step 5: Commit.**

## Task 4: `mx.db` server — `createLiveDb` over the `trailbase` client

**Files:** `packages/core/src/db/live-db.ts`, test.
**Interfaces:** Consumes the supervisor + `trailbase` `initClient`. Produces `createLiveDb({trailBaseUrl, dataDir}): LiveDb` (A2). `collection()` emits config+migration (Task 3) and returns a `ServerCollection` wrapping `client.records(name)`.

- [ ] **Step 1: Failing test** — declare a `notes` collection (`cid`,`body`), boot trail, `insert({cid, body})` → `query({cid})` returns it (read-back by `cid` since CREATE returns `{ids}`); `query({search:'…'})` uses `filter[body][$like]`; `list()` includes `notes` with JSON Schema + fts; `get('notes')` non-null.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — `collection()` calls `emitMigration`+`writeTrailConfig` (accumulating all decls), records `CollectionInfo` (Zod→JSON Schema), returns a `ServerCollection`: `insert` = `client.records(name).create(serialize(row))` then `query({cid})` read-back; `query` builds `trailbase` `filters` (`{$eq}`/`{$like}`) + `limit`; `update`/`delete` resolve the trail RecordId by `cid` first (list by `filter[cid][$eq]`) then call `update`/`delete`. `list`/`get` from the in-memory registry.
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit.**

## Task 5: core reverse-proxy of trail Record API (A3)

**Files:** `packages/core/src/db/proxy.ts`, `packages/core/test/db-proxy.it.test.ts`.
**Interfaces:** `registerDbProxy(app: H3, trailBaseUrl: string)`.

- [ ] **Step 1: Failing IT** — boot trail + a core h3 app with `registerCors` + `registerDbProxy`; a `trailbase` `initClient(coreBaseUrl)` does create/list through core; a bad Origin is 403 (cors); the `subscribe/*` stream proxied through core delivers a change event after a create.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — `app.all('/api/records/v1/**', …)`: reconstruct the trail URL, forward method/query/body/headers (drop host/origin), return the response; for the `…/subscribe/*` path return a streamed `Response` piping trail's body through `sseHeaders(event)`. No buffering.
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit.**

## Task 6: `mx.db` client — native trailbase collection over the proxy

**Files:** `packages/widget/src/db/client-db.ts`, `packages/widget/test/client-db.it.test.ts` (browser).
**Interfaces:** `createClientDb(coreBaseUrl): ClientDb` (A2). `collection(name, {schema, parse, serialize})` → `createCollection(trailBaseCollectionOptions({id:name, recordApi: initClient(coreBaseUrl).records(name), getKey: r=>r.cid, schema, parse, serialize}))`.

- [ ] **Step 1: Failing browser IT** — boot trail + core (proxy) + serve a tiny page; in the page, create a client collection, `insert({cid, body})`, assert the row is readable **optimistically** (before the round-trip) via the collection, then a `useLiveQuery` (Solid) reflects it; a second create from core's server-side client **propagates live** into the page collection (realtime via the proxied subscribe). Native assertions on rendered text.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** `createClientDb` per `tanstack-db-contract.md` (initClient → records → trailBaseCollectionOptions; getKey `r=>r.cid`).
- [ ] **Step 4: Run → pass.** Confirms optimistic + live reconcile + `useLiveQuery` shape end-to-end.
- [ ] **Step 5: Commit.**

## Task 7: `mx.sync` snapshot store + room engine

**Files:** `packages/core/src/sync/snapshot-store.ts`, `packages/core/src/sync/sync-engine.ts`, tests.
**Interfaces:** `createSnapshotStore(db: LiveDb): SnapshotStore` (a `canvas_snapshots` collection, `cid=room`, `ybin` base64 TEXT column); `createSyncEngine({store}): SyncEngine` (A4).

- [ ] **Step 1: Failing test** — engine `room('r1')`; `apply(update, USER)` mutates `doc`; `observe` fires; debounced `store.save` persists; a fresh engine `room('r1')` rehydrates equal state from the store (origin `REHYDRATE`, no re-broadcast).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — `SnapshotStore` stores `Y.encodeStateAsUpdate` base64 in a `canvas_snapshots` row keyed by `cid=room`; engine wires `doc.on('update', (u,o)=>{ observers; debounce save })`, `room()` loads + `Y.applyUpdate(doc, saved, REHYDRATE)`.
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit.**

## Task 8: `mx.sync` relay (gated SSE+POST) + client provider

**Files:** `packages/core/src/sync/relay.ts`, `packages/widget/src/sync/client-sync.ts`, tests (core IT + browser IT).
**Interfaces:** `registerSyncRelay(app, engine, validateRoom)`; `createClientSync(coreBaseUrl, token): ClientSync` (A4 wire protocol).

- [ ] **Step 1: Failing ITs** — (core) bad Origin/missing token → 403; valid → an update POSTed by client A arrives on client B's SSE, not echoed to A. (browser) two pages on one room converge through core; reload rehydrates from the snapshot.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** the A4 wire protocol (`sseStream` initial-state + per-update frames skipping sender clientId; POST applies with clientId origin). Client provider: `EventSource`/fetch-stream subscribe + POST on `doc.on('update', non-REMOTE)`; bind a `y-indexeddb` cache.
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit.**

## Task 9: contract growth + `collectServerContributions(services)` + event bus + approval

**Files:** `packages/extensions/src/contract.ts`, `discovery.ts`, `packages/extensions/test/*`.
**Interfaces:** A1 + A5. `collectServerContributions(extensions, services: {db, sync})` returns `{tools, systemPrompt, eventHandlers, approvalPolicies}`.

- [ ] **Step 1: Failing test** — an extension `.server` calls `mx.db.collection`, `mx.sync.room`, `mx.on('session_start', …)`, `mx.approval('x.delete','ask')`; `collectServerContributions([ext], {db, sync})` exposes the handler + policy and the collection/room were declared (fakes for db/sync).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** — extend `ServerApi`/`ClientApi`/`ComposerActionCtx` (import shared types from `@mandarax/protocol`); build the `api` in `collectServerContributions` from `services`; collect handlers/policies.
- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit.**

## Task 10: composer `runTool` (client wiring)

**Files:** `packages/widget/src/extension-runtime.ts`, test (browser IT or unit against the session client).
**Interfaces:** `ComposerActionCtx.runTool(name, input)` wired to the session client's tool-run path.

- [ ] **Step 1: Failing IT** — a registered composer action calls `runTool('probe.echo', {x:1})` and the result is observable.
- [ ] **Step 2: Run → fail. Step 3: Implement** (thread the session client's run path into the composer-action ctx). **Step 4: pass. Step 5: commit.**

## Task 11: boot wiring — construct + thread all services

**Files:** `packages/plugin/src/core/boot.ts`, `packages/core/src/engine.ts`, `packages/core/src/app.ts`, `packages/plugin/src/core/extensions.ts`.
**Interfaces:** `loadServerContributions(root, {db, sync})`; `start({…, db, sync})` registers `registerDbProxy` + `registerSyncRelay`; widget runtime gets `createClientDb`/`createClientSync` wired into `ClientApi`.

- [ ] **Step 1:** Construct in `boot.ts`: supervisor (dataDir `join(stateRoot,'.mandarax','trail')`, a chosen `trailPort`) → `createLiveDb` → `createSnapshotStore(db)` → `createSyncEngine({store})`; `loadServerContributions(root,{db,sync})` (declares collections/rooms, emits config+migrations) → `await supervisor.start()` (boot applies migrations) → `supervisor.onExit(()=>supervisor.start())` → `start({…, db, sync, extensions})`.
- [ ] **Step 2:** `start`/`makeApp` calls `registerDbProxy(app, supervisor.baseUrl)` + `registerSyncRelay(app, engine, validateRoom)`. Widget `extension-runtime` builds `ClientApi.db = createClientDb(coreOrigin)`, `ClientApi.sync = createClientSync(coreOrigin, token)`.
- [ ] **Step 3: Boot IT** — start the real plugin boot path against a temp project; assert `/api/records/v1/*` proxied, the relay answers, and the engine fired `session_start`.
- [ ] **Step 4: Commit.**

## Task 12: probe extension — prove every interface end to end

**Files:** test fixture `mandarax/extensions/__probe.ts` under a temp project + `packages/plugin/test/probe-extension.it.test.ts` (+ a browser IT for the client halves).
**Interfaces:** consumes the full grown `mx` (server + client).

- [ ] **Step 1: Failing full-stack IT** — the probe extension `.server`: declares a `probe_notes` collection (cid, body), a `probe` room, `mx.on('session_start', …)` (sets a flag), `mx.approval('probe.del','ask')`, and a `defineTool('probe.add', execute: i => collection.insert(i))`. `.client`: registers a composer action that `runTool('probe.add', …)` and reads the collection via `useLiveQuery`. The IT boots the real stack and asserts: agent-path `probe.add` row appears live in the browser collection; the canvas room syncs an update browser↔core; the `ask` tool is gated; `session_start` fired; `mx.db.list()` includes `probe_notes`.
- [ ] **Step 2: Run → fail. Step 3:** fix any integration gaps surfaced. **Step 4: pass. Step 5: commit + delete the probe fixture** (or keep under test/ only).

---

## Self-Review

**Interface completeness (Part A):** ServerApi/ClientApi/ComposerActionCtx (A1), mx.db server+client (A2), proxy (A3), mx.sync server+client + relay protocol (A4), event bus + approval (A5), shared protocol types (A6), and the canvas-comments tool/schema contracts that consume them (A7) — every signature present, grounded in the two verified notes docs. Nothing deferred to "discover during execution."

**Spec coverage:** mx.db + mx.sync + one composable API + introspection + single trail store + canvas snapshot-as-BLOB + security gate + event bus + approval gate are all implemented (Tasks 2–12). The canvas-comments _feature_ (overlay/pins/anchoring/doctor/AI) is the explicit follow-up consumer; its contracts are catalogued (A7), proving the platform suffices.

**Placeholder scan:** Tasks 2–8 carry concrete signatures + test intents grounded in the notes; the few "code per `trailbase-api.md`" references point to a committed, verified contract doc (not a TODO). No "add error handling later."

**Type consistency:** `cid` is the join key and `getKey` everywhere; `ServerCollection`/`ClientDb`/`LiveDb`/`SyncEngine`/`SnapshotStore` names match A2/A4 across all tasks; `collection(name, spec)` server vs client specs are distinct types (A2) and used consistently.

## Execution Handoff

Execute inline via **superpowers:executing-plans** (house rule: no dispatched subagents). Task 1 (install gate) needs explicit go. Build order is linear (each task builds on the prior); Tasks 4–6 (db) and 7–8 (sync) are independent tracks that converge at Task 11 (boot) + Task 12 (probe).
