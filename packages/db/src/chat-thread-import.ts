import {and, eq} from 'drizzle-orm'
import {uiMessageToModelMessages} from '@tanstack/ai'
import type {ModelMessage} from '@tanstack/ai'
import {ChatHistorySchema} from '@conciv/protocol/chat-types'
import type {ConcivDb} from './db.js'
import {chatMetadata, chatThreads, runMessages, sessionHistory} from './run-schema.js'

export const TRANSCRIPT_NAMESPACE = 'conciv.transcript'
export const CHAT_MIGRATION_NAMESPACE = 'conciv.migration'
export const CHAT_IMPORT_KEY = 'chatThreads.importedAt'

export const anchorKey = (threadId: string): string => `${threadId}:anchorNativeId`
export const pendingFromKey = (threadId: string): string => `${threadId}:pendingFrom`

type MetadataRow = {namespace: string; key: string; valueJson: unknown}

const toModelMessages = (messages: unknown[]): ModelMessage[] =>
  ChatHistorySchema.parse(messages).flatMap(uiMessageToModelMessages)

function alreadyImported(db: ConcivDb): boolean {
  const rows = db
    .select({key: chatMetadata.key})
    .from(chatMetadata)
    .where(and(eq(chatMetadata.namespace, CHAT_MIGRATION_NAMESPACE), eq(chatMetadata.key, CHAT_IMPORT_KEY)))
    .all()
  return rows.length > 0
}

export function importLegacyThreads(db: ConcivDb, now: number): void {
  if (alreadyImported(db)) return
  const historyRows = db.select().from(sessionHistory).all()
  const pendingRows = db.select().from(runMessages).all()
  const historyBySession = Object.fromEntries(historyRows.map((row) => [row.sessionId, row]))
  const pendingBySession = Object.fromEntries(pendingRows.map((row) => [row.sessionId, row]))
  const sessionIds = [...new Set([...Object.keys(historyBySession), ...Object.keys(pendingBySession)])]

  const imported = sessionIds.map((threadId) => {
    const history = historyBySession[threadId]
    const pending = pendingBySession[threadId]
    return {
      threadId,
      history,
      pending,
      settled: toModelMessages(history?.messages ?? []),
      live: toModelMessages(pending?.messages ?? []),
    }
  })

  const threads = imported.flatMap((thread) => {
    const messagesJson = [...thread.settled, ...thread.live]
    if (messagesJson.length === 0) return []
    const updatedAt = Math.max(thread.history?.updatedAt ?? 0, thread.pending?.updatedAt ?? 0)
    return [{threadId: thread.threadId, messagesJson, updatedAt}]
  })

  const metadata = imported.flatMap((thread): MetadataRow[] => [
    ...(thread.history
      ? [
          {
            namespace: TRANSCRIPT_NAMESPACE,
            key: anchorKey(thread.threadId),
            valueJson: {nativeId: thread.history.anchorNativeId ?? null},
          },
        ]
      : []),
    ...(thread.pending
      ? [
          {
            namespace: TRANSCRIPT_NAMESPACE,
            key: pendingFromKey(thread.threadId),
            valueJson: {index: thread.settled.length},
          },
        ]
      : []),
  ])

  db.transaction((tx) => {
    if (threads.length > 0) tx.insert(chatThreads).values(threads).onConflictDoNothing().run()
    if (metadata.length > 0) tx.insert(chatMetadata).values(metadata).onConflictDoNothing().run()
    tx.insert(chatMetadata)
      .values({namespace: CHAT_MIGRATION_NAMESPACE, key: CHAT_IMPORT_KEY, valueJson: now})
      .onConflictDoNothing()
      .run()
  })
}
