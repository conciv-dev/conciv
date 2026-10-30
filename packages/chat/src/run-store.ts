import type {RunPatch, RunRecord, RunStore} from '@conciv/ai/server'
import {and, asc, desc, eq, isNotNull, lte} from 'drizzle-orm'
import {chatRuns, runs, type ConcivDb} from '@conciv/db'
import {deleteThread} from './thread-queries.js'

function mapRun(row: typeof chatRuns.$inferSelect): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    startedAt: row.startedAt,
    ...(row.finishedAt !== null ? {finishedAt: row.finishedAt} : {}),
    ...(row.error !== null
      ? {error: {message: row.error, ...(row.errorCode !== null ? {code: row.errorCode} : {})}}
      : {}),
    ...(row.usageJson !== null ? {usage: row.usageJson} : {}),
    ...(row.sandboxKey !== null ? {sandboxKey: row.sandboxKey} : {}),
    ...(row.detachedSince !== null ? {detachedSince: row.detachedSince} : {}),
    ...(row.cancelRequested !== null ? {cancelRequested: row.cancelRequested} : {}),
    ...(row.driverEpoch !== null ? {driverEpoch: row.driverEpoch} : {}),
  }
}

function settledColumns(patch: RunPatch): Partial<typeof chatRuns.$inferInsert> {
  return {
    ...(patch.status === undefined ? {} : {status: patch.status}),
    ...(patch.finishedAt === undefined ? {} : {finishedAt: patch.finishedAt}),
    ...(patch.error === undefined ? {} : {error: patch.error.message, errorCode: patch.error.code ?? null}),
    ...(patch.usage === undefined ? {} : {usageJson: patch.usage}),
  }
}

function clearableColumns(patch: RunPatch): Partial<typeof chatRuns.$inferInsert> {
  return {
    ...('sandboxKey' in patch ? {sandboxKey: patch.sandboxKey ?? null} : {}),
    ...('detachedSince' in patch ? {detachedSince: patch.detachedSince ?? null} : {}),
    ...('cancelRequested' in patch ? {cancelRequested: patch.cancelRequested ?? null} : {}),
    ...('driverEpoch' in patch ? {driverEpoch: patch.driverEpoch ?? null} : {}),
  }
}

export function createRunStore(db: ConcivDb): RunStore {
  async function get(runId: string): Promise<RunRecord | null> {
    const rows = await db.select().from(chatRuns).where(eq(chatRuns.runId, runId)).limit(1)
    const row = rows[0]
    return row ? mapRun(row) : null
  }

  return {
    get,
    createOrResume: async ({runId, threadId, startedAt, status}) => {
      const existing = await get(runId)
      if (existing) return existing
      await db
        .insert(chatRuns)
        .values({runId, threadId, status: status ?? 'running', startedAt})
        .onConflictDoNothing({target: chatRuns.runId})
      const stored = await get(runId)
      return stored ?? {runId, threadId, status: status ?? 'running', startedAt}
    },
    update: async (runId, patch) => {
      const set = {...settledColumns(patch), ...clearableColumns(patch)}
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
      return row ? mapRun(row) : null
    },
    listByThread: async (threadId) => {
      const rows = await db
        .select()
        .from(chatRuns)
        .where(eq(chatRuns.threadId, threadId))
        .orderBy(asc(chatRuns.startedAt))
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
  }
}

export async function runningThreadIds(db: ConcivDb): Promise<ReadonlySet<string>> {
  const rows = await db
    .selectDistinct({threadId: chatRuns.threadId})
    .from(chatRuns)
    .where(eq(chatRuns.status, 'running'))
  return new Set(rows.map((row) => row.threadId))
}

export function deleteThreadRuns(db: ConcivDb, threadId: string): void {
  db.delete(chatRuns).where(eq(chatRuns.threadId, threadId)).run()
}

export function clearRunState(db: ConcivDb, id: string): void {
  db.delete(runs).where(eq(runs.sessionId, id)).run()
  deleteThreadRuns(db, id)
  deleteThread(db, id)
}
