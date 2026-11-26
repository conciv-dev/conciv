import {integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'
import type {Brand, Schema} from 'effect'
import type {PermissionRule, ReasoningEffort, SessionId, SessionMetadata} from '@conciv/types/chat-types'
import type {UsageSnapshot} from '@conciv/types/usage-types'

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

export const InstructionBlobTable = sqliteTable('instruction_blob', {
  hash: text().$type<string & Brand.Brand<'Instruction.Hash'>>().primaryKey(),
  value: text({mode: 'json'}).$type<Schema.Json>(),
})

export const InstructionStateTable = sqliteTable('instruction_state', {
  session_id: text()
    .$type<SessionId>()
    .primaryKey()
    .references(() => sessions.id, {onDelete: 'cascade'}),
  epoch_start: integer().notNull(),
  through_seq: integer().notNull(),
  initial_values: text({mode: 'json'})
    .notNull()
    .$type<Readonly<Record<string, string & Brand.Brand<'Instruction.Hash'>>>>(),
  current_values: text({mode: 'json'})
    .notNull()
    .$type<Readonly<Record<string, string & Brand.Brand<'Instruction.Hash'>>>>(),
})
