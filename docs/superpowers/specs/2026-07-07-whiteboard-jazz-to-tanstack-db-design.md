# Whiteboard: Jazz to TanStack DB Migration

Date: 2026-07-07
Status: Approved (pending spec review)
Package: `packages/extensions/whiteboard`

## Problem

The whiteboard extension stores all collaborative state (canvas elements, comments, pins, cursors,
reads) in Jazz (`jazz-tools` 2.0 alpha). Jazz causes sync thrash: lost writes, stale merges, and
re-render storms that make the canvas unresponsive. It also drags infrastructure: a local Jazz sync
server (`startLocalJazzServer`), a deploy step, admin/backend secrets, a permissions file, and alpha
version churn.

All sync is localhost only. Every writer (browser tabs, the AI agent via server tools) already goes
through the extension server process. A CRDT solves multi-master merge without a central authority.
We have a central authority. Figma ships central-server per-property last-writer-wins for the same
reason; excalidraw.com collab is per-element versioned LWW. We adopt the same model.

## Decision

Replace Jazz with:

- **Storage**: SQLite via the `node:sqlite` builtin (`DatabaseSync`), file at
  `<cwd>/.conciv/whiteboard.db`. Requires Node >= 22.13 (bump root `engines` from `>=22`).
- **Schema and migrations**: Drizzle. Tables declared in TS with `sqliteTable`, migrations generated
  by `drizzle-kit generate`, applied at extension server startup with the node-sqlite migrator.
  Runtime driver `drizzle-orm/node-sqlite` (pure JS over the builtin).
- **Server API**: zod-validated REST routes on the existing extension `server.app`, plus one SSE
  change-feed route per room broadcasting row deltas for all tables.
- **Client**: TanStack DB (`@tanstack/solid-db` + `@tanstack/query-db-collection`). Query
  collections load initial state via `queryFn`; SSE deltas apply via `utils.writeUpsert` /
  `utils.writeDelete` (no refetch); mutations are optimistic via `onInsert`/`onUpdate`/`onDelete`
  handlers that POST to the server.
- **Conflict policy**: server-ordered last-writer-wins per row. `canvas_elements` and
  `canvas_draft_elements` keep their `version` column: writes carry the version they saw, the server
  accepts and increments, a stale write loses and the loser snaps to server truth on the next delta.
- **Cursors**: never persisted. Throttled `POST /cursor` rebroadcast on the same SSE stream; clients
  hold presence in a Solid signal map. Presence expires with the stream.

Jazz, the Jazz runner, the deploy step, secrets, and `shared/permissions.ts` are deleted in the same
change. No back-compat, no data migration from Jazz (pre-release, v0).

## Rejected alternatives

- **TrailBase**: single static binary, but npm distribution needs per-platform artifacts, plus
  process lifecycle (spawn, port, health, orphan cleanup) and an auth hop for our own in-process
  tools. That is the Jazz-runner complexity class again.
- **Electric**: requires Postgres. Wrong weight for a localhost dev tool.
- **Keep a CRDT (Yjs)**: buys serverless/offline merge we do not need; canvas elements merge as
  per-key LWW inside a Y.Map anyway. Community picks Yjs for its transport/presence batteries; our
  transport is the extension server we already run.
- **better-sqlite3**: native addon, compile-on-install pain in a published package. `node:sqlite`
  is compiled into Node itself.

## Architecture

```
browser (Solid widget)                      extension server (one process)
┌─────────────────────────┐                ┌──────────────────────────────────┐
│ TanStack DB collections │── GET state ──▶│ routes (zod)                     │
│  canvasElements          │── POST writes ▶│   │                              │
│  canvasDraftElements     │                │   ▼                              │
│  canvasPending           │◀── SSE deltas ─│ store (drizzle + node:sqlite)    │
│  comments / pins / reads │                │   ▲            │ emit(change)    │
│ cursors: signal map      │                │ agent tools    ▼                 │
└─────────────────────────┘                │ (direct calls) change bus ──▶ SSE │
                                           └──────────────────────────────────┘
```

One writer door: humans via HTTP, the agent via direct store calls, both serialized by the single
process. Every accepted write emits a `RowChange` on an in-process bus; the SSE route filters by
room and streams to every connected client, including the originator.

## Components

### `src/server/db/schema.ts` (replaces `src/shared/schema.ts`)

Drizzle table definitions, same seven tables and columns as today, snake_case in SQL:

- `canvas_elements` (room, element_id, data JSON, version) PK (room, element_id)
- `canvas_draft_elements` same shape
- `canvas_pending` (id, room, kind, stage, payload JSON)
- `canvas_replies` (id, room, request_id, kind, payload JSON)
- `comments` (id, session*id, cid, thread_id, parent_id?, parts JSON, author*_, status, kind,
  anchor_ fields, created_at, updated_at, resolved_at?)
- `pins` (id, room, cid, x, y, element_id?, pin_state, anchor_x?, anchor_y?)
- `reads` (id, session_id, thread_id, account_id, last_read_at)

Jazz generated row `id`s implicitly; here rows without a natural key get
`id text primary key` defaulted to `crypto.randomUUID()` in the store, so existing call sites that
pass `row.id` keep working. `cursors` gets no table.

Timestamps are integer epoch millis. JSON columns are `text` with `{mode: 'json'}`.

zod row schemas are hand-written in `src/shared/rows.ts` (types + zod only, no drizzle import on
the client); `schema.ts` carries compile-time assignability assertions between `$inferSelect` and
the zod-inferred row types so the two cannot drift. `drizzle-zod` is not used.

### `src/server/db/store.ts` (replaces `src/server/jazz/backend.ts`, the `Db` type, and runner)

Factory `createStore(cwd)`:

- opens `DatabaseSync`, runs drizzle migrations from the package's `drizzle/` dir
- exposes per-table operations used by tools and routes today:
  `list(table, where)`, `insert(table, row)`, `update(table, id, patch)`, `remove(table, id)`,
  and `upsertElement(table, row)` with version gating (accept only when incoming version beats the
  stored one; reject returns the current row)
- draft commit and discard stay client-performed, exactly as today: tools insert `canvas_pending`
  rows, the connected browser drains them (skeleton/mermaid/svg conversion needs Excalidraw
  libraries, and commit is a cursor-animated replay). The store only adds bulk element upsert and
  bulk delete used by the drain
- every accepted write emits `RowChange = {table, kind: 'upsert' | 'delete', room, row | key}` to
  subscribers; `onChange(listener)` returns unsubscribe
- `subscribeAll`-style consumers (enrich worker) use `onChange` filtered by table

Server context (`src/server/context.ts`) swaps `db: Db` for `store: Store`. All tool servers
(`tool/canvas`, `tool/comment`, `tool/element`, `tool/anchor`), `auto-commit.ts`, and
`enrich-worker.ts` move from `ctx.db.all/insert/update/delete(...).wait({tier})` to synchronous
store calls. The `tier` concept disappears.

### Routes (`src/server/routes.ts`, wired in `src/server.ts`)

All zod-validated (`readValidatedBody` convention):

- `GET /rows/:table?room=` initial load per collection (localhost, seven tiny GETs are fine and
  match query-collection `queryFn` one-to-one)
- `POST /rows/:table` insert, `PUT /rows/:table/:id` update, `DELETE /rows/:table/:id`
- `PUT /elements/:table` upsert with `{room, elementId, data, version}` (CAS; 409 on stale version
  with the current row in the body so the client can converge)
- `PUT /elements/:table/bulk` upsert many (browser pending-drain), `POST /elements/:table/bulk-delete`
- `POST /cursor` `{room, peerId, kind, x, y, name, color}` throttle-rebroadcast, not stored; the
  comment tools' server-side agent presence emits cursor events on the bus directly
- `GET /changes?room=` SSE stream of `RowChange` + cursor events; heartbeat comment every 15s

`GET /config` (Jazz serverUrl/appId) is deleted; the client only needs the extension base URL it
already has.

### Client (`src/client/db.tsx` replaces `src/client/jazz-client.tsx`)

`createWhiteboardDb(base, room)` builds:

- one `QueryClient`
- one collection per table via `queryCollectionOptions`: `queryKey` `[table, room]`, `queryFn`
  slices `GET /state`, `getKey` is `id` (or `elementId` for element tables), `schema` from
  `shared/rows.ts`, and `onInsert`/`onUpdate`/`onDelete` POSTing to the routes above
- one `EventSource` on `/changes?room=`; each `RowChange` routes to the owning collection's
  `utils.writeUpsert` / `utils.writeDelete`; cursor events feed a Solid store keyed by `peerId`
- element upsert rejected with 409 resolves by applying the server row from the response (loser
  snaps, no retry loop)

A `WhiteboardDbProvider` Solid context replaces `WhiteboardJazzProvider`; `useLocalFirstAuth` and
Jazz auth loading states are deleted. Reads move from `useAll(query)` to `useLiveQuery` from
`@tanstack/solid-db`; writes move from `db.insert/update/delete` to collection
`insert/update/delete` (optimistic by default). `useSession` is replaced by the room prop already
flowing through the island.

SSE drop/reconnect: `EventSource` auto-reconnects; on `open` after a drop, refetch all collections
once (`utils.refetch`) to close the gap window.

### Presence (cursors)

Client throttles pointer moves to ~30 Hz to `POST /cursor`. Server keeps a per-room in-memory map
only to stamp `lastSeen` and rebroadcasts on SSE. Clients drop peers not seen for 5s. Nothing
touches SQLite; no `cursors` table.

## Error handling

- Route validation failures: 400 with zod issues (existing convention).
- Version CAS misses: 409 + current row; client converges to server truth.
- Optimistic mutation whose POST fails: TanStack DB rolls the transaction back; surface a toast via
  the existing overlay error path.
- SSE reconnect: refetch-on-reopen as above.
- Store is synchronous; any SQLite error inside a route becomes a 500 and the optimistic layer
  rolls back. Tools report errors through the existing tool error path.

## Migrations

- `drizzle.config.ts` in the package root, migrations emitted to `drizzle/`, shipped in the npm
  package (`files` includes `drizzle/`).
- Applied on every extension server start before routes register.
- Schema changes require `pnpm drizzle-kit generate` and committing the SQL. Existing
  `.conciv/whiteboard-jazz` data dir is abandoned (v0, no import).

## Testing

- Store unit tests: plain vitest, real `DatabaseSync` on a temp file. CAS, commit/discard
  transactionality, change emission.
- Route + SSE integration: real extension server via `@conciv/extension-testkit`, real HTTP + SSE.
  Two clients: write from one, assert delta lands in the other. Agent-path: store write emits to an
  SSE subscriber.
- Widget integration (existing Playwright suites for canvas/comments): must pass unchanged in
  behavior; they assert observable UI, not Jazz internals.
- Same-element race test: two concurrent upserts with the same base version; exactly one 409, both
  clients converge to the same row.
- No jsdom anywhere; Solid package vitest configs keep `environment: 'node'`.

## Dependencies

Added to `@conciv/extension-whiteboard`:

- runtime: `drizzle-orm`, `@tanstack/db`, `@tanstack/solid-db`, `@tanstack/query-db-collection`,
  `@tanstack/query-core` (all pure JS)
- dev: `drizzle-kit`

Removed: `jazz-tools`, `jazz-napi`.

Root `package.json` `engines.node` bumps to `>=22.13`.

## Deleted

- `src/server/jazz/` (runner, backend, enrich-worker moves out of the jazz dir)
- `src/shared/permissions.ts`, Jazz `src/shared/schema.ts`
- `src/client/jazz-client.tsx`, `useLocalFirstAuth` usage, `/config` route
- Jazz deploy step and `.conciv/whiteboard-jazz` data dir handling

## Out of scope

- Cross-machine collaboration (design leaves room: the wire protocol is plain REST + SSE, so a
  remote deployment of the same routes would work, but nothing is built for it).
- Importing existing Jazz data.
- Collaborative text editing (no character-level merge anywhere on the canvas).
