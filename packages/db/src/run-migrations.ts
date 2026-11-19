import {and, eq, isNull} from 'drizzle-orm'
import {Effect} from 'effect'
import type {ConcivDb} from './db.js'
import {chatRuns} from './run-schema.js'

export function markRunningRunsDetached(db: ConcivDb, now: number) {
  return db
    .update(chatRuns)
    .set({detachedSince: now})
    .where(and(eq(chatRuns.status, 'running'), isNull(chatRuns.detachedSince)))
    .pipe(Effect.asVoid)
}
