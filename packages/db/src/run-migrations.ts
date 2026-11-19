import {and, eq, isNull} from 'drizzle-orm'
import {Effect} from 'effect'
import type {RunStatus} from '@conciv/protocol/chat-event-types'
import type {RunPhase} from '@conciv/protocol/chat-event-types'
import type {ConcivDb} from './db.js'
import {chatRuns, runs} from './run-schema.js'
import {sessions} from './schema.js'

export function markRunningRunsDetached(db: ConcivDb, now: number) {
  return db
    .update(chatRuns)
    .set({detachedSince: now})
    .where(and(eq(chatRuns.status, 'running'), isNull(chatRuns.detachedSince)))
    .pipe(Effect.asVoid)
}

const STATUS_BY_PHASE: Record<RunPhase, RunStatus> = {
  running: 'running',
  stopping: 'running',
  completed: 'completed',
  failed: 'failed',
  aborted: 'aborted',
}

const LEGACY_HARNESS_ID = 'claude'

export const importLegacyRuns = Effect.fn('importLegacyRuns')(function* (db: ConcivDb) {
  const legacy = yield* db
    .select({run: runs, harnessKind: sessions.harnessKind})
    .from(runs)
    .leftJoin(sessions, eq(sessions.id, runs.sessionId))
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
  yield* db.insert(chatRuns).values(values).onConflictDoNothing({target: chatRuns.runId})
})
