import {and, eq} from 'drizzle-orm'
import {CODE_MODE_SYNTHETIC_PART_MARKER} from '@conciv/protocol/chat-types'
import type {ConcivDb} from './db.js'
import {sessions} from './schema.js'
import {replies, runMessages, runs, sessionHistory} from './run-schema.js'

type QueryHandle = Pick<ConcivDb, 'select' | 'insert' | 'delete'>

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

export function clearSessionHistory(db: ConcivDb, id: string): void {
  db.delete(sessionHistory).where(eq(sessionHistory.sessionId, id)).run()
}

export function deleteRunMessages(db: QueryHandle, id: string): void {
  db.delete(runMessages).where(eq(runMessages.sessionId, id)).run()
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function isCliUnreproduciblePart(part: unknown): boolean {
  if (!isRecord(part)) return false
  if (part.type === 'image' || part.type === 'document') return true
  if (part.type !== 'tool-call') return false
  return isRecord(part.metadata) && part.metadata[CODE_MODE_SYNTHETIC_PART_MARKER] === true
}

export function hasRichPart(message: unknown): boolean {
  if (!isRecord(message) || !Array.isArray(message.parts)) return false
  return message.parts.some(isCliUnreproduciblePart)
}

function appendRunIntoHistory(db: ConcivDb, id: string): void {
  db.transaction((tx) => {
    const row = runMessagesFor(tx, id)
    if (!row) return
    if (row.messages.length === 0) {
      deleteRunMessages(tx, id)
      return
    }
    const existing = sessionHistoryFor(tx, id)?.messages ?? []
    const folded = {sessionId: id, messages: [...existing, ...row.messages], updatedAt: Date.now()}
    tx.insert(sessionHistory)
      .values(folded)
      .onConflictDoUpdate({
        target: sessionHistory.sessionId,
        set: {messages: folded.messages, updatedAt: folded.updatedAt},
      })
      .run()
    deleteRunMessages(tx, id)
  })
}

export function foldRunMessagesIntoHistory(db: ConcivDb, id: string): void {
  appendRunIntoHistory(db, id)
}

export function foldRichRunMessagesIntoHistory(db: ConcivDb, id: string): void {
  const row = runMessagesFor(db, id)
  if (!row || row.messages.length === 0) return
  const existing = sessionHistoryFor(db, id)?.messages ?? []
  if (existing.length === 0 && !row.messages.some(hasRichPart)) return
  appendRunIntoHistory(db, id)
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
  deleteRunMessages(db, id)
  db.delete(sessionHistory).where(eq(sessionHistory.sessionId, id)).run()
  db.delete(replies).where(eq(replies.sessionId, id)).run()
}
