import {and, asc, desc, eq, isNotNull, lte, sql} from 'drizzle-orm'
import type {NodeSQLiteDatabase} from 'drizzle-orm/node-sqlite'
import type {MessagePage} from '@tanstack/ai-persistence'
import {z} from 'zod'
import type {ModelMessage} from '@conciv/protocol/chat-message-types'
import type {ChatStores} from './chat-server.js'
import {chatMetadata, chatRuns, chatThreads} from './chat-tables.js'

type RunRecord = NonNullable<Awaited<ReturnType<ChatStores['runs']['get']>>>

type RunPatch = Parameters<ChatStores['runs']['update']>[1]

function mapRun(row: typeof chatRuns.$inferSelect): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    startedAt: row.startedAt,
    ...(row.finishedAt === null ? {} : {finishedAt: row.finishedAt}),
    ...(row.error === null
      ? {}
      : {error: {message: row.error, ...(row.errorCode === null ? {} : {code: row.errorCode})}}),
    ...(row.usageJson === null ? {} : {usage: row.usageJson}),
    ...(row.sandboxKey === null ? {} : {sandboxKey: row.sandboxKey}),
    ...(row.detachedSince === null ? {} : {detachedSince: row.detachedSince}),
    ...(row.cancelRequested === null ? {} : {cancelRequested: row.cancelRequested}),
    ...(row.driverEpoch === null ? {} : {driverEpoch: row.driverEpoch}),
  }
}

type RunColumns = Partial<typeof chatRuns.$inferInsert>

function outcomeColumns(patch: RunPatch): RunColumns {
  return {
    ...(patch.status === undefined ? {} : {status: patch.status}),
    ...(patch.finishedAt === undefined ? {} : {finishedAt: patch.finishedAt}),
    ...(patch.error === undefined ? {} : {error: patch.error.message, errorCode: patch.error.code ?? null}),
    ...(patch.usage === undefined ? {} : {usageJson: patch.usage}),
  }
}

function durableColumns(patch: RunPatch): RunColumns {
  return {
    ...('sandboxKey' in patch ? {sandboxKey: patch.sandboxKey ?? null} : {}),
    ...('detachedSince' in patch ? {detachedSince: patch.detachedSince ?? null} : {}),
    ...('cancelRequested' in patch ? {cancelRequested: patch.cancelRequested ?? null} : {}),
    ...('driverEpoch' in patch ? {driverEpoch: patch.driverEpoch ?? null} : {}),
  }
}

type ThreadWindow = {limit?: number; before?: string}

type OutlineRow = {id: string | null; role: string}

type WindowRange = {start: number; end: number; cursor: string | null}

const StoredMessageSchema = z.custom<ModelMessage>((value) => typeof value === 'object' && value !== null)

function windowRange(outline: readonly OutlineRow[], window: ThreadWindow): WindowRange | null {
  const end = window.before === undefined ? outline.length : outline.findIndex((row) => row.id === window.before)
  if (end === -1) return null
  const start = turnStart(outline, Math.max(end - (window.limit ?? end), 0))
  const cursor = start === 0 ? null : (outline[start]?.id ?? null)
  return {start, end, cursor}
}

function turnStart(outline: readonly OutlineRow[], from: number): number {
  const userAt = outline.findLastIndex((row, index) => index <= from && row.role === 'user' && row.id !== null)
  return Math.max(userAt, 0)
}

const metadataAt = (namespace: string, key: string) =>
  and(eq(chatMetadata.namespace, namespace), eq(chatMetadata.key, key))

export function drizzleChatStores(db: NodeSQLiteDatabase, opts: {harnessOf: (threadId: string) => string}): ChatStores {
  const get = async (runId: string): Promise<RunRecord | null> => {
    const rows = await db.select().from(chatRuns).where(eq(chatRuns.runId, runId)).limit(1)
    const row = rows[0]
    return row === undefined ? null : mapRun(row)
  }
  async function wholeThread(threadId: string): Promise<ModelMessage[]> {
    const rows = await db
      .select({messagesJson: chatThreads.messagesJson})
      .from(chatThreads)
      .where(eq(chatThreads.threadId, threadId))
      .limit(1)
    return rows[0]?.messagesJson ?? []
  }
  async function threadWindow(threadId: string, window: ThreadWindow): Promise<MessagePage> {
    const outline = db.all<OutlineRow>(
      sql`SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.role') AS role FROM ${chatThreads}, json_each(${chatThreads.messagesJson}) WHERE ${chatThreads.threadId} = ${threadId} ORDER BY CAST(key AS INTEGER)`,
    )
    const range = windowRange(outline, window)
    if (range === null) return {messages: [], truncated: false}
    const rows = db.all<{value: string}>(
      sql`SELECT value FROM ${chatThreads}, json_each(${chatThreads.messagesJson}) WHERE ${chatThreads.threadId} = ${threadId} AND CAST(key AS INTEGER) >= ${range.start} AND CAST(key AS INTEGER) < ${range.end} ORDER BY CAST(key AS INTEGER)`,
    )
    const messages = rows.map((row) => StoredMessageSchema.parse(JSON.parse(row.value)))
    return range.cursor === null ? {messages, truncated: false} : {messages, truncated: true, cursor: range.cursor}
  }
  function loadThread(threadId: string): Promise<ModelMessage[]>
  function loadThread(threadId: string, window: ThreadWindow): Promise<ModelMessage[] | MessagePage>
  function loadThread(threadId: string, window?: ThreadWindow): Promise<ModelMessage[] | MessagePage> {
    return window?.limit === undefined ? wholeThread(threadId) : threadWindow(threadId, window)
  }
  return {
    messages: {
      loadThread,
      saveThread: async (threadId, messages) => {
        const updatedAt = Date.now()
        await db
          .insert(chatThreads)
          .values({threadId, messagesJson: messages, updatedAt})
          .onConflictDoUpdate({target: chatThreads.threadId, set: {messagesJson: messages, updatedAt}})
      },
    },
    runs: {
      get,
      createOrResume: async ({runId, threadId, startedAt, status}) => {
        await db
          .insert(chatRuns)
          .values({runId, threadId, harnessId: opts.harnessOf(threadId), status: status ?? 'running', startedAt})
          .onConflictDoNothing({target: chatRuns.runId})
        const stored = await get(runId)
        if (stored === null) throw new Error(`run ${runId} was not stored`)
        return stored
      },
      update: async (runId, patch) => {
        const set = {...outcomeColumns(patch), ...durableColumns(patch)}
        if (Object.keys(set).length === 0) return
        await db.update(chatRuns).set(set).where(eq(chatRuns.runId, runId))
      },
      findActiveRun: async (threadId) => {
        const rows = await db
          .select()
          .from(chatRuns)
          .where(and(eq(chatRuns.threadId, threadId), eq(chatRuns.status, 'running')))
          .orderBy(desc(chatRuns.startedAt))
          .limit(1)
        const row = rows[0]
        return row === undefined ? null : mapRun(row)
      },
      listByThread: async (threadId) => {
        const rows = await db
          .select()
          .from(chatRuns)
          .where(eq(chatRuns.threadId, threadId))
          .orderBy(asc(chatRuns.startedAt))
        return rows.map(mapRun)
      },
      known: (runId) => db.select().from(chatRuns).where(eq(chatRuns.runId, runId)).get() !== undefined,
      listRunning: async () => {
        const rows = await db.select().from(chatRuns).where(eq(chatRuns.status, 'running'))
        return rows.map(mapRun)
      },
      listReclaimable: async ({now, ttlMs}) => {
        const rows = await db
          .select()
          .from(chatRuns)
          .where(
            and(
              eq(chatRuns.status, 'running'),
              isNotNull(chatRuns.detachedSince),
              lte(chatRuns.detachedSince, now - ttlMs),
            ),
          )
        return rows.map(mapRun)
      },
    },
    metadata: {
      get: async (namespace, key) => {
        const rows = await db
          .select({valueJson: chatMetadata.valueJson})
          .from(chatMetadata)
          .where(metadataAt(namespace, key))
        return rows[0]?.valueJson ?? null
      },
      set: async (namespace, key, value) => {
        if (value === null || value === undefined) throw new TypeError(`cannot store ${String(value)} at ${key}`)
        await db
          .insert(chatMetadata)
          .values({namespace, key, valueJson: value})
          .onConflictDoUpdate({target: [chatMetadata.namespace, chatMetadata.key], set: {valueJson: value}})
      },
      delete: async (namespace, key) => {
        await db.delete(chatMetadata).where(metadataAt(namespace, key))
      },
    },
  }
}
