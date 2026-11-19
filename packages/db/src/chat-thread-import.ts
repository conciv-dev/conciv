import {and, eq, sql} from 'drizzle-orm'
import {Effect} from 'effect'
import {toModelMessages, type ModelMessage} from '@conciv/protocol/chat-message-types'
import {ChatHistorySchema} from '@conciv/protocol/chat-types'
import type {ConcivDb} from './db.js'
import {chatMessages, chatMetadata, runMessages, sessionHistory} from './run-schema.js'

export const TRANSCRIPT_NAMESPACE = 'conciv.transcript'
const CHAT_MIGRATION_NAMESPACE = 'conciv.migration'
const CHAT_IMPORT_KEY = 'chatThreads.importedAt'

export const anchorKey = (threadId: string): string => `${threadId}:anchorNativeId`
export const pendingFromKey = (threadId: string): string => `${threadId}:pendingFrom`

type MetadataRow = {namespace: string; key: string; valueJson: unknown}

const historyModelMessages = (messages: unknown[]): ModelMessage[] => toModelMessages(ChatHistorySchema.parse(messages))

function alreadyImported(db: ConcivDb) {
  return db
    .select({key: chatMetadata.key})
    .from(chatMetadata)
    .where(and(eq(chatMetadata.namespace, CHAT_MIGRATION_NAMESPACE), eq(chatMetadata.key, CHAT_IMPORT_KEY)))
    .pipe(Effect.map((rows) => rows.length > 0))
}

export const importLegacyThreads = Effect.fn('importLegacyThreads')(function* (db: ConcivDb, now: number) {
  if (yield* alreadyImported(db)) return
  const historyRows = yield* db.select().from(sessionHistory)
  const pendingRows = yield* db.select().from(runMessages)
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
      settled: historyModelMessages(history?.messages ?? []),
      live: historyModelMessages(pending?.messages ?? []),
    }
  })

  const threads = imported
    .map((thread) => ({threadId: thread.threadId, messages: [...thread.settled, ...thread.live]}))
    .filter((thread) => thread.messages.length > 0)

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

  yield* db.transaction((tx) =>
    Effect.gen(function* () {
      yield* Effect.forEach(threads, (thread) =>
        tx.run(
          sql`INSERT INTO ${chatMessages} (thread_id, position, message_id, role, message_json) SELECT ${thread.threadId}, CAST(key AS INTEGER), json_extract(value, '$.id'), json_extract(value, '$.role'), value FROM json_each(${JSON.stringify(thread.messages)}) WHERE true ON CONFLICT DO NOTHING`,
        ),
      )
      if (metadata.length > 0) yield* tx.insert(chatMetadata).values(metadata).onConflictDoNothing()
      yield* tx
        .insert(chatMetadata)
        .values({namespace: CHAT_MIGRATION_NAMESPACE, key: CHAT_IMPORT_KEY, valueJson: now})
        .onConflictDoNothing()
    }),
  )
})
