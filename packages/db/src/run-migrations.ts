import {and, eq, isNull} from 'drizzle-orm'
import type {RunStatus} from '@conciv/ai'
import type {RunPhase} from '@conciv/ai'
import type {ConcivDb} from './db.js'
import {chatRuns, runs} from './run-schema.js'

export function markRunningRunsDetached(db: ConcivDb, now: number): void {
  db.update(chatRuns)
    .set({detachedSince: now})
    .where(and(eq(chatRuns.status, 'running'), isNull(chatRuns.detachedSince)))
    .run()
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
