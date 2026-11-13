import {index, integer, primaryKey, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'
import type {Brand, Schema} from 'effect'
import type {NavigationEntry, ReasoningEffort} from '@conciv/protocol/chat-types'
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
    effort: text('effort').$type<ReasoningEffort>(),
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
  afterMessageId: text('after_message_id'),
  kind: text('kind', {enum: ['new', 'compact']}).notNull(),
})

export const pageChanges = sqliteTable(
  'page_changes',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    sessionId: text('session_id').notNull(),
    verb: text('verb').notNull(),
    ref: text('ref'),
    selector: text('selector'),
    args: text('args', {mode: 'json'}).$type<Record<string, unknown>>().notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('page_changes_session_id_idx').on(table.sessionId)],
)

export const EventSequenceTable = sqliteTable('event_sequence', {
  aggregate_id: text().notNull().primaryKey(),
  seq: integer().notNull(),
  owner_id: text(),
})

export const EventTable = sqliteTable(
  'event',
  {
    id: text().primaryKey(),
    aggregate_id: text()
      .notNull()
      .references(() => EventSequenceTable.aggregate_id, {onDelete: 'cascade'}),
    seq: integer().notNull(),
    created: integer().notNull().default(0),
    type: text().notNull(),
    data: text({mode: 'json'}).$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    uniqueIndex('event_aggregate_seq_idx').on(table.aggregate_id, table.seq),
    index('event_aggregate_type_seq_idx').on(table.aggregate_id, table.type, table.seq),
  ],
)

export const KVTable = sqliteTable('kv', {
  key: text().primaryKey(),
  value: text({mode: 'json'}).$type<Schema.Json>().notNull(),
  time_created: integer()
    .notNull()
    .$default(() => Date.now()),
  time_updated: integer()
    .notNull()
    .$onUpdate(() => Date.now()),
})

export const PermissionTable = sqliteTable(
  'permission',
  {
    id: text().$type<string & Brand.Brand<'PermissionSaved.ID'>>().primaryKey(),
    project_id: text().$type<string & Brand.Brand<'Project.ID'>>().notNull(),
    action: text().notNull(),
    resource: text().notNull(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
    time_updated: integer()
      .notNull()
      .$onUpdate(() => Date.now()),
  },
  (table) => [uniqueIndex('permission_project_action_resource_idx').on(table.project_id, table.action, table.resource)],
)
