import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  harnessSessionId: text('harness_session_id'),
  harnessKind: text('harness_kind').notNull(),
  origin: text('origin', {enum: ['chat', 'agent', 'external']}).notNull(),
  title: text('title'),
  model: text('model'),
  usage: text('usage', {mode: 'json'}).$type<UsageSnapshot>(),
  cwd: text('cwd').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const drafts = sqliteTable('drafts', {
  sessionId: text('session_id').primaryKey(),
  text: text('text').notNull(),
  selectionStart: integer('selection_start').notNull(),
  selectionEnd: integer('selection_end').notNull(),
  grabs: text('grabs', {mode: 'json'}).$type<string[]>().notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const markers = sqliteTable('markers', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  afterTurn: integer('after_turn').notNull(),
  kind: text('kind', {enum: ['new', 'compact']}).notNull(),
})
