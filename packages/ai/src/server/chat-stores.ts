import {and, asc, desc, eq, isNotNull, lte} from 'drizzle-orm'
import type {NodeSQLiteDatabase} from 'drizzle-orm/node-sqlite'
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

const metadataAt = (namespace: string, key: string) =>
  and(eq(chatMetadata.namespace, namespace), eq(chatMetadata.key, key))

export function drizzleChatStores(db: NodeSQLiteDatabase): ChatStores {
  const get = async (runId: string): Promise<RunRecord | null> => {
    const rows = await db.select().from(chatRuns).where(eq(chatRuns.runId, runId)).limit(1)
    const row = rows[0]
    return row === undefined ? null : mapRun(row)
  }
  return {
    messages: {
      loadThread: async (threadId: string) => {
        const rows = await db
          .select({messagesJson: chatThreads.messagesJson})
          .from(chatThreads)
          .where(eq(chatThreads.threadId, threadId))
          .limit(1)
        return rows[0]?.messagesJson ?? []
      },
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
          .values({runId, threadId, status: status ?? 'running', startedAt})
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
