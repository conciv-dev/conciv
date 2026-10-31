import {index, integer, primaryKey, sqliteTable, text} from 'drizzle-orm/sqlite-core'
import type {RunStatus} from '@conciv/protocol/chat-event-types'
import type {ModelMessage} from '@conciv/protocol/chat-message-types'
import type {TokenUsage} from '@conciv/protocol/usage-types'

export const chatRuns = sqliteTable(
  'chat_runs',
  {
    runId: text('run_id').primaryKey(),
    threadId: text('thread_id').notNull(),
    status: text('status').$type<RunStatus>().notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    error: text('error'),
    errorCode: text('error_code'),
    usageJson: text('usage_json', {mode: 'json'}).$type<TokenUsage>(),
    sandboxKey: text('sandbox_key'),
    detachedSince: integer('detached_since'),
    cancelRequested: integer('cancel_requested', {mode: 'boolean'}),
    driverEpoch: integer('driver_epoch'),
  },
  (table) => [
    index('chat_runs_status_detached').on(table.status, table.detachedSince),
    index('chat_runs_thread_started').on(table.threadId, table.startedAt),
  ],
)

export const chatThreads = sqliteTable('chat_threads', {
  threadId: text('thread_id').primaryKey(),
  messagesJson: text('messages_json', {mode: 'json'}).$type<ModelMessage[]>().notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const chatMetadata = sqliteTable(
  'chat_metadata',
  {
    namespace: text('namespace').notNull(),
    key: text('key').notNull(),
    valueJson: text('value_json', {mode: 'json'}).$type<unknown>().notNull(),
  },
  (table) => [primaryKey({columns: [table.namespace, table.key]})],
)
