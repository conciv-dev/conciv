import {eq} from 'drizzle-orm'
import type {ConcivDb} from './db.js'
import {sessions} from './schema.js'
import {runMessages, runs, sessionHistory} from './run-schema.js'
import {deleteThreadRuns} from './run-store.js'
import {deleteThread} from './thread-queries.js'

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

export function sessionHistoryFor(db: QueryHandle, id: string): {messages: unknown[]; updatedAt: number} | null {
  const rows = db
    .select({messages: sessionHistory.messages, updatedAt: sessionHistory.updatedAt})
    .from(sessionHistory)
    .where(eq(sessionHistory.sessionId, id))
    .all()
  return rows[0] ?? null
}

export function clearRunState(db: ConcivDb, id: string): void {
  db.delete(runs).where(eq(runs.sessionId, id)).run()
  deleteThreadRuns(db, id)
  deleteThread(db, id)
}
