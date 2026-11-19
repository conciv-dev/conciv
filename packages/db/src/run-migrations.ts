import {and, eq, isNull} from 'drizzle-orm'
import {Effect} from 'effect'
import type {ConcivDb} from './db.js'
import {chatRuns} from './run-schema.js'

export const markRunningRunsDetached = Effect.fn('db.runs.markDetached')(function* (db: ConcivDb, now: number) {
  yield* db
    .update(chatRuns)
    .set({detachedSince: now})
    .where(and(eq(chatRuns.status, 'running'), isNull(chatRuns.detachedSince)))
})
