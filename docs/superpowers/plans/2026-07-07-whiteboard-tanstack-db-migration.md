# Whiteboard Jazz → drizzle/libSQL + TanStack DB Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task (this project's convention is inline execution, no subagents). Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Jazz CRDT in `packages/extensions/whiteboard` with drizzle on libSQL (in-process
`file:` database), explicit zod-validated REST routes + an SSE change feed on the extension
server, and TanStack DB query-collections in the Solid client.

**Architecture:** One process is the authority: the extension server owns a libSQL file via
drizzle; every write (browser REST call or agent tool call) goes through store helpers that emit
typed change events; an SSE route streams them per room as named per-table events. The client
holds one TanStack DB query-collection per table (`@tanstack/query-db-collection` — the
officially documented pattern for SSE-fed collections, see
`https://github.com/TanStack/db/blob/main/docs/collections/query-collection.md` "Direct Writes"):
`queryFn` loads the room's rows, SSE deltas apply via `utils.writeUpsert`/`utils.writeDelete`,
mutations are optimistic with `onInsert`/`onUpdate`/`onDelete` handlers that POST/PUT/DELETE,
write the server's response into the synced store, and return `{refetch: false}`. Elements use
server-side version gating (higher version wins, 409 returns the winner); cursors are
broadcast-only, never stored.

**Tech Stack:** `@libsql/client` (0.17.x) + `drizzle-orm@latest` (0.45.x stable,
`drizzle-orm/libsql`) + `drizzle-kit@latest` (0.31.x), zod v4, h3 v2 (`2.0.1-rc.22`),
`@tanstack/db` 0.6.x + `@tanstack/solid-db` 0.2.x + `@tanstack/query-db-collection` 1.0.x +
`@tanstack/query-core`, Solid, Excalidraw (unchanged).

## Global Constraints

- All work stays inside `packages/extensions/whiteboard`. No root `package.json` changes
  (libSQL runs on the existing `node >= 22` floor).
- Do NOT install `drizzle-orm@rc` / `drizzle-kit@rc` (the 1.0 prerelease) — the stable line has
  full libSQL support. The rc is only needed for `node:sqlite`, which we are not using.
- **Fully typed, zero casts**: no `any`, no `as` (the pre-existing `as unknown as` bridges for
  Excalidraw scene JSON may stay), no non-null assertions. The drizzle schema is the single
  source of truth for row shapes; the wire zod schemas in `src/shared/rows.ts` are pinned to it
  by a compile-time `expectTypeOf` test. No generic table-name dispatch over drizzle tables —
  every drizzle call names a concrete table.
- Code style: functions not classes, no IIFEs, ZERO comments, no `else` where guard-returns
  work, oxfmt (no semicolons, single quotes, printWidth 120).
- `vitest.config.ts` keeps `test: {environment: 'node'}`.
- Build/typecheck via turbo (`pnpm turbo run build --filter=@conciv/extension-whiteboard`);
  never hand-rebuild `dist/`.
- Commit with pathspec always: `git commit -m "..." -- <paths>`.
- Behavior parity: the existing IT suite under `packages/extensions/whiteboard/test/` must pass
  unchanged in Task 8. Do not loosen or rewrite those tests.
- Timestamps are integer epoch millis end-to-end (`Date.now()`), never `Date` objects in rows.
  Nullable columns are explicit `| null` end-to-end (no `null`→`undefined` stripping layers).
- Jazz deps stay in `package.json` until Task 9 (the old code imports them until then; the tree
  must typecheck at every commit).
- After client changes rebuild the widget before widget ITs
  (`pnpm turbo run build --filter=@conciv/widget`).

## Verified API facts (read from installed d.ts and TanStack/db main — do not re-derive)

- `@tanstack/query-db-collection` `queryCollectionOptions({queryKey, queryFn, queryClient,
getKey, onInsert, onUpdate, onDelete})`; the collection row type infers from `queryFn`'s
  return. `collection.utils` = `{refetch, writeInsert, writeUpdate, writeUpsert, writeDelete,
writeBatch}`. Mutation handlers may return `{refetch: false}` after direct-writing the server
  response — the documented "Incremental Updates" pattern.
- `@tanstack/solid-db` re-exports ALL of `@tanstack/db` (import `createCollection` and
  `useLiveQuery` from `@tanstack/solid-db`). `useLiveQuery(q => q.from({row: collection}))`
  returns an Accessor (call it for the row array) with `.isReady/.isLoading` props.
- `collection.state` is a `Map<key, row>` getter; `collection.has(key)`/`get(key)` exist;
  `collection.subscribeChanges(cb, {includeInitialState: true})` exists and returns a
  subscription object (check its d.ts for the disposer method when wiring cleanup).
- `collection.insert(row)`, `collection.update(key, draft => {...})`, `collection.delete(key)`;
  handler params carry `transaction.mutations[]`, each `{type, key, modified, changes}`
  (`modified` = full new row, `changes` = the partial).
- drizzle libSQL: `createClient({url: 'file:...'})` (`@libsql/client`), `drizzle(client)`
  (`drizzle-orm/libsql`), `migrate(db, {migrationsFolder})` (`drizzle-orm/libsql/migrator`,
  async). All queries async. `db.insert(t).values(v).returning().get()` resolves to the stored
  row; `await db.delete(t).where(...)` resolves to a `ResultSet` with `rowsAffected`.
- drizzle-kit 0.31 `generate` emits the classic migration layout: `drizzle/0000_<name>.sql` +
  `drizzle/meta/_journal.json` — the format the stable migrator reads.
- h3 `2.0.1-rc.22`: `HTTPError({status, body: {...}})` spreads `body` onto the top-level error
  JSON (`data:` would nest it under a `data` key). `createEventStream(event)` +
  `stream.push({event, data})` + `stream.pushComment(...)` + `stream.onClosed(cb)` +
  `return stream.send()`. Prime every SSE stream with `pushComment` immediately — Node's undici
  fetch (used by the routes test) buffers a lone first chunk otherwise. srvx `serve()` port =
  `new URL(server.url).port` (there is no `.port()` method).
- Node has NO global `EventSource`; the client's SSE code runs in the browser only and is
  verified by the real-browser IT suite (repo rule: no jsdom).

---

### Task 1: Dependencies + runtime probe

**Files:**

- Modify: `packages/extensions/whiteboard/package.json` (via pnpm)

- [ ] **Step 1: Add dependencies** (run from the worktree root; `--filter` targets the package)

```bash
pnpm --filter @conciv/extension-whiteboard add drizzle-orm@latest @libsql/client @tanstack/db @tanstack/solid-db @tanstack/query-db-collection @tanstack/query-core h3@2.0.1-rc.22
pnpm --filter @conciv/extension-whiteboard add -D drizzle-kit@latest
```

Expected in `package.json`: `drizzle-orm` ^0.45.x, `@libsql/client` ^0.17.x, `drizzle-kit`
^0.31.x (devDep), h3 pinned exactly `2.0.1-rc.22` (matches core/terminal/test-runner — the old
Jazz server never imported h3, so whiteboard gains it now).

- [ ] **Step 2: Probe the libSQL driver end-to-end**

Run from `packages/extensions/whiteboard` (write the file, run it, delete it):

```bash
cd packages/extensions/whiteboard
cat > ./probe.mjs <<'EOF'
import {createClient} from '@libsql/client'
import {drizzle} from 'drizzle-orm/libsql'
import {sql} from 'drizzle-orm'
const client = createClient({url: 'file::memory:'})
const db = drizzle(client)
await db.run(sql`create table t (id text primary key, data text)`)
await db.run(sql`insert into t values ('a', '{"x":1}')`)
const rows = await db.all(sql`select * from t`)
console.log('rows', JSON.stringify(rows))
const del = await db.run(sql`delete from t where id = 'a'`)
console.log('rowsAffected', del.rowsAffected)
client.close()
EOF
node ./probe.mjs && rm ./probe.mjs
```

Expected: `rows [{"id":"a","data":"{\"x\":1}"}]`, `rowsAffected 1`. If `drizzle-orm/libsql`
does not resolve, the installed drizzle-orm is not the stable 0.45 line — fix the install, do
NOT reach for the rc.

- [ ] **Step 3: Commit**

```bash
git add packages/extensions/whiteboard/package.json pnpm-lock.yaml
git commit -m "chore(whiteboard): add drizzle+libsql and tanstack db deps" -- packages/extensions/whiteboard/package.json pnpm-lock.yaml
```

---

### Task 2: Drizzle schema (source of truth) + wire schemas + migration

**Files:**

- Create: `packages/extensions/whiteboard/src/server/db/schema.ts`
- Create: `packages/extensions/whiteboard/src/shared/rows.ts`
- Create: `packages/extensions/whiteboard/drizzle.config.ts`
- Create: `packages/extensions/whiteboard/drizzle/` (generated, committed)
- Modify: `packages/extensions/whiteboard/package.json` (`files` gains `"drizzle"`)
- Test: `packages/extensions/whiteboard/test/rows.test.ts`

**Interfaces:**

- Produces: drizzle tables `canvasElements`, `canvasDraftElements`, `canvasPending`,
  `canvasReplies`, `comments`, `pins`, `reads` (schema.ts); zod wire schemas + inferred row
  types `ElementRow`, `PendingRow`, `ReplyRow`, `CommentRow`, `PinRow`, `ReadRow`,
  `CursorEvent`, `JsonValue`, and `changeOf(rowSchema)` (rows.ts). Every later task imports row
  TYPES from `../shared/rows.js` and TABLES from `./db/schema.js`.

- [ ] **Step 1: Write the wire schemas**

`src/shared/rows.ts` — the wire truth. Nullable drizzle columns are `.nullable()` here (NOT
`.optional()` — rows carry explicit nulls end-to-end):

```ts
import {z} from 'zod'

export type JsonValue = string | number | boolean | null | JsonValue[] | {[key: string]: JsonValue}

export const json: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(json), z.record(z.string(), json)]),
)

export const elementRow = z.object({
  room: z.string(),
  elementId: z.string(),
  data: json,
  version: z.number().int(),
})

export const pendingRow = z.object({
  id: z.string(),
  room: z.string(),
  kind: z.enum(['skeletons', 'mermaid', 'svg', 'export', 'commit', 'discard']),
  stage: z.enum(['draft', 'live']),
  payload: json,
})

export const replyRow = z.object({
  id: z.string(),
  room: z.string(),
  requestId: z.string(),
  kind: z.enum(['export']),
  payload: json,
})

export const commentRow = z.object({
  id: z.string(),
  sessionId: z.string(),
  cid: z.string(),
  threadId: z.string(),
  parentId: z.string().nullable(),
  parts: json,
  authorKind: z.enum(['human', 'ai']),
  authorModel: z.string().nullable(),
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  authorAvatar: z.string().nullable(),
  status: z.enum(['open', 'resolved', 'drifted', 'orphaned']),
  kind: z.enum(['source-linked', 'floating']),
  anchor: json.nullable(),
  anchorFile: z.string().nullable(),
  anchorComponent: z.string().nullable(),
  anchorHash: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  resolvedAt: z.number().int().nullable(),
})

export const pinRow = z.object({
  id: z.string(),
  room: z.string(),
  cid: z.string(),
  x: z.number(),
  y: z.number(),
  elementId: z.string().nullable(),
  pinState: z.enum(['locked', 'offset']),
  anchorX: z.number().nullable(),
  anchorY: z.number().nullable(),
})

export const readRow = z.object({
  id: z.string(),
  sessionId: z.string(),
  threadId: z.string(),
  accountId: z.string(),
  lastReadAt: z.number().int(),
})

export const cursorEvent = z.object({
  room: z.string(),
  peerId: z.string(),
  kind: z.enum(['human', 'agent']),
  x: z.number(),
  y: z.number(),
  name: z.string(),
  color: z.string(),
  lastSeen: z.number().int(),
})

export const changeOf = <Row extends z.ZodType>(row: Row) =>
  z.discriminatedUnion('type', [
    z.object({type: z.literal('upsert'), row}),
    z.object({type: z.literal('delete'), key: z.string()}),
  ])

export type ElementRow = z.infer<typeof elementRow>
export type PendingRow = z.infer<typeof pendingRow>
export type ReplyRow = z.infer<typeof replyRow>
export type CommentRow = z.infer<typeof commentRow>
export type PinRow = z.infer<typeof pinRow>
export type ReadRow = z.infer<typeof readRow>
export type CursorEvent = z.infer<typeof cursorEvent>
```

- [ ] **Step 2: Write the drizzle schema**

`src/server/db/schema.ts` — exports tables only (row types come from rows.ts; the test in Step 4
pins them equal):

```ts
import {integer, primaryKey, real, sqliteTable, text} from 'drizzle-orm/sqlite-core'
import type {JsonValue} from '../../shared/rows.js'

export const canvasElements = sqliteTable(
  'canvas_elements',
  {
    room: text('room').notNull(),
    elementId: text('element_id').notNull(),
    data: text('data', {mode: 'json'}).$type<JsonValue>().notNull(),
    version: integer('version').notNull(),
  },
  (table) => [primaryKey({columns: [table.room, table.elementId]})],
)

export const canvasDraftElements = sqliteTable(
  'canvas_draft_elements',
  {
    room: text('room').notNull(),
    elementId: text('element_id').notNull(),
    data: text('data', {mode: 'json'}).$type<JsonValue>().notNull(),
    version: integer('version').notNull(),
  },
  (table) => [primaryKey({columns: [table.room, table.elementId]})],
)

export const canvasPending = sqliteTable('canvas_pending', {
  id: text('id').primaryKey(),
  room: text('room').notNull(),
  kind: text('kind', {enum: ['skeletons', 'mermaid', 'svg', 'export', 'commit', 'discard']}).notNull(),
  stage: text('stage', {enum: ['draft', 'live']})
    .notNull()
    .default('live'),
  payload: text('payload', {mode: 'json'}).$type<JsonValue>().notNull(),
})

export const canvasReplies = sqliteTable('canvas_replies', {
  id: text('id').primaryKey(),
  room: text('room').notNull(),
  requestId: text('request_id').notNull(),
  kind: text('kind', {enum: ['export']}).notNull(),
  payload: text('payload', {mode: 'json'}).$type<JsonValue>().notNull(),
})

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  cid: text('cid').notNull(),
  threadId: text('thread_id').notNull(),
  parentId: text('parent_id'),
  parts: text('parts', {mode: 'json'}).$type<JsonValue>().notNull(),
  authorKind: text('author_kind', {enum: ['human', 'ai']}).notNull(),
  authorModel: text('author_model'),
  authorId: text('author_id'),
  authorName: text('author_name'),
  authorAvatar: text('author_avatar'),
  status: text('status', {enum: ['open', 'resolved', 'drifted', 'orphaned']})
    .notNull()
    .default('open'),
  kind: text('kind', {enum: ['source-linked', 'floating']}).notNull(),
  anchor: text('anchor', {mode: 'json'}).$type<JsonValue>(),
  anchorFile: text('anchor_file'),
  anchorComponent: text('anchor_component'),
  anchorHash: text('anchor_hash'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  resolvedAt: integer('resolved_at'),
})

export const pins = sqliteTable('pins', {
  id: text('id').primaryKey(),
  room: text('room').notNull(),
  cid: text('cid').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  elementId: text('element_id'),
  pinState: text('pin_state', {enum: ['locked', 'offset']})
    .notNull()
    .default('locked'),
  anchorX: real('anchor_x'),
  anchorY: real('anchor_y'),
})

export const reads = sqliteTable('reads', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  threadId: text('thread_id').notNull(),
  accountId: text('account_id').notNull(),
  lastReadAt: integer('last_read_at').notNull(),
})
```

- [ ] **Step 3: Generate the migration**

`drizzle.config.ts` (package root):

```ts
import {defineConfig} from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
})
```

```bash
cd packages/extensions/whiteboard
pnpm exec drizzle-kit generate --name whiteboard-init
find drizzle -type f
```

Expected layout (classic format): `drizzle/0000_whiteboard-init.sql`,
`drizzle/meta/_journal.json`, `drizzle/meta/0000_snapshot.json`. Eyeball the SQL: 7 tables,
composite `PRIMARY KEY(room, element_id)` on both element tables.

Add `"drizzle"` to the `files` array in `packages/extensions/whiteboard/package.json` (the
migration ships with the npm package).

- [ ] **Step 4: Write the test — wire parse + compile-time drizzle equivalence**

`test/rows.test.ts`. The `expectTypeOf` block is the contract that the zod wire schemas and the
drizzle tables never drift — a column added/renamed/re-typed on one side only fails `typecheck`
(`expectTypeOf` is a runtime no-op):

```ts
import {describe, expect, expectTypeOf, it} from 'vitest'
import {
  changeOf,
  commentRow,
  elementRow,
  pinRow,
  type CommentRow,
  type ElementRow,
  type PendingRow,
  type PinRow,
  type ReadRow,
  type ReplyRow,
} from '../src/shared/rows.js'
import type {canvasElements, canvasPending, canvasReplies, comments, pins, reads} from '../src/server/db/schema.js'

describe('wire schemas', () => {
  it('parses an element row and rejects a bad version', () => {
    const row = {room: 'r1', elementId: 'e1', data: {type: 'rectangle'}, version: 3}
    expect(elementRow.parse(row)).toEqual(row)
    expect(() => elementRow.parse({...row, version: 'x'})).toThrow()
  })

  it('parses a comment row with explicit nulls and epoch-millis timestamps', () => {
    const now = 1_700_000_000_000
    const row = {
      id: 'c1',
      sessionId: 's1',
      cid: 'cid1',
      threadId: 'cid1',
      parentId: null,
      parts: [{type: 'text', text: 'hi'}],
      authorKind: 'human',
      authorModel: null,
      authorId: null,
      authorName: null,
      authorAvatar: null,
      status: 'open',
      kind: 'floating',
      anchor: null,
      anchorFile: null,
      anchorComponent: null,
      anchorHash: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    }
    expect(commentRow.parse(row).createdAt).toBe(now)
  })

  it('discriminates change messages', () => {
    const change = changeOf(pinRow).parse({type: 'delete', key: 'p1'})
    expect(change.type).toBe('delete')
  })

  it('wire types equal drizzle row types', () => {
    expectTypeOf<ElementRow>().toEqualTypeOf<typeof canvasElements.$inferSelect>()
    expectTypeOf<PendingRow>().toEqualTypeOf<typeof canvasPending.$inferSelect>()
    expectTypeOf<ReplyRow>().toEqualTypeOf<typeof canvasReplies.$inferSelect>()
    expectTypeOf<CommentRow>().toEqualTypeOf<typeof comments.$inferSelect>()
    expectTypeOf<PinRow>().toEqualTypeOf<typeof pins.$inferSelect>()
    expectTypeOf<ReadRow>().toEqualTypeOf<typeof reads.$inferSelect>()
  })
})
```

- [ ] **Step 5: Run the test + typecheck**

```bash
pnpm --filter @conciv/extension-whiteboard exec vitest run test/rows.test.ts
pnpm turbo run typecheck --filter=@conciv/extension-whiteboard
```

Expected: 4 tests PASS; typecheck clean (turbo builds workspace deps first — a bare
`pnpm --filter ... typecheck` in a fresh worktree fails on unbuilt `@conciv/*` dists). If an
`expectTypeOf` line fails, fix the drizzle or zod side that drifted — never delete the check.

- [ ] **Step 6: Commit**

```bash
git add packages/extensions/whiteboard/src/shared/rows.ts packages/extensions/whiteboard/src/server/db/schema.ts packages/extensions/whiteboard/drizzle.config.ts packages/extensions/whiteboard/drizzle packages/extensions/whiteboard/test/rows.test.ts packages/extensions/whiteboard/package.json
git commit -m "feat(whiteboard): drizzle schema + zod wire schemas pinned by type test" -- packages/extensions/whiteboard/src/shared/rows.ts packages/extensions/whiteboard/src/server/db/schema.ts packages/extensions/whiteboard/drizzle.config.ts packages/extensions/whiteboard/drizzle packages/extensions/whiteboard/test/rows.test.ts packages/extensions/whiteboard/package.json
```

---

### Task 3: Store — libSQL bootstrap, typed change bus, concrete write helpers

**Files:**

- Create: `packages/extensions/whiteboard/src/server/db/store.ts`
- Test: `packages/extensions/whiteboard/test/store.test.ts`

**Interfaces:**

- Consumes: tables (Task 2 schema.ts), row types (Task 2 rows.ts).
- Produces: `createStore(dataDir: string): Promise<Store>` where `Store` exposes `db` (the raw
  drizzle database — full SQL power for reads anywhere), `onEvent`, `cursor`, `close`, element
  ops (`listElements`, `upsertElement`, `upsertElements`, `deleteElement`, `deleteElements`)
  and per-table write helpers (`insertComment`, `updateComment`, `deleteComment`, `insertPin`,
  `updatePin`, `deletePin`, `insertRead`, `updateRead`, `deleteRead`, `insertPending`,
  `updatePending`, `deletePending`, `insertReply`, `updateReply`, `deleteReply`). Types
  `WhiteboardEvent`, `WhiteboardChange`, `ElementScope`, `ElementUpsert`.

Design rule: reads go through `store.db` directly (no wrappers, nothing limits SQL); writes go
through the helpers because every write must emit a change event. Each helper names its
concrete table — no table-name dispatch, which is exactly why drizzle's inference holds with
zero casts.

- [ ] **Step 1: Write the failing test**

`test/store.test.ts`:

```ts
import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {eq} from 'drizzle-orm'
import {afterEach, describe, expect, it} from 'vitest'
import {createStore, type Store, type WhiteboardEvent} from '../src/server/db/store.js'
import {comments} from '../src/server/db/schema.js'

const stores: Store[] = []
const open = async (): Promise<Store> => {
  const store = await createStore(realpathSync(mkdtempSync(join(tmpdir(), 'wb-store-'))))
  stores.push(store)
  return store
}
afterEach(() => stores.splice(0).forEach((store) => store.close()))

describe('whiteboard store', () => {
  it('inserts, updates, deletes comments and emits typed events', async () => {
    const store = await open()
    const events: WhiteboardEvent[] = []
    store.onEvent((event) => events.push(event))
    const saved = await store.insertComment({
      id: crypto.randomUUID(),
      sessionId: 's1',
      cid: 'c1',
      threadId: 'c1',
      parts: [{type: 'text', text: 'hi'}],
      authorKind: 'human',
      kind: 'floating',
      createdAt: 1000,
      updatedAt: 1000,
    })
    expect(saved.status).toBe('open')
    expect(saved.parentId).toBeNull()
    const listed = await store.db.select().from(comments).where(eq(comments.sessionId, 's1'))
    expect(listed).toHaveLength(1)
    const updated = await store.updateComment(saved.id, {status: 'resolved', resolvedAt: 2000})
    expect(updated?.status).toBe('resolved')
    expect(await store.deleteComment(saved.id)).toBe(true)
    expect(events.map((event) => event.table)).toEqual(['comments', 'comments', 'comments'])
    expect(events.map((event) => (event.table === 'cursor' ? 'cursor' : event.type))).toEqual([
      'upsert',
      'upsert',
      'delete',
    ])
  })

  it('gates element upserts by version', async () => {
    const store = await open()
    const base = {room: 'r1', elementId: 'e1', data: {type: 'rectangle'}, version: 2}
    expect((await store.upsertElement('live', base)).ok).toBe(true)
    const stale = await store.upsertElement('live', {...base, version: 1, data: {type: 'ellipse'}})
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.current.version).toBe(2)
    expect((await store.upsertElement('live', {...base, version: 3})).ok).toBe(true)
    expect(await store.listElements('live', 'r1')).toEqual([{...base, version: 3}])
  })

  it('bulk upsert and bulk delete cover the pending drain', async () => {
    const store = await open()
    const rows = [
      {room: 'r1', elementId: 'e1', data: {}, version: 1},
      {room: 'r1', elementId: 'e2', data: {}, version: 1},
    ]
    expect(await store.upsertElements('draft', rows)).toHaveLength(2)
    expect(await store.deleteElements('draft', 'r1', ['e1', 'e2'])).toBe(2)
    expect(await store.listElements('draft', 'r1')).toHaveLength(0)
  })

  it('broadcasts cursor events without persisting', async () => {
    const store = await open()
    const events: WhiteboardEvent[] = []
    store.onEvent((event) => events.push(event))
    store.cursor({room: 'r1', peerId: 'p1', kind: 'human', x: 1, y: 2, name: 'G', color: '#fff', lastSeen: 1000})
    expect(events).toHaveLength(1)
    expect(events[0]?.table).toBe('cursor')
  })

  it('persists across reopen from the same dataDir', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wb-persist-')))
    const first = await createStore(dir)
    await first.upsertElement('live', {room: 'r1', elementId: 'e1', data: {}, version: 1})
    first.close()
    const second = await createStore(dir)
    stores.push(second)
    expect(await second.listElements('live', 'r1')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @conciv/extension-whiteboard exec vitest run test/store.test.ts
```

Expected: FAIL (cannot resolve `../src/server/db/store.js`).

- [ ] **Step 3: Write the store**

`src/server/db/store.ts`. Every helper is concrete; `returning().get()` gives back the stored
row (defaults applied), which is what gets emitted and returned — so callers and SSE listeners
always see the exact database truth:

```ts
import {existsSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createClient} from '@libsql/client'
import {and, eq} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/libsql'
import {migrate} from 'drizzle-orm/libsql/migrator'
import type {CommentRow, CursorEvent, ElementRow, PendingRow, PinRow, ReadRow, ReplyRow} from '../../shared/rows.js'
import {canvasDraftElements, canvasElements, canvasPending, canvasReplies, comments, pins, reads} from './schema.js'

type RowOf = {
  canvasElements: ElementRow
  canvasDraftElements: ElementRow
  canvasPending: PendingRow
  canvasReplies: ReplyRow
  comments: CommentRow
  pins: PinRow
  reads: ReadRow
}
export type WhiteboardChange = {
  [K in keyof RowOf]: {table: K; room: string} & ({type: 'upsert'; row: RowOf[K]} | {type: 'delete'; key: string})
}[keyof RowOf]
export type WhiteboardEvent = WhiteboardChange | {table: 'cursor'; room: string; cursor: CursorEvent}
export type ElementScope = 'live' | 'draft'
export type ElementUpsert = {ok: true; row: ElementRow} | {ok: false; current: ElementRow}
export type Store = Awaited<ReturnType<typeof createStore>>

const resolveMigrationsFolder = (): string => {
  const candidates = ['../../../drizzle', '../drizzle', '../../drizzle']
  const found = candidates
    .map((relative) => fileURLToPath(new URL(relative, import.meta.url)))
    .find((path) => existsSync(path))
  return found ?? fileURLToPath(new URL('../../../drizzle', import.meta.url))
}

export const createStore = async (dataDir: string) => {
  mkdirSync(dataDir, {recursive: true})
  const client = createClient({url: `file:${join(dataDir, 'whiteboard.db')}`})
  const db = drizzle(client)
  await migrate(db, {migrationsFolder: resolveMigrationsFolder()})

  const listeners = new Set<(event: WhiteboardEvent) => void>()
  const emit = (event: WhiteboardEvent): void => listeners.forEach((listener) => listener(event))
  const onEvent = (listener: (event: WhiteboardEvent) => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const cursor = (event: CursorEvent): void => emit({table: 'cursor', room: event.room, cursor: event})

  const elementTable = (scope: ElementScope) => (scope === 'draft' ? canvasDraftElements : canvasElements)
  const elementTableName = (scope: ElementScope): 'canvasElements' | 'canvasDraftElements' =>
    scope === 'draft' ? 'canvasDraftElements' : 'canvasElements'

  const listElements = (scope: ElementScope, room: string): Promise<ElementRow[]> => {
    const table = elementTable(scope)
    return db.select().from(table).where(eq(table.room, room))
  }

  const upsertElement = async (scope: ElementScope, row: ElementRow): Promise<ElementUpsert> => {
    const table = elementTable(scope)
    const current = await db
      .select()
      .from(table)
      .where(and(eq(table.room, row.room), eq(table.elementId, row.elementId)))
      .get()
    if (current && current.version >= row.version) return {ok: false, current}
    await db
      .insert(table)
      .values(row)
      .onConflictDoUpdate({target: [table.room, table.elementId], set: {data: row.data, version: row.version}})
    emit({table: elementTableName(scope), room: row.room, type: 'upsert', row})
    return {ok: true, row}
  }

  const upsertElements = async (scope: ElementScope, rows: ElementRow[]): Promise<ElementRow[]> => {
    const written: ElementRow[] = []
    for (const row of rows) {
      const outcome = await upsertElement(scope, row)
      if (outcome.ok) written.push(outcome.row)
    }
    return written
  }

  const deleteElement = async (scope: ElementScope, room: string, elementId: string): Promise<boolean> => {
    const table = elementTable(scope)
    const result = await db.delete(table).where(and(eq(table.room, room), eq(table.elementId, elementId)))
    if (result.rowsAffected > 0) emit({table: elementTableName(scope), room, type: 'delete', key: elementId})
    return result.rowsAffected > 0
  }

  const deleteElements = async (scope: ElementScope, room: string, elementIds: string[]): Promise<number> => {
    let deleted = 0
    for (const elementId of elementIds) {
      if (await deleteElement(scope, room, elementId)) deleted += 1
    }
    return deleted
  }

  const insertComment = async (row: typeof comments.$inferInsert): Promise<CommentRow> => {
    const saved = await db.insert(comments).values(row).returning().get()
    emit({table: 'comments', room: saved.sessionId, type: 'upsert', row: saved})
    return saved
  }

  const updateComment = async (
    id: string,
    patch: Partial<typeof comments.$inferInsert>,
  ): Promise<CommentRow | undefined> => {
    const saved = await db.update(comments).set(patch).where(eq(comments.id, id)).returning().get()
    if (!saved) return undefined
    emit({table: 'comments', room: saved.sessionId, type: 'upsert', row: saved})
    return saved
  }

  const deleteComment = async (id: string): Promise<boolean> => {
    const gone = await db.delete(comments).where(eq(comments.id, id)).returning().get()
    if (!gone) return false
    emit({table: 'comments', room: gone.sessionId, type: 'delete', key: gone.id})
    return true
  }

  const insertPin = async (row: typeof pins.$inferInsert): Promise<PinRow> => {
    const saved = await db.insert(pins).values(row).returning().get()
    emit({table: 'pins', room: saved.room, type: 'upsert', row: saved})
    return saved
  }

  const updatePin = async (id: string, patch: Partial<typeof pins.$inferInsert>): Promise<PinRow | undefined> => {
    const saved = await db.update(pins).set(patch).where(eq(pins.id, id)).returning().get()
    if (!saved) return undefined
    emit({table: 'pins', room: saved.room, type: 'upsert', row: saved})
    return saved
  }

  const deletePin = async (id: string): Promise<boolean> => {
    const gone = await db.delete(pins).where(eq(pins.id, id)).returning().get()
    if (!gone) return false
    emit({table: 'pins', room: gone.room, type: 'delete', key: gone.id})
    return true
  }

  const insertRead = async (row: typeof reads.$inferInsert): Promise<ReadRow> => {
    const saved = await db.insert(reads).values(row).returning().get()
    emit({table: 'reads', room: saved.sessionId, type: 'upsert', row: saved})
    return saved
  }

  const updateRead = async (id: string, patch: Partial<typeof reads.$inferInsert>): Promise<ReadRow | undefined> => {
    const saved = await db.update(reads).set(patch).where(eq(reads.id, id)).returning().get()
    if (!saved) return undefined
    emit({table: 'reads', room: saved.sessionId, type: 'upsert', row: saved})
    return saved
  }

  const deleteRead = async (id: string): Promise<boolean> => {
    const gone = await db.delete(reads).where(eq(reads.id, id)).returning().get()
    if (!gone) return false
    emit({table: 'reads', room: gone.sessionId, type: 'delete', key: gone.id})
    return true
  }

  const insertPending = async (row: typeof canvasPending.$inferInsert): Promise<PendingRow> => {
    const saved = await db.insert(canvasPending).values(row).returning().get()
    emit({table: 'canvasPending', room: saved.room, type: 'upsert', row: saved})
    return saved
  }

  const updatePending = async (
    id: string,
    patch: Partial<typeof canvasPending.$inferInsert>,
  ): Promise<PendingRow | undefined> => {
    const saved = await db.update(canvasPending).set(patch).where(eq(canvasPending.id, id)).returning().get()
    if (!saved) return undefined
    emit({table: 'canvasPending', room: saved.room, type: 'upsert', row: saved})
    return saved
  }

  const deletePending = async (id: string): Promise<boolean> => {
    const gone = await db.delete(canvasPending).where(eq(canvasPending.id, id)).returning().get()
    if (!gone) return false
    emit({table: 'canvasPending', room: gone.room, type: 'delete', key: gone.id})
    return true
  }

  const insertReply = async (row: typeof canvasReplies.$inferInsert): Promise<ReplyRow> => {
    const saved = await db.insert(canvasReplies).values(row).returning().get()
    emit({table: 'canvasReplies', room: saved.room, type: 'upsert', row: saved})
    return saved
  }

  const updateReply = async (
    id: string,
    patch: Partial<typeof canvasReplies.$inferInsert>,
  ): Promise<ReplyRow | undefined> => {
    const saved = await db.update(canvasReplies).set(patch).where(eq(canvasReplies.id, id)).returning().get()
    if (!saved) return undefined
    emit({table: 'canvasReplies', room: saved.room, type: 'upsert', row: saved})
    return saved
  }

  const deleteReply = async (id: string): Promise<boolean> => {
    const gone = await db.delete(canvasReplies).where(eq(canvasReplies.id, id)).returning().get()
    if (!gone) return false
    emit({table: 'canvasReplies', room: gone.room, type: 'delete', key: gone.id})
    return true
  }

  return {
    db,
    onEvent,
    cursor,
    listElements,
    upsertElement,
    upsertElements,
    deleteElement,
    deleteElements,
    insertComment,
    updateComment,
    deleteComment,
    insertPin,
    updatePin,
    deletePin,
    insertRead,
    updateRead,
    deleteRead,
    insertPending,
    updatePending,
    deletePending,
    insertReply,
    updateReply,
    deleteReply,
    close: () => client.close(),
  }
}
```

Note the `id` requirement: id-table inserts REQUIRE a caller-supplied `id`
(`crypto.randomUUID()` at call sites) — TanStack DB needs client-generated keys, so the server
never invents ids.

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm --filter @conciv/extension-whiteboard exec vitest run test/store.test.ts test/rows.test.ts
pnpm turbo run typecheck --filter=@conciv/extension-whiteboard
```

Expected: PASS (9 tests), clean typecheck. If `.returning().get()` types don't line up with the
wire types, the schema/rows drifted — fix there, never cast here.

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/whiteboard/src/server/db/store.ts packages/extensions/whiteboard/test/store.test.ts
git commit -m "feat(whiteboard): libsql store with typed change bus and concrete write helpers" -- packages/extensions/whiteboard/src/server/db/store.ts packages/extensions/whiteboard/test/store.test.ts
```

---

### Task 4: REST routes + SSE change feed

**Files:**

- Create: `packages/extensions/whiteboard/src/server/routes.ts`
- Test: `packages/extensions/whiteboard/test/routes.test.ts`

**Interfaces:**

- Consumes: `Store` (Task 3), wire schemas (Task 2).
- Produces: `registerRoutes(app: H3, store: Store): void` mounting, for each of `comments`,
  `pins`, `reads`, `canvasPending`, `canvasReplies`:
  - `GET    /<table>?room=` → rows (room maps to `sessionId` for comments/reads, `room` otherwise)
  - `POST   /<table>` body = full wire row → stored row
  - `PUT    /<table>/:id` body = partial wire row → stored row (404 if missing)
  - `DELETE /<table>/:id` → `{deleted: boolean}`

  plus elements and the feed:
  - `GET  /elements/:scope?room=` (scope `live|draft`) → `ElementRow[]`
  - `PUT  /elements/:scope` body = `ElementRow` → 200 stored row, or 409 `{current}` when gated
  - `PUT  /elements/:scope/bulk` body = `{rows: ElementRow[]}` → `{written: number}`
  - `POST /elements/:scope/bulk-delete` body = `{room, elementIds}` → `{deleted: number}`
  - `POST /cursor` body = `CursorEvent` → `{ok: true}`
  - `GET  /changes?room=` SSE: event NAME = table name (`comments`, `pins`, `reads`,
    `canvasPending`, `canvasReplies`, `canvasElements`, `canvasDraftElements`) with data
    `{type: 'upsert', row}` | `{type: 'delete', key}`; event `cursor` with a `CursorEvent`
    payload; opening `pushComment` prime; 15s `ping` heartbeat.

- [ ] **Step 1: Write the failing test**

`test/routes.test.ts` — real h3 app over real HTTP, no mocks:

```ts
import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {H3, serve} from 'h3'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createStore, type Store} from '../src/server/db/store.js'
import {registerRoutes} from '../src/server/routes.js'

let store: Store
let base = ''
let server: ReturnType<typeof serve>

beforeAll(async () => {
  store = await createStore(realpathSync(mkdtempSync(join(tmpdir(), 'wb-routes-'))))
  const app = new H3()
  registerRoutes(app, store)
  server = serve(app, {port: 0})
  const {url} = await server.ready()
  if (!url) throw new Error('server has no url')
  base = `http://127.0.0.1:${new URL(url).port}`
})
afterAll(async () => {
  await server.close()
  store.close()
})

const post = (path: string, body: unknown): Promise<Response> =>
  fetch(`${base}${path}`, {method: 'POST', body: JSON.stringify(body), headers: {'content-type': 'application/json'}})
const put = (path: string, body: unknown): Promise<Response> =>
  fetch(`${base}${path}`, {method: 'PUT', body: JSON.stringify(body), headers: {'content-type': 'application/json'}})

describe('whiteboard routes', () => {
  it('round-trips a pin through POST/GET/PUT/DELETE', async () => {
    const pin = {
      id: crypto.randomUUID(),
      room: 'r1',
      cid: 'c1',
      x: 1,
      y: 2,
      elementId: null,
      pinState: 'locked',
      anchorX: null,
      anchorY: null,
    }
    const created = await (await post('/pins', pin)).json()
    expect(created).toEqual(pin)
    const listed = await (await fetch(`${base}/pins?room=r1`)).json()
    expect(listed).toEqual([pin])
    const moved = await (await put(`/pins/${pin.id}`, {x: 9})).json()
    expect(moved.x).toBe(9)
    const deleted = await (await fetch(`${base}/pins/${pin.id}`, {method: 'DELETE'})).json()
    expect(deleted).toEqual({deleted: true})
  })

  it('scopes comments by sessionId via the room query param', async () => {
    const comment = {
      id: crypto.randomUUID(),
      sessionId: 'sess-a',
      cid: 'cc1',
      threadId: 'cc1',
      parentId: null,
      parts: [{type: 'text', text: 'hi'}],
      authorKind: 'human',
      authorModel: null,
      authorId: null,
      authorName: null,
      authorAvatar: null,
      status: 'open',
      kind: 'floating',
      anchor: null,
      anchorFile: null,
      anchorComponent: null,
      anchorHash: null,
      createdAt: 1000,
      updatedAt: 1000,
      resolvedAt: null,
    }
    expect((await post('/comments', comment)).status).toBe(200)
    expect(await (await fetch(`${base}/comments?room=sess-a`)).json()).toHaveLength(1)
    expect(await (await fetch(`${base}/comments?room=sess-b`)).json()).toHaveLength(0)
  })

  it('element upsert 409s on stale version with the winner top-level', async () => {
    const row = {room: 'r1', elementId: 'e1', data: {type: 'rectangle'}, version: 2}
    expect((await put('/elements/live', row)).status).toBe(200)
    const stale = await put('/elements/live', {...row, version: 1})
    expect(stale.status).toBe(409)
    expect((await stale.json()).current.version).toBe(2)
    expect(await (await fetch(`${base}/elements/live?room=r1`)).json()).toHaveLength(1)
  })

  it('rejects an invalid body with 400', async () => {
    expect((await put('/elements/live', {room: 'r1'})).status).toBe(400)
    expect((await post('/pins', {id: 'x'})).status).toBe(400)
  })

  it('streams table-named SSE events for writes in the room only', async () => {
    const controller = new AbortController()
    const stream = await fetch(`${base}/changes?room=sse-room`, {signal: controller.signal})
    const reader = stream.body?.getReader()
    if (!reader) throw new Error('no body')
    await store.insertPin({id: crypto.randomUUID(), room: 'other-room', cid: 'cx', x: 0, y: 0})
    await store.insertPin({id: crypto.randomUUID(), room: 'sse-room', cid: 'c2', x: 5, y: 6})
    const decoder = new TextDecoder()
    let text = ''
    while (!text.includes('event: pins')) {
      const {value, done} = await reader.read()
      if (done) break
      text += decoder.decode(value)
    }
    controller.abort()
    expect(text).toContain('event: pins')
    expect(text).toContain('"cid":"c2"')
    expect(text).not.toContain('"cid":"cx"')
  })

  it('streams cursor events', async () => {
    const controller = new AbortController()
    const stream = await fetch(`${base}/changes?room=cur-room`, {signal: controller.signal})
    const reader = stream.body?.getReader()
    if (!reader) throw new Error('no body')
    await post('/cursor', {
      room: 'cur-room',
      peerId: 'p1',
      kind: 'human',
      x: 0,
      y: 0,
      name: 'G',
      color: '#fff',
      lastSeen: 1,
    })
    const decoder = new TextDecoder()
    let text = ''
    while (!text.includes('event: cursor')) {
      const {value, done} = await reader.read()
      if (done) break
      text += decoder.decode(value)
    }
    controller.abort()
    expect(text).toContain('"peerId":"p1"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @conciv/extension-whiteboard exec vitest run test/routes.test.ts
```

Expected: FAIL (cannot resolve `../src/server/routes.js`).

- [ ] **Step 3: Implement routes**

`src/server/routes.ts`. Each table's routes are written out explicitly against its concrete
store helpers/tables — no `:table` param, no dispatch map:

```ts
import {createEventStream, getQuery, getRouterParam, HTTPError, readValidatedBody} from 'h3'
import type {H3, H3Event} from 'h3'
import {eq} from 'drizzle-orm'
import {z} from 'zod'
import {commentRow, cursorEvent, elementRow, pendingRow, pinRow, readRow, replyRow} from '../shared/rows.js'
import {canvasPending, canvasReplies, comments, pins, reads} from './db/schema.js'
import type {ElementScope, Store} from './db/store.js'

const roomQuery = (event: H3Event): string => {
  const room = getQuery(event).room
  if (typeof room !== 'string' || !room) throw new HTTPError({status: 400, message: 'room required'})
  return room
}

const idParam = (event: H3Event): string => {
  const id = getRouterParam(event, 'id')
  if (!id) throw new HTTPError({status: 400, message: 'id required'})
  return id
}

const scopeOf = (event: H3Event): ElementScope => {
  const parsed = z.enum(['live', 'draft']).safeParse(getRouterParam(event, 'scope'))
  if (!parsed.success) throw new HTTPError({status: 400, message: 'bad scope'})
  return parsed.data
}

const found = <Row>(row: Row | undefined): Row => {
  if (!row) throw new HTTPError({status: 404, message: 'row not found'})
  return row
}

export const registerRoutes = (app: H3, store: Store): void => {
  app.get('/comments', (event) =>
    store.db
      .select()
      .from(comments)
      .where(eq(comments.sessionId, roomQuery(event))),
  )
  app.post('/comments', async (event) => store.insertComment(await readValidatedBody(event, commentRow)))
  app.put('/comments/:id', async (event) =>
    found(await store.updateComment(idParam(event), await readValidatedBody(event, commentRow.partial()))),
  )
  app.delete('/comments/:id', async (event) => ({deleted: await store.deleteComment(idParam(event))}))

  app.get('/pins', (event) =>
    store.db
      .select()
      .from(pins)
      .where(eq(pins.room, roomQuery(event))),
  )
  app.post('/pins', async (event) => store.insertPin(await readValidatedBody(event, pinRow)))
  app.put('/pins/:id', async (event) =>
    found(await store.updatePin(idParam(event), await readValidatedBody(event, pinRow.partial()))),
  )
  app.delete('/pins/:id', async (event) => ({deleted: await store.deletePin(idParam(event))}))

  app.get('/reads', (event) =>
    store.db
      .select()
      .from(reads)
      .where(eq(reads.sessionId, roomQuery(event))),
  )
  app.post('/reads', async (event) => store.insertRead(await readValidatedBody(event, readRow)))
  app.put('/reads/:id', async (event) =>
    found(await store.updateRead(idParam(event), await readValidatedBody(event, readRow.partial()))),
  )
  app.delete('/reads/:id', async (event) => ({deleted: await store.deleteRead(idParam(event))}))

  app.get('/canvasPending', (event) =>
    store.db
      .select()
      .from(canvasPending)
      .where(eq(canvasPending.room, roomQuery(event))),
  )
  app.post('/canvasPending', async (event) => store.insertPending(await readValidatedBody(event, pendingRow)))
  app.put('/canvasPending/:id', async (event) =>
    found(await store.updatePending(idParam(event), await readValidatedBody(event, pendingRow.partial()))),
  )
  app.delete('/canvasPending/:id', async (event) => ({deleted: await store.deletePending(idParam(event))}))

  app.get('/canvasReplies', (event) =>
    store.db
      .select()
      .from(canvasReplies)
      .where(eq(canvasReplies.room, roomQuery(event))),
  )
  app.post('/canvasReplies', async (event) => store.insertReply(await readValidatedBody(event, replyRow)))
  app.put('/canvasReplies/:id', async (event) =>
    found(await store.updateReply(idParam(event), await readValidatedBody(event, replyRow.partial()))),
  )
  app.delete('/canvasReplies/:id', async (event) => ({deleted: await store.deleteReply(idParam(event))}))

  app.get('/elements/:scope', (event) => store.listElements(scopeOf(event), roomQuery(event)))
  app.put('/elements/:scope', async (event) => {
    const outcome = await store.upsertElement(scopeOf(event), await readValidatedBody(event, elementRow))
    if (!outcome.ok) throw new HTTPError({status: 409, body: {current: outcome.current}})
    return outcome.row
  })
  app.put('/elements/:scope/bulk', async (event) => {
    const {rows} = await readValidatedBody(event, z.object({rows: z.array(elementRow)}))
    return {written: (await store.upsertElements(scopeOf(event), rows)).length}
  })
  app.post('/elements/:scope/bulk-delete', async (event) => {
    const {room, elementIds} = await readValidatedBody(
      event,
      z.object({room: z.string(), elementIds: z.array(z.string())}),
    )
    return {deleted: await store.deleteElements(scopeOf(event), room, elementIds)}
  })

  app.post('/cursor', async (event) => {
    store.cursor(await readValidatedBody(event, cursorEvent))
    return {ok: true}
  })

  app.get('/changes', (event) => {
    const room = roomQuery(event)
    const stream = createEventStream(event)
    void stream.pushComment('whiteboard changes open')
    const unsubscribe = store.onEvent((change) => {
      if (change.room !== room) return
      if (change.table === 'cursor') return void stream.push({event: 'cursor', data: JSON.stringify(change.cursor)})
      const payload = change.type === 'upsert' ? {type: 'upsert', row: change.row} : {type: 'delete', key: change.key}
      void stream.push({event: change.table, data: JSON.stringify(payload)})
    })
    const heartbeat = setInterval(() => void stream.push({event: 'ping', data: '{}'}), 15_000)
    stream.onClosed(() => {
      clearInterval(heartbeat)
      unsubscribe()
    })
    return stream.send()
  })
}
```

Route order note: register `/elements/:scope/bulk` handlers work because h3 matches the more
specific literal segment; if PUT `/elements/:scope` shadows `/elements/:scope/bulk` in practice,
register the `bulk` routes FIRST — the test's bulk coverage in Task 8 (drain IT) will catch it.

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm --filter @conciv/extension-whiteboard exec vitest run test/routes.test.ts
pnpm turbo run typecheck --filter=@conciv/extension-whiteboard
```

Expected: 6 tests PASS in a few seconds (the `pushComment` prime prevents the undici stall).

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/whiteboard/src/server/routes.ts packages/extensions/whiteboard/test/routes.test.ts
git commit -m "feat(whiteboard): explicit rest routes + per-table sse change feed" -- packages/extensions/whiteboard/src/server/routes.ts packages/extensions/whiteboard/test/routes.test.ts
```

---

### Task 5: Server swap — context, server.ts, auto-commit, enrich worker, tools

**Files:**

- Modify: `packages/extensions/whiteboard/src/server/context.ts`
- Modify: `packages/extensions/whiteboard/src/server.ts`
- Modify: `packages/extensions/whiteboard/src/server/auto-commit.ts`
- Create: `packages/extensions/whiteboard/src/server/enrich-worker.ts`
- Delete: `packages/extensions/whiteboard/src/server/jazz/` (whole dir: `backend.ts`,
  `enrich-worker.ts`, `runner.ts`)
- Modify: `packages/extensions/whiteboard/src/tool/canvas/server.ts`
- Modify: `packages/extensions/whiteboard/src/tool/comment/server.ts`
- Modify: `packages/extensions/whiteboard/src/tool/anchor/server.ts`
- Test: existing unit tests (`canvas-prompt.test.ts`, `canvas-svg-caps.test.ts`,
  `canvas-draft-svg.test.ts`) + typecheck; ITs run in Task 8.

**Interfaces:**

- Consumes: `Store`/`createStore` (Task 3), `registerRoutes` (Task 4), row types (Task 2).
- Produces: `WhiteboardToolContext` = `{cwd, store: Store, sessionId, room, model}`.

Translation table (apply everywhere; store writes emit events, reads use `store.db` with
concrete drizzle):

| Jazz                                                            | New                                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ctx.db.all(app.comments.where({sessionId, cid}), {tier})`      | `ctx.store.db.select().from(comments).where(and(eq(comments.sessionId, sessionId), eq(comments.cid, cid)))` |
| `ctx.db.insert(app.canvasPending, row).wait(...)` / `.value.id` | `await ctx.store.insertPending({id: crypto.randomUUID(), ...row})` / `.id`                                  |
| `ctx.db.update(app.pins, id, patch).wait(...)`                  | `await ctx.store.updatePin(id, patch)`                                                                      |
| `ctx.db.delete(app.comments, id).wait(...)`                     | `await ctx.store.deleteComment(id)`                                                                         |
| `ctx.db.all(app.canvasElements.where({room}), ...)`             | `await ctx.store.listElements('live', room)`                                                                |
| `app.canvasDraftElements` reads/writes                          | `ctx.store.listElements('draft', room)` / `upsertElement('draft', ...)`                                     |
| element update `{data, version: current.version + 1}`           | `ctx.store.upsertElement(scope, {room, elementId, data, version: current.version + 1})`                     |
| element deletes by row id                                       | `ctx.store.deleteElement(scope, room, elementId)`                                                           |
| `db.subscribeAll(query, cb)` (enrich worker)                    | `store.onEvent` filtered on `event.table === 'comments' && event.type === 'upsert'`                         |
| cursor row writes (`markPresence`)                              | `ctx.store.cursor({...})`, keep the 50ms throttle; `stableUuid` machinery dies                              |
| `import type {JsonValue} from 'jazz-tools'`                     | `import type {JsonValue} from '../../shared/rows.js'`                                                       |
| `new Date()` in rows / `.getTime()` comparisons                 | `Date.now()` / plain number comparisons                                                                     |
| optional field `?? undefined`                                   | `?? null` (columns are nullable, not optional)                                                              |

- [ ] **Step 1: Rewrite `context.ts`**

```ts
import type {ToolRequest} from '@conciv/extension'
import type {Store} from './db/store.js'

export type WhiteboardToolContext = {
  cwd: string
  store: Store
  sessionId: (request: ToolRequest) => string
  room: (request: ToolRequest) => string
  model: (request: ToolRequest) => string | null
}
```

- [ ] **Step 2: Rewrite `server.ts`**

```ts
import {join} from 'node:path'
import {defineExtension, type ToolRequest} from '@conciv/extension'
import {WHITEBOARD_NAME, WHITEBOARD_PROMPT} from './shared/meta.js'
import {createStore} from './server/db/store.js'
import {registerRoutes} from './server/routes.js'
import {startCommentEnrichment} from './server/enrich-worker.js'
import {autoCommitDraft} from './server/auto-commit.js'
import {canvasTools} from './tool/canvas/server.js'
import {commentTools} from './tool/comment/server.js'
import {anchorTools} from './tool/anchor/server.js'
import {elementTools} from './tool/element/server.js'

export default defineExtension({
  name: WHITEBOARD_NAME,
  tools: [...canvasTools, ...commentTools, ...anchorTools, ...elementTools],
  systemPrompt: WHITEBOARD_PROMPT,
}).server(async (server) => {
  const store = await createStore(join(server.cwd, '.conciv', 'whiteboard'))
  registerRoutes(server.app, store)
  const stopEnrichment = startCommentEnrichment(store, server.cwd)
  const sessionId = (request: ToolRequest): string => {
    if (!request.sessionId) throw new Error('whiteboard tools require an active session')
    return request.sessionId
  }
  return {
    context: {cwd: server.cwd, store, sessionId, room: sessionId, model: (request) => request.model},
    turnEnd: (turnSessionId) =>
      void autoCommitDraft(store, turnSessionId).catch((error) =>
        console.error(`[whiteboard] auto-commit on turn end failed for ${turnSessionId}: ${String(error)}`),
      ),
    dispose: async () => {
      stopEnrichment()
      store.close()
    },
  }
})
```

(The `/config` route and the Jazz runner/deploy/backend plumbing die with this file.)

- [ ] **Step 3: Rewrite `auto-commit.ts`**

```ts
import {and, eq} from 'drizzle-orm'
import {canvasPending} from './db/schema.js'
import type {Store} from './db/store.js'

export async function autoCommitDraft(store: Store, room: string): Promise<boolean> {
  const drafts = await store.listElements('draft', room)
  if (!drafts.length) return false
  const pendingCommits = await store.db
    .select()
    .from(canvasPending)
    .where(and(eq(canvasPending.room, room), eq(canvasPending.kind, 'commit')))
  if (pendingCommits.length) return false
  await store.insertPending({id: crypto.randomUUID(), room, kind: 'commit', stage: 'live', payload: {}})
  return true
}
```

- [ ] **Step 4: Write `enrich-worker.ts`, delete `src/server/jazz/`**

The change-bus event already carries the typed `CommentRow` — no re-parsing needed:

```ts
import {z} from 'zod'
import type {JsonValue} from '../shared/rows.js'
import type {Store} from './db/store.js'
import {enrichAnchor} from '../tool/comment/anchor-enrich.js'

const SourceAnchor = z.object({source: z.object({file: z.string()})})

const enrichRow = async (store: Store, cwd: string, id: string, anchor: JsonValue): Promise<void> => {
  const enriched = await enrichAnchor(cwd, anchor)
  if (!enriched.hash) return
  await store.updateComment(id, {
    anchor: enriched.anchor ?? null,
    anchorFile: enriched.file ?? null,
    anchorComponent: enriched.component ?? null,
    anchorHash: enriched.hash,
    updatedAt: Date.now(),
  })
}

export const startCommentEnrichment = (store: Store, cwd: string): (() => void) => {
  const attempted = new Set<string>()
  return store.onEvent((event) => {
    if (event.table !== 'comments') return
    if (event.type === 'delete') return void attempted.delete(event.key)
    const row = event.row
    if (row.kind !== 'source-linked' || attempted.has(row.id) || row.anchorHash) return
    if (!SourceAnchor.safeParse(row.anchor).success) return
    attempted.add(row.id)
    void enrichRow(store, cwd, row.id, row.anchor)
  })
}
```

```bash
git rm -r packages/extensions/whiteboard/src/server/jazz
```

(If `enrichAnchor`'s return fields are typed `string | null | undefined`, the `?? null`
normalizes them; check `anchor-enrich.ts` signatures and match exactly.)

- [ ] **Step 5: Rewrite the three tool servers with the translation table**

`tool/canvas/server.ts` — all 12 tools, imports gain
`import {and, eq} from 'drizzle-orm'` + `import {canvasPending, canvasReplies} from '../../server/db/schema.js'`
where used:

- `canvasReadTool`: `const rows = await ctx.store.listElements(input.scope, ctx.room(request))`;
  return `{elements: rows.map((row) => row.data), scope: input.scope}`.
- `canvasSvgTool` / `canvasDrawTool` / `canvasDiagramTool` / `canvasConnectTool`: replace
  `ctx.db.insert(app.canvasPending, {...}).wait(...)` + `.value.id` with
  `const pending = await ctx.store.insertPending({id: crypto.randomUUID(), room: ctx.room(request), kind, stage: 'draft', payload: {...} as JsonValue})`
  and return `{pending: pending.id}` (payload shapes unchanged; `JsonValue` now from
  `../../shared/rows.js`).
- `canvasExportTool`: json branch reads
  `ctx.store.listElements(input.scope === 'draft' ? 'draft' : 'live', room)`. png branch:
  `insertPending({id: crypto.randomUUID(), room, kind: 'export', stage: 'live', payload: {requestId, scope: input.scope}})`,
  then poll every 250ms up to 10s:

```ts
const deadline = Date.now() + 10_000
while (Date.now() < deadline) {
  const [reply] = await ctx.store.db
    .select()
    .from(canvasReplies)
    .where(and(eq(canvasReplies.room, room), eq(canvasReplies.requestId, requestId)))
  if (reply) {
    const payload = reply.payload as unknown as {dataBase64?: string; error?: string; reason?: string}
    await ctx.store.deleteReply(reply.id)
    if (payload.error) return {error: payload.error, reason: payload.reason ?? 'unknown', scope: input.scope}
    return imageResult('image/png', payload.dataBase64 ?? '', {scope: input.scope})
  }
  await new Promise((resolve) => setTimeout(resolve, 250))
}
throw new Error('export timed out: no canvas tab is connected (canvas.preview works without one)')
```

- `canvasUpdateTool`: find in draft then live via
  `(await ctx.store.listElements('draft', room)).find((row) => row.elementId === input.elementId)`;
  merged data `Object.assign({}, current.data, input.patch) as JsonValue`; write
  `await ctx.store.upsertElement(scope, {room, elementId: input.elementId, data, version: current.version + 1})`.
- `canvasDeleteTool`: scope = draft hit ? `'draft'` : `'live'`;
  `await ctx.store.deleteElement(scope, room, input.elementId)`; return
  `{deleted: input.elementId}`.
- `canvasClearTool`: list live elements,
  `await ctx.store.deleteElements('live', room, elements.map((row) => row.elementId))`; then
  delete every pending row for the room:
  `for (const row of await ctx.store.db.select().from(canvasPending).where(eq(canvasPending.room, room))) await ctx.store.deletePending(row.id)`.
- `canvasCommitTool`: drafts via `listElements('draft', room)`; insertPending commit row
  (`{id: crypto.randomUUID(), room, kind: 'commit', stage: 'live', payload: {}}`); poll
  `listElements('draft', room)` every 250ms up to 15s until empty; timeout throws the existing
  message.
- `canvasDiscardTool`: `deleteElements('draft', room, draftIds)` + delete each `stage: 'draft'`
  pending row
  (`where(and(eq(canvasPending.room, room), eq(canvasPending.stage, 'draft')))`); keep the
  try/catch shape returning `{discarded: n}` / the error object.
- `canvasPreviewTool`: drafts via `listElements('draft', room)`; rest unchanged.

`tool/comment/server.ts` — all 8 tools, imports gain
`import {and, eq} from 'drizzle-orm'` + `import {comments, pins} from '../../server/db/schema.js'`:

- `commentByCid`:

```ts
const commentByCid = async (ctx: WhiteboardToolContext, sessionId: string, cid: string) => {
  const [row] = await ctx.store.db
    .select()
    .from(comments)
    .where(and(eq(comments.sessionId, sessionId), eq(comments.cid, cid)))
  if (!row) throw new Error(`comment ${cid} not found`)
  return row
}
```

`pinByCid` same shape on `pins` with `and(eq(pins.room, room), eq(pins.cid, cid))`.

- `markPresence`: keep `AGENT_COLOR`/`AGENT_THROTTLE_MS`/`lastPresence`; delete
  `toUuid`/`stableUuid`; the body becomes synchronous:

```ts
const markPresence = (
  ctx: WhiteboardToolContext,
  request: Parameters<WhiteboardToolContext['model']>[0],
  x: number,
  y: number,
): void => {
  const sessionId = ctx.sessionId(request)
  const model = ctx.model(request)
  const peerId = `agent:${model ?? 'ai'}`
  const key = `${sessionId}:${peerId}`
  const now = Date.now()
  if (now - (lastPresence.get(key) ?? 0) < AGENT_THROTTLE_MS) return
  lastPresence.set(key, now)
  ctx.store.cursor({
    room: sessionId,
    peerId,
    kind: 'agent',
    x,
    y,
    name: model ?? 'AI',
    color: AGENT_COLOR,
    lastSeen: now,
  })
}
```

- `commentCreateTool`: `const now = Date.now()`; after `enrichAnchor`, two awaited store calls —
  `insertComment` with `id: crypto.randomUUID()`, nullable fields `?? null`
  (`authorModel: input.authorModel ?? null`, `anchor: enriched.anchor ?? null`, etc.), then
  `insertPin` with `id: crypto.randomUUID()`, `elementId: input.elementId ?? null`; then
  `markPresence(...)`.
- `commentReplyTool`: `insertComment` with `parentId: input.cid`, `threadId: parent.threadId`,
  number timestamps; pin lookup via drizzle select on
  `and(eq(pins.room, ctx.room(request)), eq(pins.cid, parent.threadId))`; presence unchanged.
- `commentReadTool`: thread via select on
  `and(eq(comments.sessionId, sessionId), eq(comments.threadId, root.threadId))`; replies sort
  by `left.createdAt - right.createdAt`.
- `commentListTool`: select by `eq(comments.sessionId, sessionId)`; filters unchanged.
- `commentResolveTool`:
  `await ctx.store.updateComment(comment.id, {status: 'resolved', resolvedAt: now, updatedAt: now})`.
- `commentDeleteTool`: doomed rows via select;
  `for (const row of doomed) await ctx.store.deleteComment(row.id)`; when root, also delete pins
  found by select on `and(eq(pins.room, ctx.room(request)), eq(pins.cid, comment.cid))`.
- `commentMoveTool` / `pinSetStateTool`: `await ctx.store.updatePin(pin.id, {...})`.

`tool/anchor/server.ts` — replace the Jazz read:

```ts
const [row] = await ctx.store.db.select().from(comments).where(eq(comments.cid, input.cid))
```

(`tool/element/server.ts` has no db usage — just confirm it still compiles.)

- [ ] **Step 6: Typecheck + unit tests + grep**

```bash
pnpm turbo run typecheck --filter=@conciv/extension-whiteboard
pnpm --filter @conciv/extension-whiteboard exec vitest run test/rows.test.ts test/store.test.ts test/routes.test.ts test/canvas-prompt.test.ts test/canvas-svg-caps.test.ts test/canvas-draft-svg.test.ts
git grep -n "jazz" -- packages/extensions/whiteboard/src/server packages/extensions/whiteboard/src/tool packages/extensions/whiteboard/src/server.ts
```

Expected: clean typecheck, unit tests PASS, grep returns NOTHING.

- [ ] **Step 7: Commit**

```bash
git add -A packages/extensions/whiteboard/src/server packages/extensions/whiteboard/src/tool packages/extensions/whiteboard/src/server.ts
git commit -m "feat(whiteboard): server + tools on drizzle/libsql store, jazz server-side gone" -- packages/extensions/whiteboard/src/server packages/extensions/whiteboard/src/tool packages/extensions/whiteboard/src/server.ts
```

---

### Task 6: Client DB layer — TanStack DB query-collections + SSE + provider

**Files:**

- Create: `packages/extensions/whiteboard/src/client/db.tsx`
- Test: typecheck here — collection behavior is exercised end-to-end by the real-browser IT
  suite in Task 8 (node has no `EventSource`; repo forbids jsdom).

**Interfaces:**

- Consumes: routes (Task 4), wire schemas + types (Task 2).
- Produces:

```ts
createWhiteboardDb(base: string, room: string): WhiteboardDb
type WhiteboardDb = {
  canvasElements, canvasDraftElements,                    // Collection<ElementRow>, key = elementId
  canvasPending, canvasReplies, comments, pins, reads,    // Collection<Row>, key = id
  cursors: Accessor<Map<string, CursorEvent>>
  postCursor: (cursor: Omit<CursorEvent, 'room' | 'lastSeen'>) => void
  accountId: () => string
  base: string
  room: string
  dispose: () => void
}
WhiteboardDbProvider(props: {base: string; room: string; children: JSX.Element}): JSX.Element
useWhiteboardDb(): WhiteboardDb
```

- [ ] **Step 1: Implement `src/client/db.tsx`**

The documented query-collection pattern: `queryFn` = initial room load; SSE listeners apply
deltas via `utils.writeUpsert`/`writeDelete`; mutation handlers persist via REST, write the
server's authoritative response into the synced store, and return `{refetch: false}`; a dropped
SSE connection triggers `utils.refetch()` on every collection at reconnect. The self-reference
(`collection` used inside its own handlers) is the shape from the official docs — handlers only
run after creation. Wire payloads are zod-parsed at the boundary (never `as`-cast):

```tsx
import {createContext, createSignal, onCleanup, useContext, type Accessor, type JSX} from 'solid-js'
import {QueryClient} from '@tanstack/query-core'
import {createCollection} from '@tanstack/solid-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'
import {z} from 'zod'
import {
  changeOf,
  commentRow,
  cursorEvent,
  elementRow,
  pendingRow,
  pinRow,
  readRow,
  replyRow,
  type CursorEvent,
  type ElementRow,
} from '../shared/rows.js'

const request = async (input: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(input, {
    ...init,
    headers: init?.body ? {'content-type': 'application/json'} : undefined,
  })
  if (!response.ok && response.status !== 409) throw new Error(`whiteboard api ${response.status}: ${input}`)
  return response
}

const accountId = (): string => {
  const key = 'conciv-whiteboard-account-id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const fresh = crypto.randomUUID()
  localStorage.setItem(key, fresh)
  return fresh
}

const messageData = (event: Event): string | undefined =>
  event instanceof MessageEvent && typeof event.data === 'string' ? event.data : undefined

export function createWhiteboardDb(base: string, room: string) {
  const queryClient = new QueryClient()
  const source = new EventSource(`${base}/changes?room=${encodeURIComponent(room)}`)

  const idCollection = <Row extends {id: string}>(table: string, schema: z.ZodType<Row>) => {
    const rows = z.array(schema)
    const change = changeOf(schema)
    const collection = createCollection(
      queryCollectionOptions({
        queryKey: [table, room],
        queryClient,
        queryFn: async () =>
          rows.parse(await (await request(`${base}/${table}?room=${encodeURIComponent(room)}`)).json()),
        getKey: (row: Row) => row.id,
        onInsert: async ({transaction}) => {
          const saved = await Promise.all(
            transaction.mutations.map(async (mutation) =>
              schema.parse(
                await (
                  await request(`${base}/${table}`, {method: 'POST', body: JSON.stringify(mutation.modified)})
                ).json(),
              ),
            ),
          )
          collection.utils.writeBatch(() => saved.forEach((row) => collection.utils.writeUpsert(row)))
          return {refetch: false}
        },
        onUpdate: async ({transaction}) => {
          const saved = await Promise.all(
            transaction.mutations.map(async (mutation) =>
              schema.parse(
                await (
                  await request(`${base}/${table}/${String(mutation.key)}`, {
                    method: 'PUT',
                    body: JSON.stringify(mutation.changes),
                  })
                ).json(),
              ),
            ),
          )
          collection.utils.writeBatch(() => saved.forEach((row) => collection.utils.writeUpsert(row)))
          return {refetch: false}
        },
        onDelete: async ({transaction}) => {
          await Promise.all(
            transaction.mutations.map((mutation) =>
              request(`${base}/${table}/${String(mutation.key)}`, {method: 'DELETE'}),
            ),
          )
          return {refetch: false}
        },
      }),
    )
    source.addEventListener(table, (event) => {
      const data = messageData(event)
      if (!data) return
      const message = change.parse(JSON.parse(data))
      if (message.type === 'delete') return collection.utils.writeDelete(message.key)
      collection.utils.writeUpsert(message.row)
    })
    return collection
  }

  const elementCollection = (scope: 'live' | 'draft', table: 'canvasElements' | 'canvasDraftElements') => {
    const rows = z.array(elementRow)
    const change = changeOf(elementRow)
    const conflict = z.object({current: elementRow})
    const putElement = async (row: ElementRow): Promise<void> => {
      const response = await request(`${base}/elements/${scope}`, {method: 'PUT', body: JSON.stringify(row)})
      const saved =
        response.status === 409
          ? conflict.parse(await response.json()).current
          : elementRow.parse(await response.json())
      collection.utils.writeUpsert(saved)
    }
    const collection = createCollection(
      queryCollectionOptions({
        queryKey: [table, room],
        queryClient,
        queryFn: async () =>
          rows.parse(await (await request(`${base}/elements/${scope}?room=${encodeURIComponent(room)}`)).json()),
        getKey: (row: ElementRow) => row.elementId,
        onInsert: async ({transaction}) => {
          for (const mutation of transaction.mutations) await putElement(mutation.modified)
          return {refetch: false}
        },
        onUpdate: async ({transaction}) => {
          for (const mutation of transaction.mutations) await putElement(mutation.modified)
          return {refetch: false}
        },
        onDelete: async ({transaction}) => {
          await request(`${base}/elements/${scope}/bulk-delete`, {
            method: 'POST',
            body: JSON.stringify({room, elementIds: transaction.mutations.map((mutation) => String(mutation.key))}),
          })
          return {refetch: false}
        },
      }),
    )
    source.addEventListener(table, (event) => {
      const data = messageData(event)
      if (!data) return
      const message = change.parse(JSON.parse(data))
      if (message.type === 'delete') return collection.utils.writeDelete(message.key)
      collection.utils.writeUpsert(message.row)
    })
    return collection
  }

  const collections = {
    canvasElements: elementCollection('live', 'canvasElements'),
    canvasDraftElements: elementCollection('draft', 'canvasDraftElements'),
    canvasPending: idCollection('canvasPending', pendingRow),
    canvasReplies: idCollection('canvasReplies', replyRow),
    comments: idCollection('comments', commentRow),
    pins: idCollection('pins', pinRow),
    reads: idCollection('reads', readRow),
  }

  const [cursors, setCursors] = createSignal<Map<string, CursorEvent>>(new Map())
  source.addEventListener('cursor', (event) => {
    const data = messageData(event)
    if (!data) return
    const cursor = cursorEvent.parse(JSON.parse(data))
    setCursors((previous) => new Map(previous).set(cursor.peerId, cursor))
  })

  let dropped = false
  source.addEventListener('error', () => {
    dropped = true
  })
  source.addEventListener('open', () => {
    if (!dropped) return
    dropped = false
    Object.values(collections).forEach((collection) => void collection.utils.refetch())
  })

  const postCursor = (cursor: Omit<CursorEvent, 'room' | 'lastSeen'>): void =>
    void request(`${base}/cursor`, {
      method: 'POST',
      body: JSON.stringify({...cursor, room, lastSeen: Date.now()}),
    }).catch(() => undefined)

  return {
    ...collections,
    cursors,
    postCursor,
    accountId,
    base,
    room,
    dispose: () => source.close(),
  }
}

export type WhiteboardDb = ReturnType<typeof createWhiteboardDb>

const WhiteboardDbContext = createContext<WhiteboardDb>()

export function WhiteboardDbProvider(props: {base: string; room: string; children: JSX.Element}): JSX.Element {
  const db = createWhiteboardDb(props.base, props.room)
  onCleanup(() => db.dispose())
  return <WhiteboardDbContext.Provider value={db}>{props.children}</WhiteboardDbContext.Provider>
}

export function useWhiteboardDb(): WhiteboardDb {
  const db = useContext(WhiteboardDbContext)
  if (!db) throw new Error('useWhiteboardDb must be used inside a WhiteboardDbProvider')
  return db
}
```

One deliberate nuance: the elements `onUpdate` PUTs `mutation.modified` (the FULL new row, not
the partial) because the server's versioned upsert wants complete rows; on 409 the loser writes
the winning row into the synced store and its optimistic overlay drops — last-writer-wins with
no error surfaced. That is the spec'd conflict policy.

- [ ] **Step 2: Typecheck**

```bash
pnpm turbo run typecheck --filter=@conciv/extension-whiteboard
```

Expected: clean. If `queryCollectionOptions` rejects the `{refetch: false}` return or a `utils`
member name differs, STOP and re-read
`node_modules/@tanstack/query-db-collection/dist/*.d.ts` — fix against the real API, do not
loosen types.

- [ ] **Step 3: Commit**

```bash
git add packages/extensions/whiteboard/src/client/db.tsx
git commit -m "feat(whiteboard): tanstack db query-collections with sse direct writes" -- packages/extensions/whiteboard/src/client/db.tsx
```

---

### Task 7: Migrate the comments model (+ Date leaf fixes)

**Files:**

- Modify: `packages/extensions/whiteboard/src/client/model/comments.tsx`
- Modify: `packages/extensions/whiteboard/src/client/pins/thread.tsx` (one line)
- Modify: `packages/extensions/whiteboard/src/client/inbox.tsx` (one function)

**Interfaces:**

- Consumes: `useWhiteboardDb` (Task 6), `useLiveQuery` (`@tanstack/solid-db`),
  `CommentRow`/`PinRow` (Task 2).
- Produces: same exported names and model surface (`createCommentsModel`, `CommentsProvider`,
  `useComments`, `type Comment`, `type Pin`) — island/pins/thread/inbox consumers keep
  compiling, except timestamps become `number` and optionals become `| null`.

Point changes in `comments.tsx`:

1. Imports: drop `jazz-tools/solid`, `jazz-tools`, `../../shared/schema.js`. Add
   `import {useLiveQuery} from '@tanstack/solid-db'`,
   `import {useWhiteboardDb} from '../db.js'`,
   `import type {CommentRow, JsonValue, PinRow} from '../../shared/rows.js'`.
2. Delete the local `Comment`/`Pin` type literals; alias
   `export type Comment = CommentRow` and `export type Pin = PinRow`.
3. `newest` works on numbers:

```ts
const newest = (dates: number[]): number | undefined =>
  dates.reduce<number | undefined>((latest, date) => (date > (latest ?? -1) ? date : latest), undefined)
```

4. Reads (collections are already room-scoped — no `where`):

```ts
const db = useWhiteboardDb()
const commentRows = useLiveQuery((q) => q.from({row: db.comments}))
const pinRows = useLiveQuery((q) => q.from({row: db.pins}))
const readRows = useLiveQuery((q) => q.from({row: db.reads}))
const comments = (): CommentRow[] => commentRows() ?? []
const pins = (): PinRow[] => pinRows() ?? []
```

5. `accountId`: `const accountId = (): string => db.accountId()` (`useSession` dies; the
   `if (!self) return` guards may stay — `self` is always a string now).
6. Every `.getTime()` comparison becomes plain number comparison; every `new Date()` becomes
   `Date.now()`; `readAt`/`lastActivityAt`/`newestForeign` return `number | undefined`.
7. Writes:

```ts
const markRead = (threadId: string): void => {
  const self = accountId()
  const existing = (readRows() ?? []).find((row) => row.threadId === threadId && row.accountId === self)
  if (existing) return void db.reads.update(existing.id, (draft) => void (draft.lastReadAt = Date.now()))
  db.reads.insert({id: crypto.randomUUID(), sessionId: room(), threadId, accountId: self, lastReadAt: Date.now()})
}
```

- `movePin`: `db.pins.update(pin.id, (draft) => Object.assign(draft, patch))`
- `detachAnchor`:
  `db.comments.update(comment.id, (draft) => { draft.kind = 'floating'; draft.anchor = null; draft.anchorFile = null })`
- `createComment` (full null-explicit rows — the wire contract):

```ts
const cid = crypto.randomUUID()
const now = Date.now()
db.comments.insert({
  id: crypto.randomUUID(),
  sessionId: room(),
  cid,
  threadId: cid,
  parentId: null,
  parts: [{type: 'text', text}] as JsonValue,
  authorKind: 'human',
  authorModel: null,
  authorId: accountId(),
  authorName: null,
  authorAvatar: null,
  status: 'open',
  kind: target.source ? 'source-linked' : 'floating',
  anchor: target.source
    ? ({source: {file: target.source.file, line: target.source.line ?? 1, column: 1}} as JsonValue)
    : null,
  anchorFile: target.source?.file ?? null,
  anchorComponent: null,
  anchorHash: null,
  createdAt: now,
  updatedAt: now,
  resolvedAt: null,
})
db.pins.insert({
  id: crypto.randomUUID(),
  room: room(),
  cid,
  x: center.x,
  y: center.y,
  elementId: null,
  pinState: 'locked',
  anchorX: null,
  anchorY: null,
})
```

(The two `as JsonValue` here are pre-existing part/anchor JSON bridges, same class as the
Excalidraw ones — keep them, nothing else gains a cast.)

- `reply`: same full-row insert with `parentId: parent.cid`, `threadId: parent.threadId`,
  `kind: 'floating'`, `parts: toParts(segments)`, anchor fields all `null`.
- `resolve`:
  `db.comments.update(parent.id, (draft) => { draft.status = 'resolved'; draft.resolvedAt = now; draft.updatedAt = now })`
- `deleteThread`: per row `db.comments.delete(comment.id)`; pin via `db.pins.delete(pin.id)`.
- `removeComment`: `db.comments.delete(comment.id)`.

8. Leaf fixes: `thread.tsx` renders
   `<RelativeTime value={new Date(props.comment.createdAt)} .../>`; `inbox.tsx`
   `const activity = (): number => model.lastActivityAt(props.root.cid) ?? props.root.createdAt`
   (any further `Date` math there becomes number math — the typecheck finds every site).

- [ ] **Step 1: Apply the changes above**
- [ ] **Step 2: Typecheck, fix all fallout in pins/thread/inbox until clean**

```bash
pnpm turbo run typecheck --filter=@conciv/extension-whiteboard
```

- [ ] **Step 3: Commit**

```bash
git add packages/extensions/whiteboard/src/client
git commit -m "feat(whiteboard): comments model on tanstack collections, epoch-ms timestamps" -- packages/extensions/whiteboard/src/client
```

---

### Task 8: Migrate the island + overlay, delete jazz-client, run the IT suite

**Files:**

- Modify: `packages/extensions/whiteboard/src/canvas/island.tsx`
- Modify: `packages/extensions/whiteboard/src/client/overlay.tsx`
- Delete: `packages/extensions/whiteboard/src/client/jazz-client.tsx`

**Interfaces:**

- Consumes: `useWhiteboardDb`/`WhiteboardDbProvider` (Task 6).
- Produces: same `Island` props; overlay `Board` renders `WhiteboardDbProvider` (no config
  fetch, no auth gate).

Island point changes (keep the `guard`/`versions` echo-suppression mechanism exactly — it
already implements LWW echo handling):

1. Imports: drop `jazz-tools/solid`, `jazz-tools`, `../shared/schema.js`; add
   `import {createEffect} from 'solid-js'` (extend the existing solid import),
   `import {useWhiteboardDb} from '../client/db.js'`,
   `import type {CursorEvent, ElementRow, JsonValue, PendingRow} from '../shared/rows.js'`.
   Delete the local `ElementRow`/`PendingRow`/`CursorRow` types and the `toUuid`/`stableUuid`
   helpers. The `rowIds` map DIES (element rows key on `elementId`).
2. `const db = useWhiteboardDb()` at the top of `Island`. Element rows now carry `room` — build
   them with `props.room`.
3. `applyRemote`: identical logic minus the `rowIds` bookkeeping (delete `rowIds.clear()` and
   the `rowIds.set(...)` line).
4. Scene + pending subscriptions (replace the `db().subscribeAll(...)` blocks):

```ts
const snapshotElements = (): ElementRow[] => [...db.canvasElements.state.values()]
const sceneSubscription = db.canvasElements.subscribeChanges(() => applyRemote(snapshotElements()), {
  includeInitialState: true,
})
const pendingSubscription = db.canvasPending.subscribeChanges(
  () =>
    [...db.canvasPending.state.values()].forEach((row) => {
      if (draining.has(row.id)) return
      const drawable = row.kind === 'skeletons' || row.kind === 'mermaid' || row.kind === 'svg'
      if (!drawable && row.kind !== 'commit' && row.kind !== 'export') return
      draining.add(row.id)
      if (row.kind === 'commit') return void performCommit(row)
      if (row.kind === 'export') return void performExport(row)
      void drainPending(row)
    }),
  {includeInitialState: true},
)
```

`subscribeChanges` returns a subscription object — check its d.ts for the disposer
(`unsubscribe()`) and call both in the existing `onCleanup`.

5. Cursors: replace the cursors subscription + `sweepAgents` interval entirely with an effect
   over the signal (stale agent entries just get filtered by `lastSeen`):

```ts
const collaboratorsFrom = (rows: readonly CursorEvent[]): Map<SocketId, Collaborator> => {
  const now = Date.now()
  const map = new Map<SocketId, Collaborator>()
  rows
    .filter((cursor) => cursor.peerId !== props.self.peerId)
    .filter((cursor) => now - cursor.lastSeen < CURSOR_STALE_MS)
    .forEach((cursor) =>
      map.set(cursor.peerId as SocketId, {
        username: cursor.name,
        color: {background: cursor.color, stroke: cursor.color},
        pointer: {x: cursor.x, y: cursor.y, tool: 'pointer'},
      }),
    )
  return map
}
createEffect(() => api?.updateScene({collaborators: collaboratorsFrom([...db.cursors().values()])}))
```

(`cursor.peerId as SocketId` is a pre-existing branded-string bridge — keep it.)
`ensureAgentCursor`/`moveAgentCursor` collapse to:

```ts
const agentPeerId = `agent:${props.room}`
const agentCursor = (x: number, y: number): void =>
  db.postCursor({peerId: agentPeerId, kind: 'agent', name: 'drawing…', color: '#8a86e8', x, y})
```

`performCommit` passes `(x, y) => agentCursor(x, y)` to `replayDraft` directly (no cursorId
plumbing, no `.catch` scaffolding around cursor creation).

6. `writeLocal`: insert vs update by key presence:

```ts
changed.forEach((element) => {
  versions.set(element.id, element.version)
  const row = {room: props.room, elementId: element.id, data: asJson(element), version: element.version}
  if (db.canvasElements.has(element.id))
    return void db.canvasElements.update(element.id, (draft) => {
      draft.data = row.data
      draft.version = row.version
    })
  db.canvasElements.insert(row)
})
```

7. `drainPending`: one bulk PUT (raw fetch — the SSE echo lands the rows in the collection),
   then delete the pending row through its collection:

```ts
const drainPending = async (row: PendingRow): Promise<void> => {
  try {
    const drawn = convertToExcalidrawElements(await skeletonsOf(row), {regenerateIds: false})
    const rows = drawn.map((element) => ({
      room: props.room,
      elementId: element.id,
      data: asJson(element),
      version: element.version,
    }))
    const scope = row.stage === 'draft' ? 'draft' : 'live'
    await fetch(`${db.base}/elements/${scope}/bulk`, {
      method: 'PUT',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({rows}),
    })
  } catch (error) {
    console.error(`[whiteboard] draining pending ${row.kind} ${row.id} failed: ${String(error)}`)
  } finally {
    db.canvasPending.delete(row.id)
  }
}
```

(`skeletonsOf` keeps its shape; `PendingRow.stage` is now required, so the
`row.stage === 'draft'` check needs no optional handling.)

8. `commitStep` becomes synchronous (no `stableUuid`), writing through the collection:

```ts
const commitStep = (draft: ElementRow): ReplayStep => {
  const data = draft.data as unknown as {x?: number; y?: number}
  return {
    elementId: draft.elementId,
    x: data.x ?? 0,
    y: data.y ?? 0,
    write: (): void => {
      if (db.canvasElements.has(draft.elementId))
        return void db.canvasElements.update(draft.elementId, (target) => {
          target.data = draft.data
          target.version = draft.version
        })
      db.canvasElements.insert({room: props.room, elementId: draft.elementId, data: draft.data, version: draft.version})
    },
  }
}
```

`performCommit`: drafts from `[...db.canvasDraftElements.state.values()]`; `const steps =
ordered.map(commitStep)` (drop the `Promise.all`); `clearDraftRows` =
`ordered.forEach((draft) => db.canvasDraftElements.delete(draft.elementId))`; the finally block
deletes via `db.canvasPending.delete(row.id)`.

9. `gatherExportElements` draft read: `[...db.canvasDraftElements.state.values()]`.
   `performExport` reply insert:
   `db.canvasReplies.insert({id: crypto.randomUUID(), room: props.room, requestId, kind: 'export', payload})`;
   finally deletes the pending row via `db.canvasPending.delete(row.id)`.

Overlay point changes: `Board` drops `fetchJazzConfig`/`createResource`/`WhiteboardJazzProvider`
(remove the now-unused `createResource` import too):

```tsx
function Board(props: {
  api: ClientApi
  doc: Document
  visible: Accessor<boolean>
  self: Self
  close: () => void
  registerComment: (write: (pick: CommentPick) => void) => void
}): JSX.Element {
  return (
    <Show when={props.api.activeSession()} keyed fallback={<SessionPending />}>
      {(session) => (
        <WhiteboardDbProvider base={`${props.api.apiBase}/api/ext/whiteboard`} room={session}>
          <Canvas
            api={props.api}
            doc={props.doc}
            visible={props.visible}
            room={() => session}
            self={props.self}
            close={props.close}
            registerComment={props.registerComment}
          />
        </WhiteboardDbProvider>
      )}
    </Show>
  )
}
```

- [ ] **Step 1: Apply island changes**
- [ ] **Step 2: Apply overlay changes, `git rm packages/extensions/whiteboard/src/client/jazz-client.tsx`**
- [ ] **Step 3: Typecheck, build, run the full IT suite (behavior-parity gate)**

```bash
pnpm turbo run typecheck --filter=@conciv/extension-whiteboard
pnpm turbo run build --filter=@conciv/extension-whiteboard --filter=@conciv/core --filter=@conciv/widget
pnpm --filter @conciv/extension-whiteboard test
```

Expected: every existing IT passes unchanged — `canvas-draft`, `canvas-commit`,
`canvas-autocommit`, `canvas-drag`, `canvas-export-png`, `canvas-preview`, `canvas-quiescent`,
`inbox*`, `thread*`, `pin-pan`. Debug loop: `console.error` the SSE deltas server-side and dump
`store.db` state in the test process. Keep waits tight; do not raise IT timeouts to pass.

- [ ] **Step 4: Commit**

```bash
git add -A packages/extensions/whiteboard/src
git commit -m "feat(whiteboard): island + overlay on tanstack db, jazz client gone" -- packages/extensions/whiteboard/src
```

---

### Task 9: Delete Jazz remnants, package cleanup

**Files:**

- Delete: `packages/extensions/whiteboard/src/shared/schema.ts`,
  `packages/extensions/whiteboard/src/shared/permissions.ts`
- Modify: `packages/extensions/whiteboard/package.json`

- [ ] **Step 1: Delete files**

```bash
git rm packages/extensions/whiteboard/src/shared/schema.ts packages/extensions/whiteboard/src/shared/permissions.ts
```

- [ ] **Step 2: Package cleanup**

- Remove `jazz-tools` and `jazz-napi` from `dependencies`.
- `build` script: drop the
  `&& mkdir -p dist/shared && cp src/shared/schema.ts src/shared/permissions.ts dist/shared/`
  tail (that was the Jazz deploy input).
- `description`: replace the "self-hosted Jazz CRDT db" clause with "a local drizzle/libSQL db
  with an SSE-fed TanStack DB client".

```bash
pnpm install
```

- [ ] **Step 3: Anti-pattern grep — prove the old path is gone**

```bash
git grep -in "jazz" -- packages/extensions/whiteboard
git grep -rn "useAll\|useDb\|subscribeAll\|jazz-tools" -- packages/extensions/whiteboard/src packages/extensions/whiteboard/test
```

Expected: zero hits in code. Green tests alone don't prove adoption — the grep does.

- [ ] **Step 4: Full gate**

```bash
pnpm typecheck && pnpm build && pnpm --filter @conciv/extension-whiteboard test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A packages/extensions/whiteboard pnpm-lock.yaml
git commit -m "feat(whiteboard)!: drop jazz — drizzle/libsql + tanstack db is the only sync path" -- packages/extensions/whiteboard pnpm-lock.yaml
```

---

### Task 10: Repo-wide verification + changeset

**Files:**

- Create: `.changeset/whiteboard-tanstack-db.md`

- [ ] **Step 1: Fallow audit**

```bash
pnpm exec fallow audit --changed-since main --format json
```

Fix everything flagged INTRODUCED (dead exports from deleted Jazz plumbing are the likely
hits). Before deleting any flagged export:
`pnpm exec fallow dead-code --trace 'file.ts:Symbol'`.

- [ ] **Step 2: Full monorepo gate**

```bash
pnpm typecheck && pnpm build && pnpm test
```

Expected: green.

- [ ] **Step 3: Changeset**

`.changeset/whiteboard-tanstack-db.md`:

```md
---
'@conciv/extension-whiteboard': patch
---

Replace the Jazz CRDT backend with an in-process drizzle/libSQL database, explicit zod-validated
REST routes, an SSE change feed, and TanStack DB query-collections in the client. No more Jazz
sync server, deploy step, or secrets; conflict policy is server-ordered per-element versioned
last-writer-wins.
```

(Fixed versioning: one changeset bumps all `@conciv/*` in lockstep.)

- [ ] **Step 4: Commit + verify against the live app**

```bash
git add .changeset/whiteboard-tanstack-db.md
git commit -m "chore: changeset for whiteboard drizzle/libsql migration" -- .changeset/whiteboard-tanstack-db.md
```

Then run the `verify` skill against the live app: `pnpm dev` (server restart required —
server-side changes don't hot-reload), open the widget in two tabs, draw in one and confirm the
other follows, ask the agent to draw, add a comment + pin, resolve it, reload and confirm
persistence under `.conciv/whiteboard/whiteboard.db`.

---

## Self-review notes

- The client uses `@tanstack/query-db-collection`, not a hand-rolled `SyncConfig`: the official
  query-collection docs name SSE-fed direct writes (`writeUpsert`/`writeDelete`/`writeBatch`)
  plus `{refetch: false}` mutation handlers as the intended pattern for exactly this shape, and
  it eliminates the echo-await machinery a custom sync implementation would need.
- Row types are `| null` end-to-end (the drizzle `$inferSelect` shape). There is no
  `null → undefined` conversion layer anywhere; the `expectTypeOf` test pins the zod wire
  schemas to the drizzle tables so they cannot drift silently.
- Explicit per-table routes and store helpers were chosen over generic table-name dispatch on
  purpose: drizzle's inference only holds against concrete tables — the zero-cast constraint is
  the design, not an accident.
- Element tables have no synthetic row id (composite PK `room+elementId`); the island's
  `rowIds`/`stableUuid` machinery is deleted, not ported.
- The `cursors` table is gone entirely; presence is broadcast-only (`POST /cursor` → SSE), agent
  presence from tools emits on the bus server-side, and the island's stale-sweep interval is
  replaced by filtering on `lastSeen`.
- Timestamps are epoch-ms numbers; the two Date-rendering leaves construct `new Date(n)`
  locally.
- The old spec at `docs/superpowers/specs/2026-07-07-whiteboard-jazz-to-tanstack-db-design.md`
  still describes the abandoned `node:sqlite` stack; this plan supersedes it (delete or rewrite
  the spec separately if it is kept around).
