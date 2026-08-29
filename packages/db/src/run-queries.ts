import {eq} from 'drizzle-orm'
import {CODE_MODE_SYNTHETIC_PART_MARKER} from '@conciv/protocol/chat-types'
import type {ConcivDb} from './db.js'
import {sessions} from './schema.js'
import {runMessages, runs, sessionHistory} from './run-schema.js'
import {deleteThreadRuns} from './run-store.js'

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

export type HistoryAnchor = {nativeId: string | null}

export function historyAnchorFor(db: QueryHandle, id: string): HistoryAnchor | null {
  const rows = db
    .select({anchorNativeId: sessionHistory.anchorNativeId})
    .from(sessionHistory)
    .where(eq(sessionHistory.sessionId, id))
    .all()
  const row = rows[0]
  return row ? {nativeId: row.anchorNativeId ?? null} : null
}

function appendRunIntoHistory(db: ConcivDb, id: string, anchorNativeId: string | null): void {
  db.transaction((tx) => {
    const row = runMessagesFor(tx, id)
    if (!row) return
    if (row.messages.length === 0) {
      deleteRunMessages(tx, id)
      return
    }
    const anchored = historyAnchorFor(tx, id) !== null
    const existing = sessionHistoryFor(tx, id)?.messages ?? []
    const folded = {
      sessionId: id,
      messages: [...existing, ...row.messages],
      anchorNativeId,
      updatedAt: Date.now(),
    }
    tx.insert(sessionHistory)
      .values(folded)
      .onConflictDoUpdate({
        target: sessionHistory.sessionId,
        set: {
          messages: folded.messages,
          ...(anchored ? {} : {anchorNativeId}),
          updatedAt: folded.updatedAt,
        },
      })
      .run()
    deleteRunMessages(tx, id)
  })
}

export function foldRunMessagesIntoHistory(db: ConcivDb, id: string, anchorNativeId: string | null = null): void {
  appendRunIntoHistory(db, id, anchorNativeId)
}

export function foldRichRunMessagesIntoHistory(db: ConcivDb, id: string, anchorNativeId: string | null = null): void {
  const row = runMessagesFor(db, id)
  if (!row || row.messages.length === 0) return
  const existing = sessionHistoryFor(db, id)?.messages ?? []
  if (existing.length === 0 && !row.messages.some(hasRichPart)) return
  appendRunIntoHistory(db, id, anchorNativeId)
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
  deleteThreadRuns(db, id)
  deleteRunMessages(db, id)
  db.delete(sessionHistory).where(eq(sessionHistory.sessionId, id)).run()
}
