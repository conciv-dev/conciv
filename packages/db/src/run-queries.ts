import {eq} from 'drizzle-orm'
import {Effect} from 'effect'
import type {ConcivDb} from './db.js'
import {sessions} from './schema.js'
import {runMessages} from './run-schema.js'

export async function readModel(db: ConcivDb, id: string): Promise<string | null> {
  const rows = await Effect.runPromise(db.select({model: sessions.model}).from(sessions).where(eq(sessions.id, id)))
  return rows[0]?.model ?? null
}

export async function runMessagesFor(
  db: ConcivDb,
  id: string,
): Promise<{messages: unknown[]; updatedAt: number} | null> {
  const rows = await Effect.runPromise(
    db
      .select({messages: runMessages.messages, updatedAt: runMessages.updatedAt})
      .from(runMessages)
      .where(eq(runMessages.sessionId, id)),
  )
  return rows[0] ?? null
}
