import {index, integer, primaryKey, sqliteTable, text} from 'drizzle-orm/sqlite-core'
import type {RunPhase} from '@conciv/protocol/run-types'

export const RUN_PHASES: readonly [RunPhase, ...RunPhase[]] = ['running', 'stopping', 'completed', 'failed', 'aborted']

export const runs = sqliteTable(
  'runs',
  {
    runId: text('run_id').primaryKey(),
    sessionId: text('session_id').notNull(),
    phase: text('phase', {enum: RUN_PHASES}).notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    error: text('error'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('runs_session_id_idx').on(table.sessionId)],
)

export const runMessages = sqliteTable('run_messages', {
  sessionId: text('session_id').primaryKey(),
  messages: text('messages', {mode: 'json'}).$type<unknown[]>().notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const sessionHistory = sqliteTable('image_history', {
  sessionId: text('session_id').primaryKey(),
  messages: text('messages', {mode: 'json'}).$type<unknown[]>().notNull(),
  anchorNativeId: text('anchor_native_id'),
  updatedAt: integer('updated_at').notNull(),
})

export const replies = sqliteTable(
  'replies',
  {
    sessionId: text('session_id').notNull(),
    key: text('key').notNull(),
    value: text('value', {mode: 'json'}).$type<unknown>(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [primaryKey({columns: [table.sessionId, table.key]})],
)
