import {index, integer, primaryKey, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'
import type {NavigationEntry} from '@conciv/protocol/chat-types'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import type {ElementCapture, ElementCaptureKind} from '@conciv/protocol/element-capture-types'

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    harnessSessionId: text('harness_session_id'),
    harnessKind: text('harness_kind').notNull(),
    origin: text('origin', {enum: ['chat', 'agent', 'external']}).notNull(),
    title: text('title'),
    model: text('model'),
    usage: text('usage', {mode: 'json'}).$type<UsageSnapshot>(),
    cwd: text('cwd').notNull(),
    transcriptCwd: text('transcript_cwd'),
    attachedPid: integer('attached_pid'),
    attachedAt: integer('attached_at'),
    deletedAt: integer('deleted_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('sessions_native_key_unique').on(table.harnessKind, table.cwd, table.harnessSessionId)],
)

type PersistedAttachment = {id: string; type: string; name: string; contentType: string; data: string}

export const drafts = sqliteTable('drafts', {
  sessionId: text('session_id').primaryKey(),
  text: text('text').notNull(),
  selectionStart: integer('selection_start').notNull(),
  selectionEnd: integer('selection_end').notNull(),
  grabs: text('grabs', {mode: 'json'}).$type<string[]>().notNull(),
  attachments: text('attachments', {mode: 'json'}).$type<PersistedAttachment[]>(),
  updatedAt: integer('updated_at').notNull(),
})

export const navigation = sqliteTable('navigation', {
  id: text('id').primaryKey().default('navigation'),
  entries: text('entries', {mode: 'json'}).$type<NavigationEntry[]>().notNull(),
  index: integer('index').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const toolCaptures = sqliteTable(
  'tool_captures',
  {
    toolCallId: text('tool_call_id').notNull(),
    kind: text('kind').$type<ElementCaptureKind>().notNull(),
    sessionId: text('session_id').notNull(),
    cssBundleId: text('css_bundle_id'),
    payload: text('payload', {mode: 'json'}).$type<ElementCapture>().notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({name: 'tool_captures_pk', columns: [table.toolCallId, table.kind, table.sessionId]}),
    index('tool_captures_session_id_idx').on(table.sessionId),
  ],
)

export const cssBundles = sqliteTable('css_bundles', {
  hash: text('hash').primaryKey(),
  css: text('css').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const markers = sqliteTable('markers', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  afterTurn: integer('after_turn').notNull(),
  kind: text('kind', {enum: ['new', 'compact']}).notNull(),
})
