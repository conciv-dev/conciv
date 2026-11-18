import {index, integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'
import type {Brand, Schema} from 'effect'
import type {
  NavigationEntry,
  PermissionRule,
  ReasoningEffort,
  SessionId,
  SessionMetadata,
} from '@conciv/protocol/chat-types'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'

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
    permissions: text('permissions', {mode: 'json'}).$type<PermissionRule[]>(),
    metadata: text('metadata', {mode: 'json'}).$type<SessionMetadata>(),
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

export const markers = sqliteTable('markers', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  afterMessageId: text('after_message_id'),
  kind: text('kind', {enum: ['new', 'compact']}).notNull(),
})

export const InstructionBlobTable = sqliteTable('instruction_blob', {
  hash: text().$type<string & Brand.Brand<'Instruction.Hash'>>().primaryKey(),
  value: text({mode: 'json'}).$type<Schema.Json>(),
})

export const InstructionStateTable = sqliteTable('instruction_state', {
  session_id: text()
    .$type<SessionId>()
    .primaryKey()
    .references(() => sessions.id, {onDelete: 'cascade'}),
  // oxlint-disable-next-line conciv/banned-vocabulary
  epoch_start: integer().notNull(),
  through_seq: integer().notNull(),
  initial_values: text({mode: 'json'})
    .notNull()
    .$type<Readonly<Record<string, string & Brand.Brand<'Instruction.Hash'>>>>(),
  current_values: text({mode: 'json'})
    .notNull()
    .$type<Readonly<Record<string, string & Brand.Brand<'Instruction.Hash'>>>>(),
})

const Timestamps = {
  time_created: integer()
    .notNull()
    .$default(() => Date.now()),
  time_updated: integer()
    .notNull()
    .$onUpdate(() => Date.now()),
}

export const EventSequenceTable = sqliteTable('event_sequence', {
  aggregate_id: text().notNull().primaryKey(),
  seq: integer().notNull(),
  owner_id: text(),
})

export const EventTable = sqliteTable(
  'event',
  {
    id: text().$type<string & Brand.Brand<'Event.ID'>>().primaryKey(),
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
  ...Timestamps,
})

export const PermissionTable = sqliteTable(
  'permission',
  {
    id: text().$type<string & Brand.Brand<'PermissionSaved.ID'>>().primaryKey(),
    project_id: text().$type<string & Brand.Brand<'Project.ID'>>().notNull(),
    action: text().notNull(),
    resource: text().notNull(),
    ...Timestamps,
  },
  (table) => [uniqueIndex('permission_project_action_resource_idx').on(table.project_id, table.action, table.resource)],
)
