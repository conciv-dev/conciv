import {and, eq, like} from 'drizzle-orm'
import type {ModelMessage} from '@tanstack/ai'
import type {ConcivDb} from './db.js'
import {chatMetadata, chatThreads, runMessages, sessionHistory} from './run-schema.js'
import {anchorKey, pendingFromKey, TRANSCRIPT_NAMESPACE} from './chat-thread-import.js'

export type ThreadAnchor = {nativeId: string | null}

export type ThreadState = {
  messages: ModelMessage[]
  pendingFrom: number | null
  anchor: ThreadAnchor | null
}

type QueryHandle = Pick<ConcivDb, 'select' | 'insert' | 'delete'>

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

function anchorOf(value: unknown): ThreadAnchor | null {
  if (!isRecord(value) || !('nativeId' in value)) return null
  const nativeId = value.nativeId
  if (nativeId === null) return {nativeId: null}
  return typeof nativeId === 'string' ? {nativeId} : null
}

function pendingIndexOf(value: unknown): number | null {
  if (!isRecord(value)) return null
  const index = value.index
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 ? index : null
}

const PENDING_SUFFIX = ':pendingFrom'

function metadataValue(db: QueryHandle, key: string): unknown {
  const rows = db
    .select({valueJson: chatMetadata.valueJson})
    .from(chatMetadata)
    .where(and(eq(chatMetadata.namespace, TRANSCRIPT_NAMESPACE), eq(chatMetadata.key, key)))
    .all()
  return rows[0]?.valueJson ?? null
}

export function readThread(db: QueryHandle, threadId: string): ThreadState {
  const rows = db
    .select({messagesJson: chatThreads.messagesJson})
    .from(chatThreads)
    .where(eq(chatThreads.threadId, threadId))
    .all()
  return {
    messages: rows[0]?.messagesJson ?? [],
    pendingFrom: pendingIndexOf(metadataValue(db, pendingFromKey(threadId))),
    anchor: anchorOf(metadataValue(db, anchorKey(threadId))),
  }
}

export function threadMessages(db: QueryHandle, threadId: string): ModelMessage[] {
  return readThread(db, threadId).messages
}

function writeMetadata(tx: QueryHandle, key: string, value: unknown): void {
  if (value === null) {
    tx.delete(chatMetadata)
      .where(and(eq(chatMetadata.namespace, TRANSCRIPT_NAMESPACE), eq(chatMetadata.key, key)))
      .run()
    return
  }
  tx.insert(chatMetadata)
    .values({namespace: TRANSCRIPT_NAMESPACE, key, valueJson: value})
    .onConflictDoUpdate({target: [chatMetadata.namespace, chatMetadata.key], set: {valueJson: value}})
    .run()
}

export function updateThread(db: ConcivDb, threadId: string, fold: (state: ThreadState) => ThreadState): void {
  db.transaction((tx) => {
    const next = fold(readThread(tx, threadId))
    const updatedAt = Date.now()
    tx.insert(chatThreads)
      .values({threadId, messagesJson: next.messages, updatedAt})
      .onConflictDoUpdate({target: chatThreads.threadId, set: {messagesJson: next.messages, updatedAt}})
      .run()
    writeMetadata(tx, anchorKey(threadId), next.anchor)
    writeMetadata(tx, pendingFromKey(threadId), next.pendingFrom === null ? null : {index: next.pendingFrom})
  })
}

export function pendingThreadIds(db: QueryHandle): string[] {
  return db
    .select({key: chatMetadata.key})
    .from(chatMetadata)
    .where(and(eq(chatMetadata.namespace, TRANSCRIPT_NAMESPACE), like(chatMetadata.key, `%${PENDING_SUFFIX}`)))
    .all()
    .map((row) => row.key.slice(0, -PENDING_SUFFIX.length))
}

export function deleteThread(db: ConcivDb, threadId: string): void {
  db.transaction((tx) => {
    tx.delete(chatThreads).where(eq(chatThreads.threadId, threadId)).run()
    writeMetadata(tx, anchorKey(threadId), null)
    writeMetadata(tx, pendingFromKey(threadId), null)
    tx.delete(runMessages).where(eq(runMessages.sessionId, threadId)).run()
    tx.delete(sessionHistory).where(eq(sessionHistory.sessionId, threadId)).run()
  })
}
