# Whiteboard Jazz-to-TanStack-DB Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task (this project's convention is inline execution, no subagents). Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Jazz CRDT in `packages/extensions/whiteboard` with Drizzle on `node:sqlite`,
zod REST routes + SSE deltas on the extension server, and TanStack DB query collections in the
Solid client.

**Architecture:** One process is the authority: the extension server owns a SQLite file, every
write (browser HTTP or agent tool call) goes through a store module that emits `RowChange` events;
an SSE route streams them per room; clients hold TanStack DB collections that load via `queryFn`,
apply SSE deltas via `writeUpsert`/`writeDelete`, and mutate optimistically. Elements use version
gating (higher version wins); cursors are broadcast-only, never stored.

**Tech Stack:** `node:sqlite` (builtin), `drizzle-orm/node-sqlite` + `drizzle-kit`, h3 v2
(`2.0.1-rc.22`, already the extension server), zod v4, `@tanstack/db` + `@tanstack/solid-db` +
`@tanstack/query-db-collection` + `@tanstack/query-core`, Solid, Excalidraw (unchanged).

**Spec:** `docs/superpowers/specs/2026-07-07-whiteboard-jazz-to-tanstack-db-design.md`

## Global Constraints

- Node floor: root `package.json` `engines.node` becomes `>=22.13` (was `>=22`).
- All work stays inside `packages/extensions/whiteboard` except the root `engines` bump.
- Code style: functions not classes, no IIFEs, ZERO comments, no `any`/`as` (existing
  `as unknown as` bridges for Excalidraw JSON may stay), oxfmt (no semicolons, single quotes,
  printWidth 120), no `else` where guard-returns work, no non-null assertions.
- `vitest.config.ts` must keep `test: {environment: 'node'}` (vite-plugin-solid injects jsdom
  otherwise and the run exits 1).
- Build/typecheck via turbo: `pnpm turbo run build --filter=@conciv/extension-whiteboard`,
  never hand-rebuild `dist/`.
- Commit with pathspec always: `git commit -m "..." -- <paths>`.
- Behavior parity: the existing IT suite under `packages/extensions/whiteboard/test/` must pass
  unchanged (it asserts observable UI/tool behavior, not Jazz internals).
- Timestamps become integer epoch millis end-to-end (`Date.now()`), never `Date` objects in rows.
- Existing widget/e2e rule: after client changes rebuild the widget before widget ITs
  (`pnpm turbo run build --filter=@conciv/widget`).

---

### Task 1: Dependencies and engines floor

**Files:**

- Modify: `package.json` (repo root, `engines` only)
- Modify: `packages/extensions/whiteboard/package.json`

Jazz deps stay until Task 9 (old code still imports them; the tree must typecheck at every
commit).

- [ ] **Step 1: Bump root engines**

In root `package.json` change `"node": ">=22"` to `"node": ">=22.13"`.

- [ ] **Step 2: Add new dependencies**

```bash
cd /Users/omrikatz/Public/web/aidx
pnpm --filter @conciv/extension-whiteboard add drizzle-orm @tanstack/db @tanstack/solid-db @tanstack/query-db-collection @tanstack/query-core
pnpm --filter @conciv/extension-whiteboard add -D drizzle-kit
```

- [ ] **Step 3: Sanity-check imports resolve**

```bash
node -e "const {DatabaseSync} = require('node:sqlite'); new DatabaseSync(':memory:'); console.log('sqlite ok')"
pnpm --filter @conciv/extension-whiteboard exec node -e "import('drizzle-orm/node-sqlite').then(m => console.log('drizzle ok', typeof m.drizzle))"
```

Expected: `sqlite ok`, `drizzle ok function`. If `drizzle-orm/node-sqlite` does not resolve, the
installed drizzle-orm is too old — check `pnpm why drizzle-orm` and raise the version; do NOT fall
back to better-sqlite3.

- [ ] **Step 4: Commit**

```bash
git add package.json packages/extensions/whiteboard/package.json pnpm-lock.yaml
git commit -m "chore(whiteboard): add drizzle + tanstack db deps, node >=22.13" -- package.json packages/extensions/whiteboard/package.json pnpm-lock.yaml
```

---

### Task 2: Shared row schemas (zod source of truth)

**Files:**

- Create: `packages/extensions/whiteboard/src/shared/rows.ts`
- Test: `packages/extensions/whiteboard/test/rows.test.ts`

**Interfaces:**

- Produces: `JsonValue` type; zod schemas `elementRow`, `pendingRow`, `replyRow`, `commentRow`,
  `pinRow`, `readRow`, `cursorEvent`, `rowChange`; inferred types `ElementRow`, `PendingRow`,
  `ReplyRow`, `CommentRow`, `PinRow`, `ReadRow`, `CursorEvent`, `RowChange`; `ID_TABLES` /
  `IdTableName` / `ElementScope` unions. Every later task imports rows from here.

- [ ] **Step 1: Write the failing test**

`test/rows.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {commentRow, elementRow, rowChange} from '../src/shared/rows.js'

describe('shared row schemas', () => {
  it('parses an element row and rejects a bad version', () => {
    const row = {room: 'r1', elementId: 'e1', data: {type: 'rectangle'}, version: 3}
    expect(elementRow.parse(row)).toEqual(row)
    expect(() => elementRow.parse({...row, version: 'x'})).toThrow()
  })
  it('parses a comment row with epoch-millis timestamps', () => {
    const now = 1_700_000_000_000
    const row = {
      id: 'c1',
      sessionId: 's1',
      cid: 'cid1',
      threadId: 'cid1',
      parts: [{type: 'text', text: 'hi'}],
      authorKind: 'human',
      status: 'open',
      kind: 'floating',
      createdAt: now,
      updatedAt: now,
    }
    expect(commentRow.parse(row).createdAt).toBe(now)
  })
  it('discriminates row changes', () => {
    const change = rowChange.parse({table: 'comments', kind: 'delete', room: 'r1', id: 'c1'})
    expect(change.kind).toBe('delete')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @conciv/extension-whiteboard exec vitest run test/rows.test.ts
```

Expected: FAIL (cannot resolve `../src/shared/rows.js`).

- [ ] **Step 3: Write the module**

`src/shared/rows.ts`:

```ts
import {z} from 'zod'

export type JsonValue = string | number | boolean | null | JsonValue[] | {[key: string]: JsonValue}

const json: z.ZodType<JsonValue> = z.lazy(() =>
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
  stage: z.enum(['draft', 'live']).default('live'),
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
  parentId: z.string().optional(),
  parts: json,
  authorKind: z.enum(['human', 'ai']),
  authorModel: z.string().optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  authorAvatar: z.string().optional(),
  status: z.enum(['open', 'resolved', 'drifted', 'orphaned']).default('open'),
  kind: z.enum(['source-linked', 'floating']),
  anchor: json.optional(),
  anchorFile: z.string().optional(),
  anchorComponent: z.string().optional(),
  anchorHash: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  resolvedAt: z.number().int().optional(),
})

export const pinRow = z.object({
  id: z.string(),
  room: z.string(),
  cid: z.string(),
  x: z.number(),
  y: z.number(),
  elementId: z.string().optional(),
  pinState: z.enum(['locked', 'offset']).default('locked'),
  anchorX: z.number().optional(),
  anchorY: z.number().optional(),
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
  kind: z.enum(['human', 'agent']).default('human'),
  x: z.number(),
  y: z.number(),
  name: z.string(),
  color: z.string(),
  lastSeen: z.number().int(),
})

export const ID_TABLES = ['canvasPending', 'canvasReplies', 'comments', 'pins', 'reads'] as const
export type IdTableName = (typeof ID_TABLES)[number]
export type ElementScope = 'live' | 'draft'
export type ElementTableName = 'canvasElements' | 'canvasDraftElements'
export type TableName = IdTableName | ElementTableName

export const idRowSchemas = {
  canvasPending: pendingRow,
  canvasReplies: replyRow,
  comments: commentRow,
  pins: pinRow,
  reads: readRow,
} as const

export const rowChange = z.discriminatedUnion('kind', [
  z.object({
    table: z.enum([
      'canvasElements',
      'canvasDraftElements',
      'canvasPending',
      'canvasReplies',
      'comments',
      'pins',
      'reads',
    ]),
    kind: z.literal('upsert'),
    room: z.string(),
    row: json,
  }),
  z.object({
    table: z.enum([
      'canvasElements',
      'canvasDraftElements',
      'canvasPending',
      'canvasReplies',
      'comments',
      'pins',
      'reads',
    ]),
    kind: z.literal('delete'),
    room: z.string(),
    id: z.string(),
  }),
])

export type ElementRow = z.infer<typeof elementRow>
export type PendingRow = z.infer<typeof pendingRow>
export type ReplyRow = z.infer<typeof replyRow>
export type CommentRow = z.infer<typeof commentRow>
export type PinRow = z.infer<typeof pinRow>
export type ReadRow = z.infer<typeof readRow>
export type CursorEvent = z.infer<typeof cursorEvent>
export type RowChange = z.infer<typeof rowChange>
export type IdRowOf<T extends IdTableName> = z.infer<(typeof idRowSchemas)[T]>
```

Note the element tables have NO `id` column: they key on `(room, elementId)`. The `delete` change
variant carries the row key in `id` (for element tables that is the `elementId`).

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @conciv/extension-whiteboard exec vitest run test/rows.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/whiteboard/src/shared/rows.ts packages/extensions/whiteboard/test/rows.test.ts
git commit -m "feat(whiteboard): shared zod row schemas for sqlite rows" -- packages/extensions/whiteboard/src/shared/rows.ts packages/extensions/whiteboard/test/rows.test.ts
```

---

### Task 3: Drizzle schema, migration, store with CRUD + change bus

**Files:**

- Create: `packages/extensions/whiteboard/drizzle.config.ts`
- Create: `packages/extensions/whiteboard/src/server/db/schema.ts`
- Create: `packages/extensions/whiteboard/src/server/db/store.ts`
- Create: `packages/extensions/whiteboard/drizzle/` (generated SQL, committed)
- Modify: `packages/extensions/whiteboard/package.json` (`files` gains `"drizzle"`)
- Test: `packages/extensions/whiteboard/test/store.test.ts`

**Interfaces:**

- Consumes: everything from `src/shared/rows.ts` (Task 2).
- Produces: `createStore(dataDir: string): Store` where `Store` =

```ts
type ElementUpsert = {ok: true; row: ElementRow} | {ok: false; current: ElementRow}
type WhiteboardEvent = RowChange | {kind: 'cursor'; room: string; cursor: CursorEvent}
type Store = {
  listElements: (scope: ElementScope, room: string) => ElementRow[]
  upsertElement: (scope: ElementScope, row: ElementRow) => ElementUpsert
  upsertElements: (scope: ElementScope, rows: ElementRow[]) => ElementRow[]
  deleteElement: (scope: ElementScope, room: string, elementId: string) => boolean
  deleteElements: (scope: ElementScope, room: string, elementIds: string[]) => number
  list: <T extends IdTableName>(table: T, where: Partial<IdRowOf<T>>) => IdRowOf<T>[]
  insert: <T extends IdTableName>(table: T, row: Omit<IdRowOf<T>, 'id'> & {id?: string}) => IdRowOf<T>
  update: <T extends IdTableName>(table: T, id: string, patch: Partial<IdRowOf<T>>) => IdRowOf<T> | undefined
  remove: (table: IdTableName, id: string) => boolean
  cursor: (event: CursorEvent) => void
  onEvent: (listener: (event: WhiteboardEvent) => void) => () => void
  close: () => void
}
```

- [ ] **Step 1: Write drizzle schema**

`src/server/db/schema.ts`:

```ts
import {integer, primaryKey, real, sqliteTable, text} from 'drizzle-orm/sqlite-core'
import type {CommentRow, ElementRow, JsonValue, PendingRow, PinRow, ReadRow, ReplyRow} from '../../shared/rows.js'

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

type Nullable<T> = {[K in keyof T]: T[K] | null}
const assertElement: ElementRow = {} as typeof canvasElements.$inferSelect
const assertPending: Nullable<PendingRow> = {} as Nullable<typeof canvasPending.$inferSelect>
const assertReply: Nullable<ReplyRow> = {} as Nullable<typeof canvasReplies.$inferSelect>
const assertComment: Nullable<Required<CommentRow>> = {} as Nullable<typeof comments.$inferSelect>
const assertPin: Nullable<Required<PinRow>> = {} as Nullable<typeof pins.$inferSelect>
const assertRead: Nullable<ReadRow> = {} as Nullable<typeof reads.$inferSelect>
```

If the assignability assertions fight (drizzle `$inferSelect` uses `| null` where zod uses
`.optional()`), keep the spirit: a compile error when a column is added/renamed on one side only.
Adjust the helper types until `pnpm --filter @conciv/extension-whiteboard typecheck` is clean, or
replace them with an `expectTypeOf` type test in `test/store.test.ts` — do not delete the check.
The store normalizes `null` → `undefined` at read time (Step 3) so runtime rows match the zod
types exactly.

- [ ] **Step 2: Generate the migration**

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
cd /Users/omrikatz/Public/web/aidx/packages/extensions/whiteboard
pnpm exec drizzle-kit generate --name whiteboard-init
ls drizzle
```

Expected: `0000_whiteboard-init.sql` + `meta/` journal. Open the SQL and eyeball: 7 tables,
composite PK on both element tables.

Add `"drizzle"` to the `files` array in `packages/extensions/whiteboard/package.json` (ships with
the npm package).

- [ ] **Step 3: Write the failing store test**

`test/store.test.ts`:

```ts
import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {createStore, type Store} from '../src/server/db/store.js'
import type {WhiteboardEvent} from '../src/server/db/store.js'

const stores: Store[] = []
const open = (): Store => {
  const store = createStore(realpathSync(mkdtempSync(join(tmpdir(), 'wb-store-'))))
  stores.push(store)
  return store
}
afterEach(() => stores.splice(0).forEach((store) => store.close()))

describe('whiteboard store', () => {
  it('inserts, lists, updates, removes id-table rows and emits events', () => {
    const store = open()
    const events: WhiteboardEvent[] = []
    store.onEvent((event) => events.push(event))
    const row = store.insert('comments', {
      sessionId: 's1',
      cid: 'c1',
      threadId: 'c1',
      parts: [{type: 'text', text: 'hi'}],
      authorKind: 'human',
      status: 'open',
      kind: 'floating',
      createdAt: 1000,
      updatedAt: 1000,
    })
    expect(row.id).toBeTruthy()
    expect(store.list('comments', {sessionId: 's1'})).toHaveLength(1)
    const updated = store.update('comments', row.id, {status: 'resolved', resolvedAt: 2000})
    expect(updated?.status).toBe('resolved')
    expect(store.remove('comments', row.id)).toBe(true)
    expect(store.list('comments', {sessionId: 's1'})).toHaveLength(0)
    expect(events.map((event) => event.kind)).toEqual(['upsert', 'upsert', 'delete'])
  })

  it('gates element upserts by version', () => {
    const store = open()
    const base = {room: 'r1', elementId: 'e1', data: {type: 'rectangle'}, version: 2}
    expect(store.upsertElement('live', base).ok).toBe(true)
    const stale = store.upsertElement('live', {...base, version: 1, data: {type: 'ellipse'}})
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.current.version).toBe(2)
    expect(store.upsertElement('live', {...base, version: 3}).ok).toBe(true)
    expect(store.listElements('live', 'r1')).toEqual([{...base, version: 3}])
  })

  it('same-base-version race: exactly one write wins', () => {
    const store = open()
    store.upsertElement('live', {room: 'r1', elementId: 'e1', data: {}, version: 1})
    const first = store.upsertElement('live', {room: 'r1', elementId: 'e1', data: {a: 1}, version: 2})
    const second = store.upsertElement('live', {room: 'r1', elementId: 'e1', data: {b: 2}, version: 2})
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(false)
    expect(store.listElements('live', 'r1')[0]?.data).toEqual({a: 1})
  })

  it('bulk upsert and bulk delete cover the pending drain', () => {
    const store = open()
    const rows = [
      {room: 'r1', elementId: 'e1', data: {}, version: 1},
      {room: 'r1', elementId: 'e2', data: {}, version: 1},
    ]
    expect(store.upsertElements('draft', rows)).toHaveLength(2)
    expect(store.deleteElements('draft', 'r1', ['e1', 'e2'])).toBe(2)
    expect(store.listElements('draft', 'r1')).toHaveLength(0)
  })

  it('cursor events broadcast without persisting', () => {
    const store = open()
    const events: WhiteboardEvent[] = []
    store.onEvent((event) => events.push(event))
    store.cursor({room: 'r1', peerId: 'p1', kind: 'human', x: 1, y: 2, name: 'G', color: '#fff', lastSeen: 1000})
    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe('cursor')
  })

  it('persists across reopen from the same dataDir', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wb-persist-')))
    const first = createStore(dir)
    first.upsertElement('live', {room: 'r1', elementId: 'e1', data: {}, version: 1})
    first.close()
    const second = createStore(dir)
    stores.push(second)
    expect(second.listElements('live', 'r1')).toHaveLength(1)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

```bash
pnpm --filter @conciv/extension-whiteboard exec vitest run test/store.test.ts
```

Expected: FAIL (cannot resolve `../src/server/db/store.js`).

- [ ] **Step 5: Write the store**

`src/server/db/store.ts`:

```ts
import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {DatabaseSync} from 'node:sqlite'
import {and, eq, inArray} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrate} from 'drizzle-orm/node-sqlite/migrator'
import type {CursorEvent, ElementRow, ElementScope, IdRowOf, IdTableName, RowChange} from '../../shared/rows.js'
import {canvasDraftElements, canvasElements, canvasPending, canvasReplies, comments, pins, reads} from './schema.js'

export type WhiteboardEvent = RowChange | {kind: 'cursor'; room: string; cursor: CursorEvent}
export type ElementUpsert = {ok: true; row: ElementRow} | {ok: false; current: ElementRow}
export type Store = ReturnType<typeof createStore>

const idTables = {canvasPending, canvasReplies, comments, pins, reads} as const
const roomColumnOf = {
  canvasPending: 'room',
  canvasReplies: 'room',
  comments: 'sessionId',
  pins: 'room',
  reads: 'sessionId',
} as const
const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url))

const stripNulls = <T extends Record<string, unknown>>(row: T): T =>
  Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)) as T

export const createStore = (dataDir: string) => {
  mkdirSync(dataDir, {recursive: true})
  const client = new DatabaseSync(join(dataDir, 'whiteboard.db'))
  client.exec('pragma journal_mode = wal')
  const db = drizzle({client})
  migrate(db, {migrationsFolder})

  const listeners = new Set<(event: WhiteboardEvent) => void>()
  const emit = (event: WhiteboardEvent): void => listeners.forEach((listener) => listener(event))

  const elementTable = (scope: ElementScope) => (scope === 'draft' ? canvasDraftElements : canvasElements)
  const elementTableName = (scope: ElementScope) =>
    (scope === 'draft' ? 'canvasDraftElements' : 'canvasElements') as const

  const listElements = (scope: ElementScope, room: string): ElementRow[] => {
    const table = elementTable(scope)
    return db.select().from(table).where(eq(table.room, room)).all()
  }

  const upsertElement = (scope: ElementScope, row: ElementRow): ElementUpsert => {
    const table = elementTable(scope)
    const current = db
      .select()
      .from(table)
      .where(and(eq(table.room, row.room), eq(table.elementId, row.elementId)))
      .get()
    if (current && current.version >= row.version) return {ok: false, current}
    db.insert(table)
      .values(row)
      .onConflictDoUpdate({target: [table.room, table.elementId], set: {data: row.data, version: row.version}})
      .run()
    emit({table: elementTableName(scope), kind: 'upsert', room: row.room, row})
    return {ok: true, row}
  }

  const upsertElements = (scope: ElementScope, rows: ElementRow[]): ElementRow[] =>
    rows.flatMap((row) => {
      const outcome = upsertElement(scope, row)
      return outcome.ok ? [outcome.row] : []
    })

  const deleteElement = (scope: ElementScope, room: string, elementId: string): boolean => {
    const table = elementTable(scope)
    const gone = db
      .delete(table)
      .where(and(eq(table.room, room), eq(table.elementId, elementId)))
      .run().changes
    if (gone > 0) emit({table: elementTableName(scope), kind: 'delete', room, id: elementId})
    return gone > 0
  }

  const deleteElements = (scope: ElementScope, room: string, elementIds: string[]): number =>
    elementIds.filter((elementId) => deleteElement(scope, room, elementId)).length

  const roomOf = <T extends IdTableName>(table: T, row: Record<string, unknown>): string =>
    String(row[roomColumnOf[table]])

  const list = <T extends IdTableName>(table: T, where: Partial<IdRowOf<T>>): IdRowOf<T>[] => {
    const target = idTables[table]
    const clauses = Object.entries(where).map(([column, value]) => eq(target[column as keyof typeof target], value))
    const rows = clauses.length
      ? db
          .select()
          .from(target)
          .where(and(...clauses))
          .all()
      : db.select().from(target).all()
    return rows.map((row) => stripNulls(row as Record<string, unknown>)) as IdRowOf<T>[]
  }

  const insert = <T extends IdTableName>(table: T, row: Omit<IdRowOf<T>, 'id'> & {id?: string}): IdRowOf<T> => {
    const full = {...row, id: row.id ?? crypto.randomUUID()}
    db.insert(idTables[table]).values(full).onConflictDoUpdate({target: idTables[table].id, set: full}).run()
    const saved = full as IdRowOf<T>
    emit({table, kind: 'upsert', room: roomOf(table, saved), row: saved})
    return saved
  }

  const update = <T extends IdTableName>(table: T, id: string, patch: Partial<IdRowOf<T>>): IdRowOf<T> | undefined => {
    const target = idTables[table]
    db.update(target).set(patch).where(eq(target.id, id)).run()
    const row = db.select().from(target).where(eq(target.id, id)).get()
    if (!row) return undefined
    const saved = stripNulls(row as Record<string, unknown>) as IdRowOf<T>
    emit({table, kind: 'upsert', room: roomOf(table, saved), row: saved})
    return saved
  }

  const remove = (table: IdTableName, id: string): boolean => {
    const target = idTables[table]
    const row = db.select().from(target).where(eq(target.id, id)).get()
    if (!row) return false
    db.delete(target).where(eq(target.id, id)).run()
    emit({table, kind: 'delete', room: roomOf(table, row as Record<string, unknown>), id})
    return true
  }

  const cursor = (event: CursorEvent): void => emit({kind: 'cursor', room: event.room, cursor: event})

  const onEvent = (listener: (event: WhiteboardEvent) => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    listElements,
    upsertElement,
    upsertElements,
    deleteElement,
    deleteElements,
    list,
    insert,
    update,
    remove,
    cursor,
    onEvent,
    close: () => client.close(),
  }
}
```

Two integration realities to resolve while making this compile (both are contained here):

1. `migrationsFolder` resolution differs between `src` (tests, `../../../drizzle`) and `dist`
   (bundled by tsdown). Check `tsdown.config.ts`: if the server build flattens to `dist/server.js`,
   the URL from `dist` is `../drizzle`, which is WRONG relative to `src`. Fix by resolving both
   candidates and picking the one that exists (`existsSync`), still no config flag needed.
2. If `drizzle-orm/node-sqlite/migrator` does not exist in the installed version, use the exported
   `migrate` from `drizzle-orm/node-sqlite` (newer versions re-export it); as a last resort read
   the journal at `drizzle/meta/_journal.json` and `client.exec` each SQL file in order — 15 lines,
   deterministic, and the test from Step 3 proves it.

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter @conciv/extension-whiteboard exec vitest run test/store.test.ts test/rows.test.ts
pnpm --filter @conciv/extension-whiteboard typecheck
```

Expected: PASS, clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add packages/extensions/whiteboard/drizzle.config.ts packages/extensions/whiteboard/drizzle packages/extensions/whiteboard/src/server/db packages/extensions/whiteboard/test/store.test.ts packages/extensions/whiteboard/package.json
git commit -m "feat(whiteboard): drizzle schema + sqlite store with change bus" -- packages/extensions/whiteboard/drizzle.config.ts packages/extensions/whiteboard/drizzle packages/extensions/whiteboard/src/server/db packages/extensions/whiteboard/test/store.test.ts packages/extensions/whiteboard/package.json
```

---

### Task 4: REST routes + SSE change feed

**Files:**

- Create: `packages/extensions/whiteboard/src/server/routes.ts`
- Test: `packages/extensions/whiteboard/test/routes.test.ts`

**Interfaces:**

- Consumes: `createStore`/`Store`/`WhiteboardEvent` (Task 3), row schemas (Task 2).
- Produces: `registerRoutes(app: H3, store: Store): void` mounting:
  - `GET  /rows/:table?room=` → `IdRowOf<table>[]` (room maps to the table's room column)
  - `POST /rows/:table` body = row (client supplies `id`) → row
  - `PUT  /rows/:table/:id` body = partial patch → row (404 if missing)
  - `DELETE /rows/:table/:id` → `{deleted: boolean}`
  - `GET  /elements/:scope?room=` scope = `live|draft` → `ElementRow[]`
  - `PUT  /elements/:scope` body = `ElementRow` → 200 row, or 409 `{current}` when version-gated
  - `PUT  /elements/:scope/bulk` body = `{rows: ElementRow[]}` → `{written: number}`
  - `POST /elements/:scope/bulk-delete` body = `{room, elementIds}` → `{deleted: number}`
  - `POST /cursor` body = `CursorEvent` → `{ok: true}`
  - `GET  /changes?room=` SSE: named events `change` (RowChange JSON) and `cursor`
    (CursorEvent JSON), 15s heartbeat comment

The h3 instance is `server.app` (h3 `2.0.1-rc.22`). Use `getQuery`, `readValidatedBody` (zod),
`getRouterParam`, `createEventStream`. Grep `packages/core/src/api` for the local idioms before
writing handlers — copy the validation/error shape used there, this repo already zod-validates
every HTTP boundary.

- [ ] **Step 1: Write the failing test**

`test/routes.test.ts` — boot a real h3 app (no mocks), drive it over HTTP:

```ts
import {mkdtempSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {H3, serve} from 'h3'
import {afterAll, describe, expect, it} from 'vitest'
import {createStore} from '../src/server/db/store.js'
import {registerRoutes} from '../src/server/routes.js'

const store = createStore(realpathSync(mkdtempSync(join(tmpdir(), 'wb-routes-'))))
const app = new H3()
registerRoutes(app, store)
const server = serve(app, {port: 0})
const base = async (): Promise<string> => `http://127.0.0.1:${(await server.ready()).port()}`
afterAll(async () => {
  await server.close()
  store.close()
})

describe('whiteboard routes', () => {
  it('element upsert round-trips and 409s on stale version', async () => {
    const url = `${await base()}/elements/live`
    const row = {room: 'r1', elementId: 'e1', data: {type: 'rectangle'}, version: 2}
    const ok = await fetch(url, {
      method: 'PUT',
      body: JSON.stringify(row),
      headers: {'content-type': 'application/json'},
    })
    expect(ok.status).toBe(200)
    const stale = await fetch(url, {
      method: 'PUT',
      body: JSON.stringify({...row, version: 1}),
      headers: {'content-type': 'application/json'},
    })
    expect(stale.status).toBe(409)
    const body = await stale.json()
    expect(body.current.version).toBe(2)
    const listed = await (await fetch(`${await base()}/elements/live?room=r1`)).json()
    expect(listed).toHaveLength(1)
  })

  it('rejects an invalid row with 400', async () => {
    const bad = await fetch(`${await base()}/elements/live`, {
      method: 'PUT',
      body: JSON.stringify({room: 'r1'}),
      headers: {'content-type': 'application/json'},
    })
    expect(bad.status).toBe(400)
  })

  it('streams a change over SSE after a write', async () => {
    const controller = new AbortController()
    const stream = await fetch(`${await base()}/changes?room=r2`, {signal: controller.signal})
    const reader = stream.body?.getReader()
    if (!reader) throw new Error('no body')
    store.insert('pins', {room: 'r2', cid: 'c1', x: 1, y: 2, pinState: 'locked'})
    const decoder = new TextDecoder()
    let text = ''
    while (!text.includes('event: change')) {
      const {value, done} = await reader.read()
      if (done) break
      text += decoder.decode(value)
    }
    controller.abort()
    expect(text).toContain('event: change')
    expect(text).toContain('"table":"pins"')
  })

  it('does not leak changes from other rooms', async () => {
    const controller = new AbortController()
    const stream = await fetch(`${await base()}/changes?room=r3`, {signal: controller.signal})
    const reader = stream.body?.getReader()
    if (!reader) throw new Error('no body')
    store.insert('pins', {room: 'other', cid: 'c9', x: 0, y: 0, pinState: 'locked'})
    store.cursor({room: 'r3', peerId: 'p1', kind: 'human', x: 0, y: 0, name: 'G', color: '#fff', lastSeen: 1})
    const decoder = new TextDecoder()
    let text = ''
    while (!text.includes('event: cursor')) {
      const {value, done} = await reader.read()
      if (done) break
      text += decoder.decode(value)
    }
    controller.abort()
    expect(text).not.toContain('"cid":"c9"')
  })
})
```

If h3 `2.0.1-rc.22` exports differ (`H3`/`serve` naming), mirror how `packages/core` constructs
and serves its app — same version, same idiom. The assertions stand regardless.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @conciv/extension-whiteboard exec vitest run test/routes.test.ts
```

Expected: FAIL (cannot resolve `../src/server/routes.js`).

- [ ] **Step 3: Implement routes**

`src/server/routes.ts` skeleton (adjust h3 idioms to match core):

```ts
import {createEventStream, getQuery, getRouterParam, readValidatedBody, HTTPError} from 'h3'
import type {H3} from 'h3'
import {z} from 'zod'
import {cursorEvent, elementRow, idRowSchemas, type ElementScope, type IdTableName} from '../shared/rows.js'
import type {Store} from './db/store.js'

const scopeOf = (raw: string | undefined): ElementScope => {
  const parsed = z.enum(['live', 'draft']).safeParse(raw)
  if (!parsed.success) throw new HTTPError({status: 400, message: 'bad scope'})
  return parsed.data
}

const tableOf = (raw: string | undefined): IdTableName => {
  const parsed = z.enum(['canvasPending', 'canvasReplies', 'comments', 'pins', 'reads']).safeParse(raw)
  if (!parsed.success) throw new HTTPError({status: 400, message: 'bad table'})
  return parsed.data
}

const roomColumnOf = {
  canvasPending: 'room',
  canvasReplies: 'room',
  comments: 'sessionId',
  pins: 'room',
  reads: 'sessionId',
} as const

const roomQuery = (event: Parameters<Parameters<H3['get']>[1]>[0]): string => {
  const room = getQuery(event).room
  if (typeof room !== 'string' || !room) throw new HTTPError({status: 400, message: 'room required'})
  return room
}

export const registerRoutes = (app: H3, store: Store): void => {
  app.get('/rows/:table', (event) => {
    const table = tableOf(getRouterParam(event, 'table'))
    return store.list(table, {[roomColumnOf[table]]: roomQuery(event)} as never)
  })

  app.post('/rows/:table', async (event) => {
    const table = tableOf(getRouterParam(event, 'table'))
    const row = await readValidatedBody(event, idRowSchemas[table])
    return store.insert(table, row as never)
  })

  app.put('/rows/:table/:id', async (event) => {
    const table = tableOf(getRouterParam(event, 'table'))
    const id = getRouterParam(event, 'id') ?? ''
    const patch = await readValidatedBody(event, idRowSchemas[table].partial())
    const row = store.update(table, id, patch as never)
    if (!row) throw new HTTPError({status: 404, message: 'row not found'})
    return row
  })

  app.delete('/rows/:table/:id', (event) => ({
    deleted: store.remove(tableOf(getRouterParam(event, 'table')), getRouterParam(event, 'id') ?? ''),
  }))

  app.get('/elements/:scope', (event) => store.listElements(scopeOf(getRouterParam(event, 'scope')), roomQuery(event)))

  app.put('/elements/:scope', async (event) => {
    const scope = scopeOf(getRouterParam(event, 'scope'))
    const row = await readValidatedBody(event, elementRow)
    const outcome = store.upsertElement(scope, row)
    if (!outcome.ok) throw new HTTPError({status: 409, data: {current: outcome.current}})
    return outcome.row
  })

  app.put('/elements/:scope/bulk', async (event) => {
    const scope = scopeOf(getRouterParam(event, 'scope'))
    const {rows} = await readValidatedBody(event, z.object({rows: z.array(elementRow)}))
    return {written: store.upsertElements(scope, rows).length}
  })

  app.post('/elements/:scope/bulk-delete', async (event) => {
    const scope = scopeOf(getRouterParam(event, 'scope'))
    const {room, elementIds} = await readValidatedBody(
      event,
      z.object({room: z.string(), elementIds: z.array(z.string())}),
    )
    return {deleted: store.deleteElements(scope, room, elementIds)}
  })

  app.post('/cursor', async (event) => {
    store.cursor(await readValidatedBody(event, cursorEvent))
    return {ok: true}
  })

  app.get('/changes', (event) => {
    const room = roomQuery(event)
    const stream = createEventStream(event)
    const unsubscribe = store.onEvent((change) => {
      if (change.room !== room) return
      if (change.kind === 'cursor') return void stream.push({event: 'cursor', data: JSON.stringify(change.cursor)})
      void stream.push({event: 'change', data: JSON.stringify(change)})
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @conciv/extension-whiteboard exec vitest run test/routes.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/whiteboard/src/server/routes.ts packages/extensions/whiteboard/test/routes.test.ts
git commit -m "feat(whiteboard): rest routes + sse change feed over the store" -- packages/extensions/whiteboard/src/server/routes.ts packages/extensions/whiteboard/test/routes.test.ts
```

---

### Task 5: Server swap — context, tools, auto-commit, enrich worker, server.ts

**Files:**

- Modify: `packages/extensions/whiteboard/src/server/context.ts`
- Modify: `packages/extensions/whiteboard/src/server.ts`
- Modify: `packages/extensions/whiteboard/src/server/auto-commit.ts`
- Create: `packages/extensions/whiteboard/src/server/enrich-worker.ts` (moved out of `jazz/`)
- Delete: `packages/extensions/whiteboard/src/server/jazz/enrich-worker.ts`
- Modify: `packages/extensions/whiteboard/src/tool/canvas/server.ts`
- Modify: `packages/extensions/whiteboard/src/tool/comment/server.ts`
- Modify: `packages/extensions/whiteboard/src/tool/element/server.ts`
- Modify: `packages/extensions/whiteboard/src/tool/anchor/server.ts`
- Test: existing unit tests (`canvas-prompt.test.ts`, `canvas-svg-caps.test.ts`,
  `canvas-draft-svg.test.ts`) + typecheck; ITs run in Task 8.

**Interfaces:**

- Consumes: `Store` (Task 3), `registerRoutes` (Task 4).
- Produces: `WhiteboardToolContext` = `{cwd, store: Store, sessionId, room, model}` — every tool
  file compiles against `ctx.store`.

Mechanical translation table (apply everywhere):

| Jazz                                                                         | Store                                                                                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ctx.db.all(app.comments.where(w), {tier})`                                  | `ctx.store.list('comments', w)`                                                                                               |
| `ctx.db.insert(app.canvasPending, row).wait(...)` / `.value.id`              | `ctx.store.insert('canvasPending', row)` / `.id`                                                                              |
| `ctx.db.update(app.pins, id, patch).wait(...)`                               | `ctx.store.update('pins', id, patch)`                                                                                         |
| `ctx.db.delete(app.comments, id).wait(...)`                                  | `ctx.store.remove('comments', id)`                                                                                            |
| `ctx.db.all(app.canvasElements.where({room}), ...)`                          | `ctx.store.listElements('live', room)`                                                                                        |
| `app.canvasDraftElements` reads/writes                                       | `ctx.store.listElements('draft', room)` / `upsertElement('draft', ...)`                                                       |
| element `db.update(table, current.id, {data, version: current.version + 1})` | `ctx.store.upsertElement(scope, {room, elementId, data, version: current.version + 1})`                                       |
| element deletes by row id                                                    | `ctx.store.deleteElement(scope, room, elementId)`                                                                             |
| `db.subscribeAll(query, cb)` (enrich worker)                                 | `store.onEvent` filtered on `change.table === 'comments' && change.kind === 'upsert'`                                         |
| cursor row writes in `tool/comment/server.ts` (`markPresence`)               | `ctx.store.cursor({room, peerId, kind: 'agent', x, y, name, color, lastSeen: Date.now()})` keeping the existing 50ms throttle |
| `import type {JsonValue} from 'jazz-tools'`                                  | `import type {JsonValue} from '../../shared/rows.js'`                                                                         |
| `new Date()` in rows                                                         | `Date.now()`                                                                                                                  |

All store calls are synchronous — drop the `await`/`.wait()` ceremony, keep tool handlers `async`
only where they still await something real (enrichment, export polling, timers).

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
  const store = createStore(join(server.cwd, '.conciv', 'whiteboard'))
  registerRoutes(server.app, store)
  const stopEnrichment = startCommentEnrichment(store, server.cwd)
  const sessionId = (request: ToolRequest): string => {
    if (!request.sessionId) throw new Error('whiteboard tools require an active session')
    return request.sessionId
  }
  return {
    context: {cwd: server.cwd, store, sessionId, room: sessionId, model: (request) => request.model},
    turnEnd: (turnSessionId) => {
      try {
        autoCommitDraft(store, turnSessionId)
      } catch (error) {
        console.error(`[whiteboard] auto-commit on turn end failed for ${turnSessionId}: ${String(error)}`)
      }
    },
    dispose: async () => {
      stopEnrichment()
      store.close()
    },
  }
})
```

- [ ] **Step 3: Rewrite `auto-commit.ts`**

```ts
import type {Store} from './db/store.js'

export function autoCommitDraft(store: Store, room: string): boolean {
  if (!store.listElements('draft', room).length) return false
  if (store.list('canvasPending', {room, kind: 'commit'}).length) return false
  store.insert('canvasPending', {room, kind: 'commit', stage: 'live', payload: {}})
  return true
}
```

- [ ] **Step 4: Move + rewrite the enrich worker**

`src/server/enrich-worker.ts` (delete `src/server/jazz/enrich-worker.ts`):

```ts
import {z} from 'zod'
import type {JsonValue} from '../shared/rows.js'
import type {Store} from './db/store.js'
import {enrichAnchor} from '../tool/comment/anchor-enrich.js'

const SourceAnchor = z.object({source: z.object({file: z.string()})})
const enrichedComment = z.object({
  id: z.string(),
  kind: z.string(),
  anchor: z.unknown().optional(),
  anchorHash: z.string().optional(),
})

const enrichRow = async (store: Store, cwd: string, id: string, anchor: JsonValue): Promise<void> => {
  const enriched = await enrichAnchor(cwd, anchor)
  if (!enriched.hash) return
  store.update('comments', id, {
    anchor: (enriched.anchor ?? undefined) as JsonValue,
    anchorFile: enriched.file ?? undefined,
    anchorComponent: enriched.component ?? undefined,
    anchorHash: enriched.hash,
    updatedAt: Date.now(),
  })
}

export const startCommentEnrichment = (store: Store, cwd: string): (() => void) => {
  const attempted = new Set<string>()
  return store.onEvent((event) => {
    if (event.kind === 'cursor' || event.table !== 'comments') return
    if (event.kind === 'delete') return void attempted.delete(event.id)
    const parsed = enrichedComment.safeParse(event.row)
    if (!parsed.success) return
    const row = parsed.data
    if (row.kind !== 'source-linked' || attempted.has(row.id) || row.anchorHash) return
    if (!SourceAnchor.safeParse(row.anchor).success) return
    attempted.add(row.id)
    void enrichRow(store, cwd, row.id, row.anchor as JsonValue)
  })
}
```

- [ ] **Step 5: Rewrite the four tool servers with the translation table**

Every `ctx.db` call in `tool/canvas/server.ts` (12 call clusters, see the table),
`tool/comment/server.ts` (18), `tool/element/server.ts`, `tool/anchor/server.ts`. The two polling
loops keep their shape, now against the store:

`canvasExportTool` reply wait:

```ts
const deadline = Date.now() + 10_000
while (Date.now() < deadline) {
  const [reply] = ctx.store.list('canvasReplies', {room, requestId})
  if (reply) {
    const payload = reply.payload as unknown as {dataBase64?: string; error?: string; reason?: string}
    ctx.store.remove('canvasReplies', reply.id)
    if (payload.error) return {error: payload.error, reason: payload.reason ?? 'unknown', scope: input.scope}
    return imageResult('image/png', payload.dataBase64 ?? '', {scope: input.scope})
  }
  await new Promise((resolve) => setTimeout(resolve, 250))
}
```

`canvasCommitTool` drain wait: same pattern polling `ctx.store.listElements('draft', room)`.

`canvasClearTool` / `canvasDiscardTool`: `listElements` + `deleteElements` + `list`/`remove` on
`canvasPending` (batch dies; sequential synchronous calls are fine, each emits its own delta).

`markPresence` in `tool/comment/server.ts`: replace the cursor row read/insert/update with a
single `ctx.store.cursor({...})` call; keep `AGENT_THROTTLE_MS` and the `lastPresence` map;
`stableUuid` for the cursor id is no longer needed there (presence has no row id).

- [ ] **Step 6: Typecheck + unit tests**

```bash
pnpm --filter @conciv/extension-whiteboard typecheck
pnpm --filter @conciv/extension-whiteboard exec vitest run test/rows.test.ts test/store.test.ts test/routes.test.ts test/canvas-prompt.test.ts test/canvas-svg-caps.test.ts test/canvas-draft-svg.test.ts
git grep -n "jazz" packages/extensions/whiteboard/src/server packages/extensions/whiteboard/src/tool
```

Expected: clean typecheck, unit tests PASS, grep returns NOTHING under `src/server` + `src/tool`.

- [ ] **Step 7: Commit**

```bash
git add -A packages/extensions/whiteboard/src/server packages/extensions/whiteboard/src/tool packages/extensions/whiteboard/src/server.ts
git commit -m "feat(whiteboard): server + tools on sqlite store, jazz server-side gone" -- packages/extensions/whiteboard/src/server packages/extensions/whiteboard/src/tool packages/extensions/whiteboard/src/server.ts
```

---

### Task 6: Client DB layer (collections + SSE + provider)

**Files:**

- Create: `packages/extensions/whiteboard/src/client/db.tsx`
- Delete: `packages/extensions/whiteboard/src/client/jazz-client.tsx` (in Task 8, after consumers move)
- Test: `packages/extensions/whiteboard/test/client-db.it.test.ts` behavior lands via existing ITs
  in Task 8; this task must typecheck and the module must be import-clean (no `node:` imports).

**Interfaces:**

- Consumes: routes (Task 4), row schemas (Task 2).
- Produces:

```ts
type WhiteboardDb = {
  canvasElements: Collection<ElementRow>       // getKey: elementId
  canvasDraftElements: Collection<ElementRow>  // getKey: elementId
  canvasPending: Collection<PendingRow>        // getKey: id
  canvasReplies: Collection<ReplyRow>
  comments: Collection<CommentRow>
  pins: Collection<PinRow>
  reads: Collection<ReadRow>
  cursors: Accessor<Map<string, CursorEvent>>
  postCursor: (cursor: Omit<CursorEvent, 'room' | 'lastSeen'>) => void
  accountId: () => string
  dispose: () => void
}
createWhiteboardDb(base: string, room: string): WhiteboardDb
WhiteboardDbProvider(props: {base: string; room: string; children: JSX.Element}): JSX.Element
useWhiteboardDb(): WhiteboardDb
```

- [ ] **Step 1: Implement `src/client/db.tsx`**

```tsx
import {createContext, createSignal, onCleanup, useContext, type Accessor, type JSX} from 'solid-js'
import {QueryClient} from '@tanstack/query-core'
import {createCollection} from '@tanstack/solid-db'
import {queryCollectionOptions} from '@tanstack/query-db-collection'
import {
  commentRow,
  cursorEvent,
  elementRow,
  pendingRow,
  pinRow,
  readRow,
  replyRow,
  rowChange,
  type CursorEvent,
  type ElementRow,
} from '../shared/rows.js'

const jsonFetch = async (input: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(input, {
    ...init,
    headers: init?.body ? {'content-type': 'application/json'} : undefined,
  })
  if (response.status === 409) return {conflict: await response.json()}
  if (!response.ok) throw new Error(`whiteboard api ${response.status}: ${input}`)
  return response.json()
}

const accountId = (): string => {
  const key = 'conciv-whiteboard-account-id'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const fresh = crypto.randomUUID()
  localStorage.setItem(key, fresh)
  return fresh
}

export function createWhiteboardDb(base: string, room: string) {
  const queryClient = new QueryClient()

  const idCollection = <T extends {id: string}>(table: string, schema: {parse: (v: unknown) => T}) =>
    createCollection(
      queryCollectionOptions({
        queryKey: [table, room],
        queryClient,
        queryFn: async () => {
          const rows = (await jsonFetch(`${base}/rows/${table}?room=${encodeURIComponent(room)}`)) as unknown[]
          return rows.map((row) => schema.parse(row))
        },
        getKey: (row: T) => row.id,
        onInsert: async ({transaction}) => {
          await jsonFetch(`${base}/rows/${table}`, {
            method: 'POST',
            body: JSON.stringify(transaction.mutations[0]?.modified),
          })
        },
        onUpdate: async ({transaction}) => {
          const mutation = transaction.mutations[0]
          if (!mutation) return
          await jsonFetch(`${base}/rows/${table}/${String(mutation.key)}`, {
            method: 'PUT',
            body: JSON.stringify(mutation.changes),
          })
        },
        onDelete: async ({transaction}) => {
          await jsonFetch(`${base}/rows/${table}/${String(transaction.mutations[0]?.key)}`, {method: 'DELETE'})
        },
      }),
    )

  const elementCollection = (scope: 'live' | 'draft') =>
    createCollection(
      queryCollectionOptions({
        queryKey: [`elements-${scope}`, room],
        queryClient,
        queryFn: async () => {
          const rows = (await jsonFetch(`${base}/elements/${scope}?room=${encodeURIComponent(room)}`)) as unknown[]
          return rows.map((row) => elementRow.parse(row))
        },
        getKey: (row: ElementRow) => row.elementId,
        onInsert: async ({transaction}) => {
          await putElement(scope, transaction.mutations[0]?.modified as ElementRow)
        },
        onUpdate: async ({transaction}) => {
          await putElement(scope, transaction.mutations[0]?.modified as ElementRow)
        },
        onDelete: async ({transaction}) => {
          const mutation = transaction.mutations[0]
          if (!mutation) return
          await jsonFetch(`${base}/elements/${scope}/bulk-delete`, {
            method: 'POST',
            body: JSON.stringify({room, elementIds: [String(mutation.key)]}),
          })
        },
      }),
    )

  const collections = {
    canvasElements: elementCollection('live'),
    canvasDraftElements: elementCollection('draft'),
    canvasPending: idCollection('canvasPending', pendingRow),
    canvasReplies: idCollection('canvasReplies', replyRow),
    comments: idCollection('comments', commentRow),
    pins: idCollection('pins', pinRow),
    reads: idCollection('reads', readRow),
  }

  const putElement = async (scope: 'live' | 'draft', row: ElementRow): Promise<void> => {
    const result = (await jsonFetch(`${base}/elements/${scope}`, {method: 'PUT', body: JSON.stringify(row)})) as {
      conflict?: {current: ElementRow}
    }
    const current = result.conflict?.current
    const target = scope === 'draft' ? collections.canvasDraftElements : collections.canvasElements
    if (current) target.utils.writeUpsert(current)
  }

  const [cursors, setCursors] = createSignal<Map<string, CursorEvent>>(new Map())

  const source = new EventSource(`${base}/changes?room=${encodeURIComponent(room)}`)
  let dropped = false
  source.addEventListener('change', (event) => {
    const change = rowChange.parse(JSON.parse(event.data))
    const target = collections[change.table === 'canvasElements' ? 'canvasElements' : change.table]
    if (change.kind === 'delete') return void target.utils.writeDelete(change.id)
    target.utils.writeUpsert(target.config.schema ? change.row : change.row)
  })
  source.addEventListener('cursor', (event) => {
    const cursor = cursorEvent.parse(JSON.parse(event.data))
    setCursors((previous) => new Map(previous).set(cursor.peerId, cursor))
  })
  source.addEventListener('error', () => {
    dropped = true
  })
  source.addEventListener('open', () => {
    if (!dropped) return
    dropped = false
    Object.values(collections).forEach((collection) => void collection.utils.refetch())
  })

  const postCursor = (cursor: Omit<CursorEvent, 'room' | 'lastSeen'>): void =>
    void jsonFetch(`${base}/cursor`, {
      method: 'POST',
      body: JSON.stringify({...cursor, room, lastSeen: Date.now()}),
    }).catch(() => undefined)

  return {
    ...collections,
    cursors,
    postCursor,
    accountId,
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

Two API surfaces to verify against the installed packages while making this compile (fix here, not
downstream): (a) `createCollection` export — if `@tanstack/solid-db` does not re-export it, import
from `@tanstack/db`; (b) the exact names of the direct-write utils (`writeUpsert`/`writeDelete` vs
`writeInsert`+`writeUpdate`) on query-collection `utils` — use what
`@tanstack/query-db-collection`'s d.ts exposes; upsert-shaped fallback is `writeInsert` when the
key is absent, `writeUpdate` otherwise. Delete the stray `target.config.schema ? ... : ...`
ternary when transcribing — `writeUpsert(change.row)` after a `schema.parse` of the owning row
schema keyed by `change.table`.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @conciv/extension-whiteboard typecheck
```

Expected: clean. (Behavioral proof comes from the IT suite in Task 8.)

- [ ] **Step 3: Commit**

```bash
git add packages/extensions/whiteboard/src/client/db.tsx
git commit -m "feat(whiteboard): tanstack db client collections + sse wiring" -- packages/extensions/whiteboard/src/client/db.tsx
```

---

### Task 7: Migrate the comments model

**Files:**

- Modify: `packages/extensions/whiteboard/src/client/model/comments.tsx`

**Interfaces:**

- Consumes: `useWhiteboardDb` (Task 6).
- Produces: `createCommentsModel` / `CommentsProvider` / `useComments` — same exported names and
  model surface (island/pins/thread/inbox consumers must not change), except `Comment.createdAt`
  etc. become `number` (epoch ms).

Point changes:

1. Kill imports of `jazz-tools/solid` and `jazz-tools`; import `useLiveQuery` from
   `@tanstack/solid-db`, `useWhiteboardDb` from `../db.js`, `CommentRow`/`PinRow`/`JsonValue` from
   `../../shared/rows.js`.
2. `Comment`/`Pin` local types: replace with `CommentRow`/`PinRow` aliases (dates are now
   numbers). `newest` works on numbers: `dates.reduce<number | undefined>((latest, date) => (date > (latest ?? -1) ? date : latest), undefined)`.
3. Reads (collections are already room-scoped, no `where` needed):

```ts
const db = useWhiteboardDb()
const commentRows = useLiveQuery((q) => q.from({row: db.comments}))
const pinRows = useLiveQuery((q) => q.from({row: db.pins}))
const readRows = useLiveQuery((q) => q.from({row: db.reads}))
const comments = (): CommentRow[] => commentRows().data ?? []
const pins = (): PinRow[] => pinRows().data ?? []
```

(Solid `useLiveQuery` returns an accessor; verify the exact data shape against
`@tanstack/solid-db`'s d.ts — if it exposes `.data` as a direct property on the accessor result,
use that; the tests in Task 8 catch any mismatch.)

4. `accountId`: `const accountId = (): string | undefined => db.accountId()` (`useSession` dies).
5. Writes:

```ts
const markRead = (threadId: string): void => {
  const self = accountId()
  if (!self) return
  const existing = (readRows().data ?? []).find((row) => row.threadId === threadId && row.accountId === self)
  if (existing) return void db.reads.update(existing.id, (draft) => void (draft.lastReadAt = Date.now()))
  db.reads.insert({id: crypto.randomUUID(), sessionId: room(), threadId, accountId: self, lastReadAt: Date.now()})
}
```

Same pattern for every other `db().insert/update/delete`: `createComment` (insert comment with
`id: crypto.randomUUID()`, `createdAt: Date.now()`; insert pin with `id: crypto.randomUUID()`),
`reply`, `resolve` (`resolvedAt: Date.now()`), `deleteThread` (`db.comments.delete(comment.id)` per
row, `db.pins.delete(pin.id)`), `removeComment`, `movePin`
(`db.pins.update(pin.id, (draft) => Object.assign(draft, patch))`), `detachAnchor`
(`db.comments.update(comment.id, (draft) => {draft.kind = 'floating'; draft.anchor = undefined; draft.anchorFile = undefined})`). 6. All `Date` comparisons become number comparisons (`.getTime()` deleted); any leaf UI that
renders a date constructs `new Date(row.createdAt)` locally (check `thread.tsx` / `inbox.tsx`
for `createdAt`/`lastActivityAt` usages and adjust the few call sites).

- [ ] **Step 1: Apply the changes above**
- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @conciv/extension-whiteboard typecheck
```

Fix `thread.tsx`/`inbox.tsx`/`pins.tsx` fallout (Date → number) until clean.

- [ ] **Step 3: Commit**

```bash
git add packages/extensions/whiteboard/src/client
git commit -m "feat(whiteboard): comments model on tanstack collections" -- packages/extensions/whiteboard/src/client
```

---

### Task 8: Migrate the island (canvas), overlay wiring, run the IT suite

**Files:**

- Modify: `packages/extensions/whiteboard/src/canvas/island.tsx`
- Modify: `packages/extensions/whiteboard/src/client/overlay.tsx`
- Delete: `packages/extensions/whiteboard/src/client/jazz-client.tsx`

**Interfaces:**

- Consumes: `useWhiteboardDb`/`WhiteboardDbProvider` (Task 6).
- Produces: same `Island` props; overlay `Board` renders `WhiteboardDbProvider` instead of
  `WhiteboardJazzProvider` (no config fetch, no auth gate).

Island point changes (keep every guard/versions-map mechanism — it already implements LWW echo
suppression):

1. `useDb`/`app`/`JsonValue` imports → `useWhiteboardDb` + shared `JsonValue`. `ElementRow` local
   type: `{elementId: string; data: JsonValue; version: number}` (row `id` and `rowIds` map DIE —
   elements key on `elementId` now).
2. Scene subscription:

```ts
const db = useWhiteboardDb()
const snapshot = (collection: typeof db.canvasElements): ElementRow[] => [...collection.state.values()]
const unsubscribeScene = db.canvasElements.subscribeChanges(() => applyRemote(snapshot(db.canvasElements)), {
  includeInitialState: true,
})
```

(`collection.state` is the synced+optimistic `Map<key, row>`; verify the exact name — `.state` vs
`.toArray` — against `@tanstack/db` d.ts and use the Map-valued one.) Same pattern for
`canvasPending` (drain) and drop the cursors subscription entirely (next point).

3. Cursors: replace the `app.cursors` subscription with `db.cursors()` (Solid signal) driven
   collaborators — wrap in `createEffect(() => api?.updateScene({collaborators: collaboratorsFrom([...db.cursors().values()])}))`;
   `CursorRow.lastSeen` is a number now (`now - cursor.lastSeen < CURSOR_STALE_MS`). The
   agent-cursor sweep interval dies (map entries just go stale and get filtered).
   `ensureAgentCursor`/`moveAgentCursor` become:

```ts
const agentCursor = (x: number, y: number): void =>
  db.postCursor({peerId: agentPeerId, kind: 'agent', name: 'drawing…', color: '#8a86e8', x, y})
```

`replayDraft` step callback calls `agentCursor(x, y)` directly.

4. `writeLocal`: insert vs update on the collection by key presence:

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

(if `collection.has` is not exposed, `db.canvasElements.state.has(element.id)`).

5. `drainPending`: bulk PUT then remove the pending row:

```ts
const rows = drawn.map((element) => ({
  room: props.room,
  elementId: element.id,
  data: asJson(element),
  version: element.version,
}))
await fetch(`${props.base}/elements/${row.stage === 'draft' ? 'draft' : 'live'}/bulk`, {
  method: 'PUT',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify({rows}),
})
db.canvasPending.delete(row.id)
```

`stableUuid` dies with row ids. `Island` gains a `base: string` prop (overlay passes
`${api.apiBase}/api/ext/whiteboard`) — or put `base` on the WhiteboardDb context and read it there;
pick the context route so `Island` props stay unchanged.

6. `commitStep`/`performCommit`/`clearDraftRows`: drafts come from
   `snapshot(db.canvasDraftElements)`; each step's `write` PUTs the single element to
   `/elements/live` via `db.canvasElements.insert/update` (collection ops, optimistic);
   `clearDraftRows` = one `bulk-delete` POST with all draft `elementId`s; pending row removed via
   `db.canvasPending.delete(row.id)`.
7. `performExport` reply insert: `db.canvasReplies.insert({id: crypto.randomUUID(), room: props.room, requestId, kind: 'export', payload})`.
8. `gatherExportElements` draft read: `snapshot(db.canvasDraftElements)`.

Overlay point changes (`overlay.tsx`):

```tsx
function Board(props: {...}): JSX.Element {
  return (
    <Show when={props.api.activeSession()} keyed fallback={<SessionPending />}>
      {(session) => (
        <WhiteboardDbProvider base={`${props.api.apiBase}/api/ext/whiteboard`} room={session}>
          <Canvas ... room={() => session} ... />
        </WhiteboardDbProvider>
      )}
    </Show>
  )
}
```

`fetchJazzConfig`/`createResource` config gate and `WhiteboardJazzProvider` import die; delete
`src/client/jazz-client.tsx`.

- [ ] **Step 1: Apply island changes**
- [ ] **Step 2: Apply overlay changes, delete `jazz-client.tsx`**
- [ ] **Step 3: Typecheck, then build and run the full IT suite**

```bash
pnpm --filter @conciv/extension-whiteboard typecheck
pnpm turbo run build --filter=@conciv/extension-whiteboard --filter=@conciv/core --filter=@conciv/widget
pnpm --filter @conciv/extension-whiteboard test
```

Expected: every existing IT passes — `canvas-draft`, `canvas-commit`, `canvas-autocommit`,
`canvas-drag`, `canvas-export-png`, `canvas-preview`, `canvas-quiescent`, `inbox*`, `thread*`,
`pin-pan`. These are the behavior-parity gate from the spec. Debug loop: `console.error` deltas on
the SSE stream server-side, `store.list` state in the test process. Timeouts stay tight (turn
~30s ceilings already in helpers).

- [ ] **Step 4: Commit**

```bash
git add -A packages/extensions/whiteboard/src
git commit -m "feat(whiteboard): island + overlay on tanstack db, jazz client gone" -- packages/extensions/whiteboard/src
```

---

### Task 9: Delete Jazz remnants, package cleanup

**Files:**

- Delete: `packages/extensions/whiteboard/src/server/jazz/` (whole dir),
  `packages/extensions/whiteboard/src/shared/permissions.ts`,
  `packages/extensions/whiteboard/src/shared/schema.ts`
- Modify: `packages/extensions/whiteboard/package.json` (drop `jazz-tools` + `jazz-napi`, fix
  `build` script, update `description`)

- [ ] **Step 1: Delete files**

```bash
git rm -r packages/extensions/whiteboard/src/server/jazz packages/extensions/whiteboard/src/shared/permissions.ts packages/extensions/whiteboard/src/shared/schema.ts
```

- [ ] **Step 2: Package cleanup**

- Remove `jazz-tools` and `jazz-napi` from `dependencies`.
- `build` script: drop the `&& mkdir -p dist/shared && cp src/shared/schema.ts src/shared/permissions.ts dist/shared/` tail (that was the Jazz deploy input).
- `description`: replace the "self-hosted Jazz CRDT db" clause with "a local SQLite + SSE sync
  backend".

```bash
pnpm install
```

- [ ] **Step 3: Verify nothing references jazz anywhere**

```bash
git grep -in "jazz" -- packages/extensions/whiteboard
git grep -rn "useAll\|useDb\|subscribeAll\|jazz-tools" -- packages/extensions/whiteboard/src packages/extensions/whiteboard/test
```

Expected: zero hits in code (the spec/plan docs may match). This is the anti-pattern-grep adoption
check — green tests alone don't prove the old path is gone.

- [ ] **Step 4: Full gate**

```bash
pnpm typecheck
pnpm build
pnpm --filter @conciv/extension-whiteboard test
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A packages/extensions/whiteboard package.json pnpm-lock.yaml
git commit -m "feat(whiteboard)!: drop jazz — sqlite + sse is the only sync backend" -- packages/extensions/whiteboard package.json pnpm-lock.yaml
```

---

### Task 10: Repo-wide verification + changeset

**Files:**

- Create: `.changeset/whiteboard-tanstack-db.md`

- [ ] **Step 1: Fallow audit**

```bash
pnpm exec fallow audit --changed-since main --format json
```

Fix everything flagged INTRODUCED (dead exports from deleted Jazz plumbing are the likely hits).
Before deleting any flagged export, `pnpm exec fallow dead-code --trace 'file.ts:Symbol'`.

- [ ] **Step 2: Full monorepo gate**

```bash
pnpm typecheck && pnpm build && pnpm test
```

Expected: green. Widget ITs already rebuilt the widget in Task 8; if any widget IT touches the
whiteboard, rebuild first: `pnpm turbo run build --filter=@conciv/widget`.

- [ ] **Step 3: Changeset**

`.changeset/whiteboard-tanstack-db.md`:

```md
---
'@conciv/extension-whiteboard': patch
---

Replace the Jazz CRDT backend with local SQLite (node:sqlite + drizzle), zod REST routes, an SSE
change feed, and TanStack DB collections in the client. No more Jazz sync server, deploy step, or
secrets; conflict policy is server-ordered per-element versioned last-writer-wins. Requires
Node >= 22.13.
```

(Fixed versioning: one changeset bumps all `@conciv/*` in lockstep — naming the whiteboard package
is enough.)

- [ ] **Step 4: Commit + verify skill**

```bash
git add .changeset/whiteboard-tanstack-db.md
git commit -m "chore: changeset for whiteboard sqlite migration" -- .changeset/whiteboard-tanstack-db.md
```

Then run the `verify` skill against the live app (`pnpm dev`, open the widget, draw with two tabs

- ask the agent to draw; server restart required — core/harness/tool-side changes don't hot
  reload).

---

## Self-review notes (already applied)

- Spec's `commitDraft/discardDraft` store transactions were wrong — commit/discard is
  client-performed (Excalidraw conversion + cursor replay live in the browser); spec amended,
  plan Task 8 preserves it.
- Element tables lost their synthetic row `id` (composite key `room+elementId`); island's
  `rowIds`/`stableUuid` machinery deleted rather than ported.
- `cursors` table deleted entirely; agent presence from comment tools emits bus events
  server-side, browser presence and commit-replay cursor go through `POST /cursor`.
- Timestamps are epoch ms numbers end-to-end; the few Date-rendering leaves construct
  `new Date(n)` locally.
