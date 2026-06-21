# TanStack DB + native TrailBase integration — contract (characterized from real packages)

Installed 2026-06-21 into `@mandarax/widget`: `@tanstack/db@0.6.9`, `@tanstack/solid-db@0.2.23`,
`@tanstack/trailbase-db-collection@0.1.87`, `trailbase@0.12.2`. Facts below are from the shipped
`.d.ts` / dist, not docs (the docs site tracks newer/older builds and disagrees in places).

## `trailbase` client (the RecordApi)

```ts
import {initClient, type RecordApi} from 'trailbase'
const client = initClient(siteUrl /* URL|string */, opts?) // Client
client.records<T>(name): RecordApi<T>
// Client also: .login(email,pw) / .tokens() / .logout — SKIP login for anon (acl_world) access.
```

`RecordApi<T>` (verified, record_api.d.ts):

```ts
interface RecordApi<T> {
  list(opts?: {
    pagination?
    order?: string[]
    filters?: FilterOrComposite[]
    count?: boolean
    expand?: string[]
  }): Promise<ListResponse<T>> // {records, cursor?, total_count?}
  read(id: RecordId, opt?): Promise<T>
  create(record: T): Promise<RecordId> // RecordId = string | number (base64url uuid)
  createBulk(records: T[]): Promise<RecordId[]>
  update(id: RecordId, record: Partial<T>): Promise<void>
  delete(id: RecordId): Promise<void>
  subscribe(id: RecordId, opts?): Promise<ReadableStream<ChangeEvent>>
  subscribeAll(opts?: {onLoss?; filters?}): Promise<ReadableStream<ChangeEvent>> // realtime, fetch-based stream
}
type RecordId = string | number
type ChangeEvent = {Insert: object} | {Update: object} | {Delete: object} | ChangeErrorEvent
```

- The client builds the `filter[col][$op]` query params from structured `filters` — we pass structured filters, not raw query strings.
- `subscribe*` returns a fetch-based `ReadableStream<ChangeEvent>` (there is also a `subscribeWs` WS variant). Realtime needs `enable_subscriptions: true` on the record API (see `trailbase-api.md`). In a browser this works natively; in node, `fetch` streaming works but the adapter is browser-targeted.

## `@tanstack/trailbase-db-collection`

```ts
import {trailBaseCollectionOptions} from '@tanstack/trailbase-db-collection'
interface TrailBaseCollectionConfig<TItem, TRecord = TItem, TKey = string|number>
  extends Omit<BaseCollectionConfig<TItem, TKey>, 'onInsert'|'onUpdate'|'onDelete'|'syncMode'> {
  recordApi: RecordApi<TRecord>
  parse: Conversions<TRecord, TItem>      // REQUIRED: trail scalar shape -> app type (e.g. ts -> Date, json string -> object)
  serialize: Conversions<TItem, TRecord>  // REQUIRED: app type -> trail scalar shape
  // from BaseCollectionConfig: id, getKey, schema, ...
}
trailBaseCollectionOptions(config): CollectionConfig & {utils: TrailBaseCollectionUtils}
```

- **`onInsert/onUpdate/onDelete` are OMITTED** — the adapter persists automatically through `recordApi`
  and reconciles via the realtime subscription. We do NOT write mutation handlers (older docs showed
  them; 0.1.87 removed them from the config).
- **`parse`/`serialize` are required** and per-field (`Conversions`): TrailBase returns scalars
  (TEXT/INTEGER), so e.g. `created_at: number(unix) <-> Date`, `parts: string(json) <-> object`.
- Optimistic insert/update/delete + automatic rollback on error are built in.

## `@tanstack/solid-db` `useLiveQuery` — return shape RESOLVED

```ts
import {useLiveQuery, createCollection, eq, and /* query builders */} from '@tanstack/solid-db'
const q = useLiveQuery((b) => b.from({c: collection}).where(({c}) => eq(c.status, 'open')))
// q is BOTH a call-accessor AND has properties:
//   q()            -> T[]   (Accessor)
//   q.data         -> T[]
//   q.state        -> Map
//   q.status       -> CollectionStatus
//   q.isLoading    -> boolean   (PROPERTY, no parens)
//   q.isReady      -> boolean
```

The docs "contradiction" (`q.data` vs `q()`) is resolved: it is `Accessor<T[]> & {data, state, status,
isLoading, isReady}`. Use `q.data` for the array and `q.isReady`/`q.isLoading` (plain booleans) for
gating. `createCollection`, `createLiveQueryCollection`, and all query operators (`eq/and/or/gt/like/…`)
are re-exported from `@tanstack/solid-db`, so one import source.

## Architecture this dictates (browser ↔ core proxy ↔ trail)

- **Browser** never imports a trail URL. `initClient(<core-proxy-base>)` → `client.records(name)` →
  `trailBaseCollectionOptions({recordApi, getKey: r => r.cid, schema, parse, serialize})` →
  `createCollection(...)`. Reads via `useLiveQuery`; writes via `collection.insert/update/delete`
  (optimistic; adapter persists through the proxied RecordApi; realtime reconciles).
- **Core** reverse-proxies `/api/records/v1/*` (incl. the `subscribe*` stream) to trail on loopback,
  gated by `api/cors.ts` (Origin + Host loopback) + the session token. Core is still the only process
  that opens a socket to trail.
- **Core server-side (agent/tool/CLI writes)** uses the SAME `trailbase` client pointed directly at
  trail's loopback URL: `initClient('http://localhost:<trailPort>').records(name)`. So one client lib
  both sides; no hand-rolled HTTP and no custom TanStack sync adapter anywhere.
- **`mx.db` split:** server `collection(name, {schema, migration, key, fts?})` → emits the migration
  (UUID PK + `cid TEXT UNIQUE` join key + fts) + record_api decl (`enable_subscriptions: true`,
  `acl_world` CRUD) and returns a server `ServerCollection` over the trail client (for agent writes +
  `list()`/`get()` introspection). Client `collection(name, {schema, getKey, parse, serialize})` →
  the native TrailBase TanStack collection over the core proxy.

## Node caveat

`EventSource` is `undefined` in the repo's node; the trailbase realtime stream is fetch/ReadableStream
based so it does not depend on global EventSource, but the collection adapter is browser-targeted —
realtime reconciliation is verified in the browser IT, not node. Node tests cover the client CRUD and
the core proxy; the browser IT covers optimistic + live reconcile + `useLiveQuery`.
