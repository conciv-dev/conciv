import {eq} from 'drizzle-orm'
import type {ConcivDb} from './db.js'
import {sessions} from './schema.js'
import {runMessages} from './run-schema.js'

type QueryHandle = Pick<ConcivDb, 'select' | 'insert' | 'delete'>

export function modelOf(db: ConcivDb, id: string): string | null {
  const rows = db.select({model: sessions.model}).from(sessions).where(eq(sessions.id, id)).all()
  return rows[0]?.model ?? null
}

export function runMessagesFor(db: QueryHandle, id: string): {messages: unknown[]; updatedAt: number} | null {
  const rows = db
    .select({messages: runMessages.messages, updatedAt: runMessages.updatedAt})
    .from(runMessages)
    .where(eq(runMessages.sessionId, id))
    .all()
  return rows[0] ?? null
}
