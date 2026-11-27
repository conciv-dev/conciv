import {index, integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'
import type {DraftItem, SessionId} from '@conciv/types/chat-types'
import {sessions} from '@conciv/backend-app-api/core/session/sql'

type PersistedAttachment = {id: string; type: string; name: string; contentType: string; data: string}

export const drafts = sqliteTable('drafts', {
  sessionId: text('session_id').primaryKey(),
  text: text('text').notNull(),
  selectionStart: integer('selection_start').notNull(),
  selectionEnd: integer('selection_end').notNull(),
  attachments: text('attachments', {mode: 'json'}).$type<PersistedAttachment[]>(),
  items: text('items', {mode: 'json'}).$type<DraftItem[]>(),
  updatedAt: integer('updated_at').notNull(),
})

export const markers = sqliteTable('markers', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  afterMessageId: text('after_message_id'),
  kind: text('kind', {enum: ['new', 'compact']}).notNull(),
})

type SessionInboxPayload = Readonly<Record<string, unknown>>

export const SessionInboxTable = sqliteTable(
  'session_inbox',
  {
    id: text().primaryKey(),
    session_id: text()
      .$type<SessionId>()
      .notNull()
      .references(() => sessions.id, {onDelete: 'cascade'}),
    type: text().$type<'user' | 'synthetic' | 'compaction' | 'move'>().notNull(),
    payload: text({mode: 'json'}).$type<SessionInboxPayload>().notNull(),
    delivery: text().$type<'steer' | 'queue'>().notNull(),
    enqueued_seq: integer().notNull(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index('session_inbox_session_delivery_seq_idx').on(table.session_id, table.delivery, table.enqueued_seq),
    uniqueIndex('session_inbox_session_enqueued_seq_idx').on(table.session_id, table.enqueued_seq),
  ],
)

export const logEvents = sqliteTable(
  'log_events',
  {
    id: text('id').primaryKey(),
    timestamp: text('timestamp').notNull(),
    level: text('level').notNull(),
    service: text('service').notNull(),
    environment: text('environment').notNull(),
    message: text('message'),
    method: text('method'),
    path: text('path'),
    status: integer('status'),
    durationMs: integer('duration_ms'),
    requestId: text('request_id'),
    source: text('source'),
    sessionId: text('session_id'),
    error: text('error'),
    data: text('data'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('log_events_timestamp_idx').on(table.timestamp),
    index('log_events_level_idx').on(table.level),
    index('log_events_service_idx').on(table.service),
    index('log_events_status_idx').on(table.status),
    index('log_events_request_id_idx').on(table.requestId),
    index('log_events_session_id_idx').on(table.sessionId),
    index('log_events_created_at_idx').on(table.createdAt),
  ],
)
