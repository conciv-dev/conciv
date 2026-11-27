import type {Context as PluginContext} from '@conciv/backend-plugin-api/effect/plugin'
import {sortBy} from 'es-toolkit'
import {Clock, Context, Effect, Layer, Option, PubSub, Semaphore, Stream} from 'effect'
import {z} from 'zod'
import {storeErrors} from './errors/store-errors.js'
import {
  commentRow,
  elementRow,
  pendingRow,
  pinRow,
  readRow,
  replyRow,
  type CommentRow,
  type CursorEvent,
  type ElementRow,
  type PendingRow,
  type PinRow,
  type ReadRow,
  type ReplyRow,
} from './rows.js'
import {causeFrom} from './errors/cause.js'

type TableRows = {
  canvasElements: ElementRow
  canvasDraftElements: ElementRow
  canvasPending: PendingRow
  canvasReplies: ReplyRow
  comments: CommentRow
  pins: PinRow
  reads: ReadRow
}
type TableName = keyof TableRows
type Change = {
  [K in TableName]: {table: K; room: string; key: string} & ({type: 'upsert'; row: TableRows[K]} | {type: 'delete'})
}[TableName]
type RowTableName = 'comments' | 'pins' | 'reads' | 'canvasPending' | 'canvasReplies'

type WhiteboardChange = Change & {cursor: number}
export type WhiteboardEvent = WhiteboardChange | {table: 'cursor'; room: string; cursor: CursorEvent}
type ElementScope = 'live' | 'draft'

const PENDING_CLAIM_LEASE_MS = 30_000
const CURSOR_DIGITS = 12
const SCAN_PAGE = 1000

const ROW_SEGMENT: Record<RowTableName, string> = {
  comments: 'comment',
  pins: 'pin',
  reads: 'read',
  canvasPending: 'pending',
  canvasReplies: 'reply',
}

const StoredChange = z.object({
  table: z.enum([
    'canvasElements',
    'canvasDraftElements',
    'canvasPending',
    'canvasReplies',
    'comments',
    'pins',
    'reads',
  ]),
  key: z.string(),
  type: z.enum(['upsert', 'delete']),
})
const Sequence = z.number().int().min(0)
const storedRow = <Row>(row: z.ZodType<Row>) =>
  z.object({order: z.number().int(), claimedUntil: z.number().nullable().catch(null), row})

const roomPrefix = (room: string) => `room/${room}/`
const rowPrefix = (table: RowTableName, room: string) => `${roomPrefix(room)}${ROW_SEGMENT[table]}/`
const elementPrefix = (scope: ElementScope, room: string) => `${roomPrefix(room)}el/${scope}/`
const changePrefix = (room: string) => `${roomPrefix(room)}change/`
const changeKey = (room: string, cursor: number) =>
  `${changePrefix(room)}${String(cursor).padStart(CURSOR_DIGITS, '0')}`
const seqKey = (room: string) => `${roomPrefix(room)}seq`
const elementTable = (scope: ElementScope) => (scope === 'draft' ? 'canvasDraftElements' : 'canvasElements')
const elementIndex = (row: ElementRow): string => z.object({index: z.string()}).catch({index: ''}).parse(row.data).index

const decode = <Value>(schema: z.ZodType<Value>, key: string, value: unknown) =>
  Effect.try({
    try: () => schema.parse(value),
    catch: (error) =>
      storeErrors.UNREADABLE({
        key,
        reason: error instanceof Error ? error.message : String(error),
        ...causeFrom(error),
      }),
  })

export function makeWhiteboardStore(storage: PluginContext['storage']) {
  return Effect.gen(function* () {
    const writes = yield* Semaphore.make(1)
    const events = yield* PubSub.unbounded<WhiteboardEvent>()
    const serial = <Value, Failure>(work: Effect.Effect<Value, Failure>) => writes.withPermits(1)(work)
    const publish = (event: WhiteboardEvent) => PubSub.publish(events, event)

    const scanAll = (prefix: string, after?: string) =>
      Stream.paginate(after, (from) =>
        storage
          .scan({prefix, ...(from === undefined ? {} : {after: from}), limit: SCAN_PAGE})
          .pipe(Effect.map((page) => [page.entries, Option.fromNullishOr(page.next)] as const)),
      ).pipe(Stream.runCollect)

    const readSequence = Effect.fn('whiteboard.store.readSequence')(function* (room: string) {
      const stored = yield* storage.get(seqKey(room))
      if (stored === undefined) return 0
      return yield* decode(Sequence, seqKey(room), stored)
    })

    const record = Effect.fn('whiteboard.store.record')(function* (change: Change, write: Effect.Effect<void>) {
      const cursor = (yield* readSequence(change.room)) + 1
      yield* write
      yield* storage.set(changeKey(change.room, cursor), {table: change.table, key: change.key, type: change.type})
      yield* storage.set(seqKey(change.room), cursor)
      yield* publish({...change, cursor})
      return cursor
    })

    const since = Effect.fn('whiteboard.store.since')(function* (room: string, after: number) {
      const entries = yield* scanAll(changePrefix(room), changeKey(room, after))
      const changes = yield* Effect.forEach(entries, (entry) =>
        decode(StoredChange, entry.key, entry.value).pipe(
          Effect.map((change) => ({...change, cursor: Number(entry.key.slice(changePrefix(room).length))})),
        ),
      )
      return {changes, cursor: yield* readSequence(room)}
    })

    const elementKey = (scope: ElementScope, room: string, elementId: string) =>
      `${elementPrefix(scope, room)}${elementId}`

    const getElement = Effect.fn('whiteboard.store.getElement')(function* (
      scope: ElementScope,
      room: string,
      elementId: string,
    ) {
      const key = elementKey(scope, room, elementId)
      const stored = yield* storage.get(key)
      if (stored === undefined) return undefined
      return yield* decode(elementRow, key, stored)
    })

    const listElements = Effect.fn('whiteboard.store.listElements')(function* (scope: ElementScope, room: string) {
      const entries = yield* scanAll(elementPrefix(scope, room))
      const rows = yield* Effect.forEach(entries, (entry) => decode(elementRow, entry.key, entry.value))
      return sortBy(rows, [elementIndex, (row) => row.elementId])
    })

    const writeElement = <Failure>(
      scope: ElementScope,
      row: ElementRow,
      conflicted: (current: ElementRow) => Effect.Effect<ElementRow, Failure>,
    ) =>
      Effect.gen(function* () {
        const current = yield* getElement(scope, row.room, row.elementId)
        if (current && current.version >= row.version) return yield* conflicted(current)
        const change: Change = {table: elementTable(scope), room: row.room, key: row.elementId, type: 'upsert', row}
        yield* record(change, storage.set(elementKey(scope, row.room, row.elementId), row))
        return row
      })

    const upsertElement = (scope: ElementScope, row: ElementRow) =>
      serial(
        writeElement(scope, row, (current) =>
          Effect.fail(storeErrors.VERSION_CONFLICT({elementId: row.elementId, internal: {current}})),
        ),
      )

    const upsertElements = (scope: ElementScope, rows: readonly ElementRow[]) =>
      serial(Effect.forEach(rows, (row) => writeElement(scope, row, Effect.succeed)))

    const removeElement = (scope: ElementScope, room: string, elementId: string) =>
      Effect.gen(function* () {
        const key = elementKey(scope, room, elementId)
        if ((yield* storage.get(key)) === undefined) return false
        yield* record({table: elementTable(scope), room, key: elementId, type: 'delete'}, storage.remove(key))
        return true
      })

    const deleteElement = (scope: ElementScope, room: string, elementId: string) =>
      serial(removeElement(scope, room, elementId))

    const deleteElements = (scope: ElementScope, room: string, elementIds: readonly string[]) =>
      serial(
        Effect.forEach(elementIds, (elementId) => removeElement(scope, room, elementId)).pipe(
          Effect.map((removed) => removed.filter(Boolean).length),
        ),
      )

    const rowTable = <Row extends {id: string}>(
      table: RowTableName,
      schema: z.ZodType<Row>,
      upserted: (room: string, row: Row) => Change,
    ) => {
      const stored = storedRow(schema)
      const keyFor = (room: string, id: string) => `${rowPrefix(table, room)}${id}`
      const read = Effect.fn(`whiteboard.store.${table}.read`)(function* (room: string, id: string) {
        const key = keyFor(room, id)
        const value = yield* storage.get(key)
        if (value === undefined) return undefined
        return yield* decode(stored, key, value)
      })
      const list = Effect.fn(`whiteboard.store.${table}.list`)(function* (room: string) {
        const entries = yield* scanAll(rowPrefix(table, room))
        const rows = yield* Effect.forEach(entries, (entry) => decode(stored, entry.key, entry.value))
        return sortBy(rows, [(entry) => entry.order]).map((entry) => entry.row)
      })
      const get = Effect.fn(`whiteboard.store.${table}.get`)(function* (room: string, id: string) {
        const entry = yield* read(room, id)
        if (!entry) return yield* Effect.fail(storeErrors.ROW_NOT_FOUND({id}))
        return entry.row
      })
      const insert = (room: string, row: Row) =>
        serial(
          Effect.gen(function* () {
            const order = (yield* readSequence(room)) + 1
            yield* record(upserted(room, row), storage.set(keyFor(room, row.id), {order, claimedUntil: null, row}))
            return row
          }),
        )
      const update = (room: string, id: string, patch: Partial<Row>) =>
        serial(
          Effect.gen(function* () {
            const entry = yield* read(room, id)
            if (!entry) return yield* Effect.fail(storeErrors.ROW_NOT_FOUND({id}))
            const row = yield* decode(schema, keyFor(room, id), {...entry.row, ...patch, id: entry.row.id})
            yield* record(upserted(room, row), storage.set(keyFor(room, id), {...entry, row}))
            return row
          }),
        )
      const remove = (room: string, id: string) =>
        serial(
          Effect.gen(function* () {
            if (!(yield* read(room, id))) return false
            yield* record({table, room, key: id, type: 'delete'}, storage.remove(keyFor(room, id)))
            return true
          }),
        )
      const claim = (room: string, id: string) =>
        serial(
          Effect.gen(function* () {
            const entry = yield* read(room, id)
            const now = yield* Clock.currentTimeMillis
            if (!entry || (entry.claimedUntil !== null && entry.claimedUntil > now)) return false
            yield* storage.set(keyFor(room, id), {...entry, claimedUntil: now + PENDING_CLAIM_LEASE_MS})
            return true
          }),
        )
      const claimedUntil = (room: string, id: string) =>
        read(room, id).pipe(Effect.map((entry) => (entry ? Option.some(entry.claimedUntil) : Option.none())))
      return {list, get, insert, update, remove, claim, claimedUntil}
    }

    return {
      follow: PubSub.subscribe(events).pipe(Effect.map(Stream.fromSubscription)),
      cursor: (event: CursorEvent) =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((lastSeen) => publish({table: 'cursor', room: event.room, cursor: {...event, lastSeen}})),
        ),
      since,
      listElements,
      getElement,
      upsertElement,
      upsertElements,
      deleteElement,
      deleteElements,
      comments: rowTable('comments', commentRow, (room, row) => ({
        table: 'comments',
        room,
        key: row.id,
        type: 'upsert',
        row,
      })),
      pins: rowTable('pins', pinRow, (room, row) => ({table: 'pins', room, key: row.id, type: 'upsert', row})),
      reads: rowTable('reads', readRow, (room, row) => ({table: 'reads', room, key: row.id, type: 'upsert', row})),
      pending: rowTable('canvasPending', pendingRow, (room, row) => ({
        table: 'canvasPending',
        room,
        key: row.id,
        type: 'upsert',
        row,
      })),
      replies: rowTable('canvasReplies', replyRow, (room, row) => ({
        table: 'canvasReplies',
        room,
        key: row.id,
        type: 'upsert',
        row,
      })),
    }
  }).pipe(Effect.withSpan('whiteboard.store.make'))
}

export type Store = Effect.Success<ReturnType<typeof makeWhiteboardStore>>

export const WhiteboardStore = Context.Service<Store>('@conciv/plugin-whiteboard/WhiteboardStore')

export const layer = (storage: PluginContext['storage']) => Layer.effect(WhiteboardStore, makeWhiteboardStore(storage))
