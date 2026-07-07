# Whiteboard Custom Sync Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the bespoke `queryCollectionOptions` + external `EventSource` + manual `writeUpsert` + `dropped`-flag hybrid in `db.tsx` with real TanStack DB **custom sync collections** built the way the built-in real-time collections are (an options factory passed to `createCollection`), so `collections` read as clean one-liners exactly like the solid/todo example: `createCollection(whiteboardCollectionOptions({...}))`.

**Architecture:** A shared SSE change-feed (`createChangeFeed`) opens ONE `EventSource` per room and fans out per-table events + reconnect + cursor. Two options factories return `CollectionConfig` (never the collection): `whiteboardCollectionOptions` (id tables: comments/pins/reads/pending/replies) and `whiteboardElementOptions` (live/draft, version-gated, bulk, paced drag writer on `utils.write`). Each factory's `sync` fn captures `{collection, begin, write, commit, truncate, markReady}` from the sync params (the exact pattern in TanStack's own `query-db-collection/manual-sync.ts` and `trailbase-db-collection`), runs an initial REST load (`begin→write→commit→markReady`), subscribes to the feed for its table (`begin→write→commit` per delta), and reloads-with-`truncate` on reconnect. Mutation handlers (`onInsert/onUpdate/onDelete`) POST/PUT/DELETE then **confirm** the server row into the synced store via `begin({immediate:true})→write→commit` (mirrors `writeUpsert`; no echo-await). The self-echo over SSE re-applies idempotently.

**Tech Stack:** `@tanstack/db` 0.6.14 `createCollection` + `SyncConfig` (`begin/write/commit/truncate/markReady`, `write({type:'insert'|'update', value})` / `write({type:'delete', key})`), re-exported by `@tanstack/solid-db`; `createPacedMutations` + `throttleStrategy` (drag); zod v4; browser `EventSource`; drizzle/libSQL REST server (unchanged).

**Reference (read verbatim, scratchpad `tanstack-db/`):** `packages/db/src/types.ts` `SyncConfig`; `packages/trailbase-db-collection/src/trailbase.ts` (options factory returns `{...config, sync, getKey, onInsert, onUpdate, onDelete, utils}`; `sync` fn does `load`/`listen`/`start` then `markReady`); `packages/query-db-collection/src/manual-sync.ts` (`performWriteOperations`: `begin({immediate:true})`, `write({type, value})`, `commit()`).

## Global Constraints

- Client only: `packages/extensions/whiteboard/src/client/`. Server (`routes.ts`, `store.ts`, SSE `/changes`, REST) unchanged.
- Functions not classes; no IIFEs; **zero comments**; no `else` where a guard-return works.
- Fully typed: no `any`, no `as` (pre-existing `as unknown as` scene-JSON bridges may stay), no non-null assertions; `noUncheckedIndexedAccess` on.
- oxfmt: no semicolons, single quotes, no bracket spacing, trailing commas, printWidth 120. Build/typecheck via turbo.
- Commit with a pathspec always. Rebuild extension + widget before browser ITs.
- **Behavior parity:** the full whiteboard suite (57 tests incl. drag-batching ITs) must stay green. Public `WhiteboardDb` surface consumed by `island.tsx`, `overlay.tsx`, `model/comments.tsx`, `inbox.tsx`, `pins/` unchanged EXCEPT elements' paced writer moves from `db.canvasElements.write(...)` to `db.canvasElements.utils.write(...)` (updated in Task 3). Everything else identical: `.insert/.update/.delete/.has/.state/.preload/.subscribeChanges`, `useLiveQuery`, `db.cursors`, `db.postCursor`, `db.accountId`, `db.base`, `db.room`, `db.dispose`.

---

### Task 1: `createChangeFeed` — one EventSource, per-table fan-out + reconnect + cursor

**Files:**

- Create: `packages/extensions/whiteboard/src/client/change-feed.ts`

**Interfaces:**

- Produces: `type ChangeMessage = {type: 'upsert'; row: unknown} | {type: 'delete'; key: string}`; `createChangeFeed(base, room): ChangeFeed` where `ChangeFeed = {subscribe(table, handler): () => void; onReconnect(handler): () => void; onCursor(handler): () => void; close(): void}`.

- [ ] **Step 1: Write the change feed**

`change-feed.ts`:

```ts
import {changeOf, cursorEvent, elementRow, type CursorEvent} from '../shared/rows.js'

export type ChangeMessage = {type: 'upsert'; row: unknown} | {type: 'delete'; key: string}
type Handler = (message: ChangeMessage) => void

const parseData = (event: Event): string | undefined =>
  event instanceof MessageEvent && typeof event.data === 'string' ? event.data : undefined

const feedMessage = changeOf(elementRow)

export function createChangeFeed(base: string, room: string) {
  const source = new EventSource(`${base}/changes?room=${encodeURIComponent(room)}`)
  const tableHandlers = new Map<string, Set<Handler>>()
  const reconnectHandlers = new Set<() => void>()
  const cursorHandlers = new Set<(cursor: CursorEvent) => void>()
  let dropped = false

  const listenTable = (table: string): void =>
    source.addEventListener(table, (event) => {
      const data = parseData(event)
      if (!data) return
      const parsed = feedMessage.parse(JSON.parse(data))
      const message: ChangeMessage =
        parsed.type === 'delete' ? {type: 'delete', key: parsed.key} : {type: 'upsert', row: parsed.row}
      tableHandlers.get(table)?.forEach((handler) => handler(message))
    })

  source.addEventListener('cursor', (event) => {
    const data = parseData(event)
    if (!data) return
    cursorHandlers.forEach((handler) => handler(cursorEvent.parse(JSON.parse(data))))
  })
  source.addEventListener('error', () => void (dropped = true))
  source.addEventListener('open', () => {
    if (!dropped) return
    dropped = false
    reconnectHandlers.forEach((handler) => handler())
  })

  return {
    subscribe: (table: string, handler: Handler): (() => void) => {
      const existing = tableHandlers.get(table)
      if (existing) existing.add(handler)
      if (!existing) {
        tableHandlers.set(table, new Set([handler]))
        listenTable(table)
      }
      return () => void tableHandlers.get(table)?.delete(handler)
    },
    onReconnect: (handler: () => void): (() => void) => {
      reconnectHandlers.add(handler)
      return () => void reconnectHandlers.delete(handler)
    },
    onCursor: (handler: (cursor: CursorEvent) => void): (() => void) => {
      cursorHandlers.add(handler)
      return () => void cursorHandlers.delete(handler)
    },
    close: () => source.close(),
  }
}

export type ChangeFeed = ReturnType<typeof createChangeFeed>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm turbo run typecheck --filter=@conciv/extension-whiteboard`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/extensions/whiteboard/src/client/change-feed.ts
git commit -m "feat(whiteboard): shared SSE change-feed (one EventSource, per-table fan-out)" -- packages/extensions/whiteboard/src/client/change-feed.ts
```

---

### Task 2: `whiteboard-collection.ts` — options factories (id + element)

**Files:**

- Create: `packages/extensions/whiteboard/src/client/whiteboard-collection.ts`

**Interfaces:**

- Consumes: `ChangeFeed` (Task 1); row schemas from `../shared/rows.js`; `createCollection` (only for its `CollectionConfig` param type / `Collection` type), `createPacedMutations`, `throttleStrategy` from `@tanstack/solid-db`.
- Produces (both return the OPTIONS object passed to `createCollection`, matching `electricCollectionOptions` shape):
  - `whiteboardCollectionOptions<Row extends {id: string}>({feed, base, room, table, schema})` → `CollectionConfig<Row, string>`.
  - `whiteboardElementOptions({feed, base, room, scope})` → `CollectionConfig<ElementRow, string, …, {write: (row: ElementRow) => void; cleanupStrategy: () => void}>` (exposes the paced drag writer + strategy cleanup on `utils`).

- [ ] **Step 1: Write the factories**

`whiteboard-collection.ts`:

```ts
import {createPacedMutations, throttleStrategy} from '@tanstack/solid-db'
import type {Collection} from '@tanstack/solid-db'
import {z} from 'zod'
import {elementRow, type ElementRow} from '../shared/rows.js'
import type {ChangeFeed} from './change-feed.js'

const jsonHeaders = (init?: RequestInit): HeadersInit | undefined =>
  init?.body ? {'content-type': 'application/json'} : undefined

const request = async (input: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(input, {...init, headers: jsonHeaders(init)})
  if (response.ok || response.status === 409) return response
  throw new Error(`whiteboard api ${response.status}: ${input}`)
}

type Writer = {
  begin: (options?: {immediate?: boolean}) => void
  write: (message: {type: 'insert' | 'update'; value: object} | {type: 'delete'; key: string}) => void
  commit: () => void
  truncate: () => void
}

const elementScope = z.enum(['live', 'draft'])
const elementTable = (scope: z.infer<typeof elementScope>): 'canvasElements' | 'canvasDraftElements' =>
  scope === 'draft' ? 'canvasDraftElements' : 'canvasElements'

export function whiteboardCollectionOptions<Row extends {id: string}>(deps: {
  feed: ChangeFeed
  base: string
  room: string
  table: string
  schema: z.ZodType<Row>
}) {
  const {feed, base, room, table, schema} = deps
  const rows = z.array(schema)
  let writer: Writer | undefined
  let coll: Collection<Row, string> | undefined

  const confirm = (row: Row): void => {
    if (!writer || !coll) return
    writer.begin({immediate: true})
    writer.write({type: coll.has(row.id) ? 'update' : 'insert', value: row})
    writer.commit()
  }
  const confirmDelete = (key: string): void => {
    if (!writer || !coll || !coll.has(key)) return
    writer.begin({immediate: true})
    writer.write({type: 'delete', key})
    writer.commit()
  }

  return {
    id: `${table}:${room}`,
    getKey: (row: Row) => row.id,
    sync: {
      rowUpdateMode: 'full' as const,
      sync: (params: {
        collection: Collection<Row, string>
        begin: Writer['begin']
        write: Writer['write']
        commit: () => void
        truncate: () => void
        markReady: () => void
      }) => {
        writer = {begin: params.begin, write: params.write, commit: params.commit, truncate: params.truncate}
        coll = params.collection
        const load = async (replace: boolean): Promise<void> => {
          const loaded = rows.parse(await (await request(`${base}/${table}?room=${encodeURIComponent(room)}`)).json())
          params.begin()
          if (replace) params.truncate()
          loaded.forEach((row) => params.write({type: 'insert', value: row}))
          params.commit()
        }
        const off = feed.subscribe(table, (message) => {
          params.begin()
          if (message.type === 'delete') params.write({type: 'delete', key: message.key})
          if (message.type === 'upsert') {
            const row = schema.parse(message.row)
            params.write({type: params.collection.has(row.id) ? 'update' : 'insert', value: row})
          }
          params.commit()
        })
        const offReconnect = feed.onReconnect(() => void load(true))
        void load(false).finally(() => params.markReady())
        return () => {
          off()
          offReconnect()
        }
      },
    },
    onInsert: async ({transaction}: {transaction: {mutations: Array<{modified: Row}>}}) => {
      for (const mutation of transaction.mutations) {
        const saved = schema.parse(
          await (await request(`${base}/${table}`, {method: 'POST', body: JSON.stringify(mutation.modified)})).json(),
        )
        confirm(saved)
      }
      return {refetch: false}
    },
    onUpdate: async ({transaction}: {transaction: {mutations: Array<{key: string; changes: Partial<Row>}>}}) => {
      for (const mutation of transaction.mutations) {
        const saved = schema.parse(
          await (
            await request(`${base}/${table}/${String(mutation.key)}`, {
              method: 'PUT',
              body: JSON.stringify(mutation.changes),
            })
          ).json(),
        )
        confirm(saved)
      }
      return {refetch: false}
    },
    onDelete: async ({transaction}: {transaction: {mutations: Array<{key: string}>}}) => {
      for (const mutation of transaction.mutations) {
        await request(`${base}/${table}/${String(mutation.key)}`, {method: 'DELETE'})
        confirmDelete(String(mutation.key))
      }
      return {refetch: false}
    },
  }
}

export function whiteboardElementOptions(deps: {
  feed: ChangeFeed
  base: string
  room: string
  scope: 'live' | 'draft'
}) {
  const {feed, base, room, scope} = deps
  const table = elementTable(scope)
  const rows = z.array(elementRow)
  const conflict = z.object({current: elementRow})
  const bulkResult = z.object({rows: z.array(elementRow)})
  let writer: Writer | undefined
  let coll: Collection<ElementRow, string> | undefined

  const confirm = (row: ElementRow): void => {
    if (!writer || !coll) return
    writer.begin({immediate: true})
    writer.write({type: coll.has(row.elementId) ? 'update' : 'insert', value: row})
    writer.commit()
  }
  const putElement = async (row: ElementRow): Promise<void> => {
    const response = await request(`${base}/elements/${scope}`, {method: 'PUT', body: JSON.stringify(row)})
    const saved =
      response.status === 409 ? conflict.parse(await response.json()).current : elementRow.parse(await response.json())
    confirm(saved)
  }

  const strategy = throttleStrategy({wait: 50, leading: true, trailing: true})
  const pacedWrite = createPacedMutations<ElementRow, ElementRow>({
    strategy,
    onMutate: (row) => {
      if (!coll) return
      if (coll.has(row.elementId))
        return void coll.update(row.elementId, (draft) => {
          draft.data = row.data
          draft.version = row.version
        })
      coll.insert(row)
    },
    mutationFn: async ({transaction}) => {
      const modified = transaction.mutations.map((mutation) => mutation.modified)
      const [first] = modified
      if (modified.length === 1 && first) return void (await putElement(first))
      const response = await request(`${base}/elements/${scope}/bulk`, {
        method: 'PUT',
        body: JSON.stringify({rows: modified}),
      })
      bulkResult.parse(await response.json()).rows.forEach((row) => confirm(row))
    },
  })

  return {
    id: `${table}:${room}`,
    getKey: (row: ElementRow) => row.elementId,
    sync: {
      rowUpdateMode: 'full' as const,
      sync: (params: {
        collection: Collection<ElementRow, string>
        begin: Writer['begin']
        write: Writer['write']
        commit: () => void
        truncate: () => void
        markReady: () => void
      }) => {
        writer = {begin: params.begin, write: params.write, commit: params.commit, truncate: params.truncate}
        coll = params.collection
        const load = async (replace: boolean): Promise<void> => {
          const loaded = rows.parse(
            await (await request(`${base}/elements/${scope}?room=${encodeURIComponent(room)}`)).json(),
          )
          params.begin()
          if (replace) params.truncate()
          loaded.forEach((row) => params.write({type: 'insert', value: row}))
          params.commit()
        }
        const off = feed.subscribe(table, (message) => {
          params.begin()
          if (message.type === 'delete') params.write({type: 'delete', key: message.key})
          if (message.type === 'upsert') {
            const row = elementRow.parse(message.row)
            params.write({type: params.collection.has(row.elementId) ? 'update' : 'insert', value: row})
          }
          params.commit()
        })
        const offReconnect = feed.onReconnect(() => void load(true))
        void load(false).finally(() => params.markReady())
        return () => {
          off()
          offReconnect()
        }
      },
    },
    onDelete: async ({transaction}: {transaction: {mutations: Array<{key: string}>}}) => {
      await request(`${base}/elements/${scope}/bulk-delete`, {
        method: 'POST',
        body: JSON.stringify({room, elementIds: transaction.mutations.map((mutation) => String(mutation.key))}),
      })
      return {refetch: false}
    },
    utils: {
      write: (row: ElementRow): void => void pacedWrite(row),
      cleanupStrategy: strategy.cleanup,
    },
  }
}
```

Note: the inline `sync`/`transaction` param types are written structurally to match `@tanstack/db`'s `SyncConfig`/mutation-handler params. At Step 2, if `createCollection(whiteboardCollectionOptions(...))` rejects the options, import the real `CollectionConfig`/`SyncConfig`/`InsertMutationFnParams` types from `@tanstack/db` and annotate the factory return/params with them (as `trailbase.ts` does) instead of the structural shapes — never cast. `rowUpdateMode: 'full'` because every SSE upsert and REST confirm carries the whole row.

- [ ] **Step 2: Typecheck a throwaway wiring**

Temporarily add to the bottom of `whiteboard-collection.ts` (delete before commit):

```ts
const _typecheck = (feed: ChangeFeed) => {
  const a = createCollectionCheck(
    whiteboardCollectionOptions({feed, base: '', room: '', table: 'comments', schema: z.object({id: z.string()})}),
  )
  const b = createCollectionCheck(whiteboardElementOptions({feed, base: '', room: '', scope: 'live'}))
  return [a, b]
}
```

Actually simpler — skip the throwaway; the real wiring is verified in Task 3. Run: `pnpm turbo run typecheck --filter=@conciv/extension-whiteboard`
Expected: `whiteboard-collection.ts` compiles (not yet imported).

- [ ] **Step 3: Commit**

```bash
git add packages/extensions/whiteboard/src/client/whiteboard-collection.ts
git commit -m "feat(whiteboard): sync-collection option factories (createCollection(...) shape)" -- packages/extensions/whiteboard/src/client/whiteboard-collection.ts
```

---

### Task 3: Rewrite `db.tsx` onto the factories; delete the hybrid; move island to `utils.write`

**Files:**

- Modify: `packages/extensions/whiteboard/src/client/db.tsx`
- Modify: `packages/extensions/whiteboard/src/canvas/island.tsx` (`db.canvasElements.write` → `db.canvasElements.utils.write`, 2 sites)

**Interfaces:**

- Consumes: `createChangeFeed`, `whiteboardCollectionOptions`, `whiteboardElementOptions`.
- Produces: unchanged `WhiteboardDb`/`WhiteboardDbProvider`/`useWhiteboardDb` (element paced write now at `.utils.write`).

- [ ] **Step 1: Rewrite `createWhiteboardDb` + imports**

Replace the `db.tsx` top imports with:

```ts
import {createContext, createSignal, onCleanup, useContext, type JSX} from 'solid-js'
import {createCollection} from '@tanstack/solid-db'
import {commentRow, pendingRow, pinRow, readRow, replyRow, type CursorEvent} from '../shared/rows.js'
import {createChangeFeed} from './change-feed.js'
import {whiteboardCollectionOptions, whiteboardElementOptions} from './whiteboard-collection.js'
```

Keep the existing `accountId` helper and a small local `request` for `postCursor`. Delete `messageData`, `deferUntilReady`, and both inline factories. Replace the `createWhiteboardDb` body with:

```ts
export function createWhiteboardDb(base: string, room: string) {
  const feed = createChangeFeed(base, room)

  const comments = createCollection(
    whiteboardCollectionOptions({feed, base, room, table: 'comments', schema: commentRow}),
  )
  const pins = createCollection(whiteboardCollectionOptions({feed, base, room, table: 'pins', schema: pinRow}))
  const reads = createCollection(whiteboardCollectionOptions({feed, base, room, table: 'reads', schema: readRow}))
  const canvasPending = createCollection(
    whiteboardCollectionOptions({feed, base, room, table: 'canvasPending', schema: pendingRow}),
  )
  const canvasReplies = createCollection(
    whiteboardCollectionOptions({feed, base, room, table: 'canvasReplies', schema: replyRow}),
  )
  const canvasElements = createCollection(whiteboardElementOptions({feed, base, room, scope: 'live'}))
  const canvasDraftElements = createCollection(whiteboardElementOptions({feed, base, room, scope: 'draft'}))

  const [cursors, setCursors] = createSignal<Map<string, CursorEvent>>(new Map())
  feed.onCursor((cursor) => setCursors((previous) => new Map(previous).set(cursor.peerId, cursor)))

  const postCursor = (cursor: Omit<CursorEvent, 'room' | 'lastSeen'>): void =>
    void fetch(`${base}/cursor`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({...cursor, room, lastSeen: Date.now()}),
    }).catch(() => undefined)

  return {
    comments,
    pins,
    reads,
    canvasPending,
    canvasReplies,
    canvasElements,
    canvasDraftElements,
    cursors,
    postCursor,
    accountId: accountId(),
    base,
    room,
    dispose: () => {
      canvasElements.utils.cleanupStrategy()
      canvasDraftElements.utils.cleanupStrategy()
      feed.close()
    },
  }
}
```

- [ ] **Step 2: Move island's element writes to `utils.write`**

In `island.tsx`, `writeLocal`:

```ts
db.canvasElements.utils.write({
  room: props.room,
  elementId: element.id,
  data: asJson(element),
  version: element.version,
})
```

and `commitStep.write`:

```ts
      write: (): void =>
        db.canvasElements.utils.write({
          room: props.room,
          elementId: draft.elementId,
          data: draft.data,
          version: draft.version,
        }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm turbo run typecheck --filter=@conciv/extension-whiteboard`
Expected: clean. Fix any consumer fallout (`inbox.tsx`, `model/comments.tsx`, `pins/`, `overlay.tsx` use `.insert/.update/.delete/.state/.preload/useLiveQuery` — unchanged).

- [ ] **Step 4: Fallow audit + drop now-unused deps**

Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: zero INTRODUCED. `@tanstack/query-db-collection` and `@tanstack/query-core` are now unused — if fallow flags them, remove both from `packages/extensions/whiteboard/package.json`, run `pnpm install`, and re-run the audit.

- [ ] **Step 5: Commit**

```bash
git add packages/extensions/whiteboard/src/client/db.tsx packages/extensions/whiteboard/src/canvas/island.tsx packages/extensions/whiteboard/package.json pnpm-lock.yaml
git commit -m "refactor(whiteboard): db.tsx onto custom sync collections, drop query-collection hybrid" -- packages/extensions/whiteboard/src/client/db.tsx packages/extensions/whiteboard/src/canvas/island.tsx packages/extensions/whiteboard/package.json pnpm-lock.yaml
```

---

### Task 4: Verify — full IT suite (behavior parity)

**Files:** none.

- [ ] **Step 1: Build extension + widget**

Run: `pnpm turbo run build --filter=@conciv/extension-whiteboard --filter=@conciv/widget`

- [ ] **Step 2: Full whiteboard suite**

Run: `pnpm --filter @conciv/extension-whiteboard exec vitest run`
Expected: all 57 green. If a collection never readies → check `markReady()` in `load().finally`. If a just-written row flickers/vanishes → `confirm()` must use `begin({immediate:true})` and the collection must be subscribed (writer captured) before the mutation; collections are lazy, so ensure consumers `preload()`/subscribe (existing code already does via `useLiveQuery`/`preload`).

- [ ] **Step 3: Typecheck + fallow (final gate)**

Run: `pnpm turbo run typecheck --filter=@conciv/extension-whiteboard`
Run: `pnpm exec fallow audit --changed-since main --format json`
Expected: clean; zero INTRODUCED.

- [ ] **Step 4: Live verify**

`pnpm dev`; two tabs; draw in A → B follows; drag in A → B follows, Network ~1 `PUT /elements/live` per 50ms; comment + pin + resolve → both tabs; reload → persists. Kill dev server (LISTEN-safe) after.

- [ ] **Step 5: Push**

```bash
git push
```
