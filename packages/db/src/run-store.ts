import type {RunRecord, RunStatus, RunStore} from '@tanstack/ai'
import {and, asc, desc, eq, isNotNull, isNull, lte} from 'drizzle-orm'
import type {RunPhase} from '@conciv/protocol/run-types'
import type {ConcivDb} from './db.js'
import {chatRuns, runs} from './run-schema.js'

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

type RunPatch = Parameters<RunStore['update']>[1]

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

export function markRunningRunsDetached(db: ConcivDb, now: number): void {
  db.update(chatRuns)
    .set({detachedSince: now})
    .where(and(eq(chatRuns.status, 'running'), isNull(chatRuns.detachedSince)))
    .run()
}

export function deleteThreadRuns(db: ConcivDb, threadId: string): void {
  db.delete(chatRuns).where(eq(chatRuns.threadId, threadId)).run()
}

const STATUS_BY_PHASE: Record<RunPhase, RunStatus> = {
  running: 'running',
  stopping: 'running',
  completed: 'completed',
  failed: 'failed',
  aborted: 'aborted',
}

export function importLegacyRuns(db: ConcivDb): void {
  const legacy = db.select().from(runs).all()
  if (legacy.length === 0) return
  const values = legacy.map((row) => ({
    runId: row.runId,
    threadId: row.sessionId,
    status: STATUS_BY_PHASE[row.phase],
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    error: row.error,
    cancelRequested: row.phase === 'stopping' ? true : null,
  }))
  db.insert(chatRuns).values(values).onConflictDoNothing({target: chatRuns.runId}).run()
}
