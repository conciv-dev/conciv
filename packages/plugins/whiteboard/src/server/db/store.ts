import {existsSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createClient} from '@libsql/client'
import {and, asc, eq, gt, max, sql, type SQL} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/libsql'
import {migrate} from 'drizzle-orm/libsql/migrator'
import type {RunnableQuery} from 'drizzle-orm/runnable-query'
import type {SQLiteTable} from 'drizzle-orm/sqlite-core'
import type {CommentRow, CursorEvent, ElementRow, PendingRow, PinRow, ReadRow, ReplyRow} from '../../shared/rows.js'
import {
  canvasDraftElements,
  canvasElements,
  canvasPending,
  canvasReplies,
  comments,
  pins,
  reads,
  whiteboardChanges,
} from './schema.js'

type TableRows = {
  canvasElements: ElementRow
  canvasDraftElements: ElementRow
  canvasPending: PendingRow
  canvasReplies: ReplyRow
  comments: CommentRow
  pins: PinRow
  reads: ReadRow
}
type Change = {
  [K in keyof TableRows]: {table: K; room: string; key: string} & (
    | {type: 'upsert'; row: TableRows[K]}
    | {type: 'delete'}
  )
}[keyof TableRows]
type RowTableName = 'comments' | 'pins' | 'reads' | 'canvasPending' | 'canvasReplies'
export type WhiteboardChange = Change & {cursor: number}
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

const present = (table: SQLiteTable, condition: SQL | undefined): SQL =>
  sql`EXISTS (SELECT 1 FROM ${table} WHERE ${condition})`

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

  const record = (change: Pick<Change, 'table' | 'room' | 'key' | 'type'>, when: SQL = sql`1`) =>
    db.all<{sequence: number}>(
      sql`INSERT INTO ${whiteboardChanges} (room, sequence, "table", key, type) SELECT ${change.room}, coalesce((SELECT max(sequence) FROM ${whiteboardChanges} WHERE room = ${change.room}), 0) + 1, ${change.table}, ${change.key}, ${change.type} WHERE ${when} RETURNING sequence`,
    )

  const announce = (change: Change, recorded: {sequence: number}[]): boolean => {
    const [entry] = recorded
    if (!entry) return false
    emit({...change, cursor: entry.sequence})
    return true
  }

  const since = async (room: string, after: number) => {
    const [changes, [latest]] = await db.batch([
      db
        .select()
        .from(whiteboardChanges)
        .where(and(eq(whiteboardChanges.room, room), gt(whiteboardChanges.sequence, after)))
        .orderBy(asc(whiteboardChanges.sequence)),
      db
        .select({cursor: max(whiteboardChanges.sequence)})
        .from(whiteboardChanges)
        .where(eq(whiteboardChanges.room, room)),
    ])
    return {
      changes: changes.map((change) => ({
        table: change.table,
        key: change.key,
        type: change.type,
        cursor: change.sequence,
      })),
      cursor: latest?.cursor ?? 0,
    }
  }

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
    const change = {table: elementTableName(scope), room: row.room, key: row.elementId, type: 'upsert'} as const
    const [, recorded] = await db.batch([
      db
        .insert(table)
        .values(row)
        .onConflictDoUpdate({target: [table.room, table.elementId], set: {data: row.data, version: row.version}}),
      record(change),
    ])
    announce({...change, row}, recorded)
    return {ok: true, row}
  }

  const upsertElements = async (scope: ElementScope, rows: ElementRow[]): Promise<ElementRow[]> => {
    const resolved: ElementRow[] = []
    for (const row of rows) {
      const outcome = await upsertElement(scope, row)
      resolved.push(outcome.ok ? outcome.row : outcome.current)
    }
    return resolved
  }

  const deleteElement = async (scope: ElementScope, room: string, elementId: string): Promise<boolean> => {
    const table = elementTable(scope)
    const match = and(eq(table.room, room), eq(table.elementId, elementId))
    const change = {table: elementTableName(scope), room, key: elementId, type: 'delete'} as const
    const [recorded] = await db.batch([record(change, present(table, match)), db.delete(table).where(match)])
    return announce(change, recorded)
  }

  const deleteElements = async (scope: ElementScope, room: string, elementIds: string[]): Promise<number> => {
    let deleted = 0
    for (const elementId of elementIds) {
      if (await deleteElement(scope, room, elementId)) deleted += 1
    }
    return deleted
  }

  const rowTable = <Row extends {id: string}, Insert extends {id: string}>(spec: {
    table: SQLiteTable
    name: RowTableName
    readRoom: (row: Insert) => string
    match: (id: string, room: string) => SQL | undefined
    insert: (row: Insert) => RunnableQuery<Row[], 'sqlite'>
    update: (match: SQL | undefined, patch: Partial<Insert>) => RunnableQuery<Row[], 'sqlite'>
    saved: (row: Row, room: string) => Change
  }) => ({
    insert: async (row: Insert): Promise<Row> => {
      const room = spec.readRoom(row)
      const [[saved], recorded] = await db.batch([
        spec.insert(row),
        record({table: spec.name, room, key: row.id, type: 'upsert'}),
      ])
      if (!saved) throw new Error(`${spec.name} row ${row.id} was not stored`)
      announce(spec.saved(saved, room), recorded)
      return saved
    },
    update: async (id: string, room: string, patch: Partial<Insert>): Promise<Row | undefined> => {
      const match = spec.match(id, room)
      const [[saved], recorded] = await db.batch([
        spec.update(match, patch),
        record({table: spec.name, room, key: id, type: 'upsert'}, present(spec.table, match)),
      ])
      if (!saved) return undefined
      announce(spec.saved(saved, room), recorded)
      return saved
    },
    remove: async (id: string, room: string): Promise<boolean> => {
      const match = spec.match(id, room)
      const change = {table: spec.name, room, key: id, type: 'delete'} as const
      const [recorded] = await db.batch([
        record(change, present(spec.table, match)),
        db.delete(spec.table).where(match),
      ])
      return announce(change, recorded)
    },
  })

  const commentRows = rowTable({
    table: comments,
    name: 'comments',
    readRoom: (row: typeof comments.$inferInsert) => row.sessionId,
    match: (id, room) => and(eq(comments.id, id), eq(comments.sessionId, room)),
    insert: (row) => db.insert(comments).values(row).returning(),
    update: (match, patch) => db.update(comments).set(patch).where(match).returning(),
    saved: (row: CommentRow, room) => ({table: 'comments', room, key: row.id, type: 'upsert', row}),
  })
  const pinRows = rowTable({
    table: pins,
    name: 'pins',
    readRoom: (row: typeof pins.$inferInsert) => row.room,
    match: (id, room) => and(eq(pins.id, id), eq(pins.room, room)),
    insert: (row) => db.insert(pins).values(row).returning(),
    update: (match, patch) => db.update(pins).set(patch).where(match).returning(),
    saved: (row: PinRow, room) => ({table: 'pins', room, key: row.id, type: 'upsert', row}),
  })
  const readRows = rowTable({
    table: reads,
    name: 'reads',
    readRoom: (row: typeof reads.$inferInsert) => row.sessionId,
    match: (id, room) => and(eq(reads.id, id), eq(reads.sessionId, room)),
    insert: (row) => db.insert(reads).values(row).returning(),
    update: (match, patch) => db.update(reads).set(patch).where(match).returning(),
    saved: (row: ReadRow, room) => ({table: 'reads', room, key: row.id, type: 'upsert', row}),
  })
  const pendingRows = rowTable({
    table: canvasPending,
    name: 'canvasPending',
    readRoom: (row: typeof canvasPending.$inferInsert) => row.room,
    match: (id, room) => and(eq(canvasPending.id, id), eq(canvasPending.room, room)),
    insert: (row) => db.insert(canvasPending).values(row).returning(),
    update: (match, patch) => db.update(canvasPending).set(patch).where(match).returning(),
    saved: (row: PendingRow, room) => ({table: 'canvasPending', room, key: row.id, type: 'upsert', row}),
  })
  const replyRows = rowTable({
    table: canvasReplies,
    name: 'canvasReplies',
    readRoom: (row: typeof canvasReplies.$inferInsert) => row.room,
    match: (id, room) => and(eq(canvasReplies.id, id), eq(canvasReplies.room, room)),
    insert: (row) => db.insert(canvasReplies).values(row).returning(),
    update: (match, patch) => db.update(canvasReplies).set(patch).where(match).returning(),
    saved: (row: ReplyRow, room) => ({table: 'canvasReplies', room, key: row.id, type: 'upsert', row}),
  })

  return {
    db,
    onEvent,
    cursor,
    since,
    listElements,
    upsertElement,
    upsertElements,
    deleteElement,
    deleteElements,
    insertComment: commentRows.insert,
    updateComment: commentRows.update,
    deleteComment: commentRows.remove,
    insertPin: pinRows.insert,
    updatePin: pinRows.update,
    deletePin: pinRows.remove,
    insertRead: readRows.insert,
    updateRead: readRows.update,
    deleteRead: readRows.remove,
    insertPending: pendingRows.insert,
    updatePending: pendingRows.update,
    deletePending: pendingRows.remove,
    insertReply: replyRows.insert,
    updateReply: replyRows.update,
    deleteReply: replyRows.remove,
    close: () => client.close(),
  }
}
