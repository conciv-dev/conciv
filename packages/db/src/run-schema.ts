import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'
import type {RunStatus, TokenUsage} from '@tanstack/ai'
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
