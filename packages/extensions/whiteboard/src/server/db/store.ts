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
    const resolved: ElementRow[] = []
    for (const row of rows) {
      const outcome = await upsertElement(scope, row)
      resolved.push(outcome.ok ? outcome.row : outcome.current)
    }
    return resolved
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
