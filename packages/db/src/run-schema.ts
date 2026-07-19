import {integer, primaryKey, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const RUN_STATUSES = ['idle', 'running', 'compacting', 'stopping'] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const runs = sqliteTable('runs', {
  sessionId: text('session_id').primaryKey(),
  status: text('status', {enum: RUN_STATUSES}).notNull().default('idle'),
  runEpoch: integer('run_epoch').notNull().default(0),
  lastError: text('last_error'),
  lastErrorEpoch: integer('last_error_epoch'),
  updatedAt: integer('updated_at').notNull(),
})

export const runMessages = sqliteTable('run_messages', {
  sessionId: text('session_id').primaryKey(),
  messages: text('messages', {mode: 'json'}).$type<unknown[]>().notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const imageHistory = sqliteTable('image_history', {
  sessionId: text('session_id').primaryKey(),
  messages: text('messages', {mode: 'json'}).$type<unknown[]>().notNull(),
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
