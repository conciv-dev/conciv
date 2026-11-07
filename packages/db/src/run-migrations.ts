import {and, eq, isNull} from 'drizzle-orm'
import type {RunStatus} from '@conciv/protocol/chat-event-types'
import type {RunPhase} from '@conciv/protocol/chat-event-types'
import type {ConcivDb} from './db.js'
import {chatRuns, runs} from './run-schema.js'
import {sessions} from './schema.js'

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

const LEGACY_HARNESS_ID = 'claude'

export function importLegacyRuns(db: ConcivDb): void {
  const legacy = db
    .select({run: runs, harnessKind: sessions.harnessKind})
    .from(runs)
    .leftJoin(sessions, eq(sessions.id, runs.sessionId))
    .all()
  if (legacy.length === 0) return
  const values = legacy.map(({run: row, harnessKind}) => ({
    runId: row.runId,
    threadId: row.sessionId,
    harnessId: harnessKind ?? LEGACY_HARNESS_ID,
    status: STATUS_BY_PHASE[row.phase],
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    error: row.error,
    cancelRequested: row.phase === 'stopping' ? true : null,
  }))
  db.insert(chatRuns).values(values).onConflictDoNothing({target: chatRuns.runId}).run()
}
