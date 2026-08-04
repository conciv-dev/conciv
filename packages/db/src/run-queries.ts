import {and, eq} from 'drizzle-orm'
import type {ConcivDb} from './db.js'
import {sessions} from './schema.js'
import {imageHistory, replies, runMessages, runs} from './run-schema.js'

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

export function imageHistoryFor(db: ConcivDb, id: string): {messages: unknown[]; updatedAt: number} | null {
  const rows = db
    .select({messages: imageHistory.messages, updatedAt: imageHistory.updatedAt})
    .from(imageHistory)
    .where(eq(imageHistory.sessionId, id))
    .all()
  return rows[0] ?? null
}

export function clearImageHistory(db: ConcivDb, id: string): void {
  db.delete(imageHistory).where(eq(imageHistory.sessionId, id)).run()
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export function hasRichPart(message: unknown): boolean {
  if (!isRecord(message) || !Array.isArray(message.parts)) return false
  return message.parts.some((part) => isRecord(part) && (part.type === 'image' || part.type === 'document'))
}

export function foldRunMessagesIntoImageHistory(db: ConcivDb, id: string): void {
  const row = runMessagesFor(db, id)
  if (!row || row.messages.length === 0) return
  const existing = imageHistoryFor(db, id)?.messages ?? []
  if (existing.length === 0 && !row.messages.some(hasRichPart)) return
  const folded = {sessionId: id, messages: [...existing, ...row.messages], updatedAt: Date.now()}
  db.insert(imageHistory)
    .values(folded)
    .onConflictDoUpdate({target: imageHistory.sessionId, set: {messages: folded.messages, updatedAt: folded.updatedAt}})
    .run()
  db.delete(runMessages).where(eq(runMessages.sessionId, id)).run()
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
  db.delete(imageHistory).where(eq(imageHistory.sessionId, id)).run()
  db.delete(replies).where(eq(replies.sessionId, id)).run()
}
