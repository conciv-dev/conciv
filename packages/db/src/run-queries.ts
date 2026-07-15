import {and, eq, inArray, sql} from 'drizzle-orm'
import type {ConcivDb} from './db.js'
import {sessions} from './schema.js'
import {replies, runMessages, runs, type RunStatus} from './run-schema.js'

export type {RunStatus} from './run-schema.js'

export function claimRun(db: ConcivDb, id: string, kind: 'chat' | 'compact'): boolean {
  db.insert(runs).values({sessionId: id, updatedAt: Date.now()}).onConflictDoNothing().run()
  const claimed = db
    .update(runs)
    .set({
      status: kind === 'chat' ? 'running' : 'compacting',
      lastError: null,
      runEpoch: sql`${runs.runEpoch} + 1`,
      updatedAt: Date.now(),
    })
    .where(and(eq(runs.sessionId, id), eq(runs.status, 'idle')))
    .returning({sessionId: runs.sessionId})
    .all()
  if (claimed.length !== 1) return false
  db.delete(runMessages).where(eq(runMessages.sessionId, id)).run()
  db.delete(replies).where(eq(replies.sessionId, id)).run()
  return true
}

export function releaseRun(db: ConcivDb, id: string, error?: string | null): void {
  db.update(runs)
    .set({status: 'idle', lastError: error ?? null, updatedAt: Date.now()})
    .where(eq(runs.sessionId, id))
    .run()
}

export function requestStop(db: ConcivDb, id: string): boolean {
  const flipped = db
    .update(runs)
    .set({status: 'stopping', updatedAt: Date.now()})
    .where(and(eq(runs.sessionId, id), inArray(runs.status, ['running', 'compacting'])))
    .returning({sessionId: runs.sessionId})
    .all()
  return flipped.length === 1
}

export function statusOf(db: ConcivDb, id: string): RunStatus {
  const rows = db.select({status: runs.status}).from(runs).where(eq(runs.sessionId, id)).all()
  return rows[0]?.status ?? 'idle'
}

export function lastErrorOf(db: ConcivDb, id: string): string | null {
  const rows = db.select({lastError: runs.lastError}).from(runs).where(eq(runs.sessionId, id)).all()
  return rows[0]?.lastError ?? null
}

export function runEpochOf(db: ConcivDb, id: string): number {
  const rows = db.select({runEpoch: runs.runEpoch}).from(runs).where(eq(runs.sessionId, id)).all()
  return rows[0]?.runEpoch ?? 0
}

export function modelOf(db: ConcivDb, id: string): string | null {
  const rows = db.select({model: sessions.model}).from(sessions).where(eq(sessions.id, id)).all()
  return rows[0]?.model ?? null
}

export function setRunMessages(db: ConcivDb, id: string, messages: unknown[]): void {
  const row = {sessionId: id, messages, updatedAt: Date.now()}
  db.insert(runMessages)
    .values(row)
    .onConflictDoUpdate({target: runMessages.sessionId, set: {messages: row.messages, updatedAt: row.updatedAt}})
    .run()
}

export function runMessagesFor(db: ConcivDb, id: string): {messages: unknown[]; updatedAt: number} | null {
  const rows = db
    .select({messages: runMessages.messages, updatedAt: runMessages.updatedAt})
    .from(runMessages)
    .where(eq(runMessages.sessionId, id))
    .all()
  return rows[0] ?? null
}

export function writeReply(db: ConcivDb, id: string, key: string, value: unknown): void {
  const row = {sessionId: id, key, value, createdAt: Date.now()}
  db.insert(replies)
    .values(row)
    .onConflictDoUpdate({target: [replies.sessionId, replies.key], set: {value: row.value, createdAt: row.createdAt}})
    .run()
}

export function replyFor(db: ConcivDb, id: string, key: string): unknown | null {
  const rows = db
    .select({value: replies.value})
    .from(replies)
    .where(and(eq(replies.sessionId, id), eq(replies.key, key)))
    .all()
  return rows[0]?.value ?? null
}

export function runSessions(db: ConcivDb): string[] {
  return db
    .selectDistinct({sessionId: runMessages.sessionId})
    .from(runMessages)
    .all()
    .map((row) => row.sessionId)
}

export function clearRunState(db: ConcivDb, id: string): void {
  db.delete(runs).where(eq(runs.sessionId, id)).run()
  db.delete(runMessages).where(eq(runMessages.sessionId, id)).run()
  db.delete(replies).where(eq(replies.sessionId, id)).run()
}
