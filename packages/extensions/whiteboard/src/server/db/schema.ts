import {integer, primaryKey, real, sqliteTable, text} from 'drizzle-orm/sqlite-core'
import type {JsonValue} from '../../shared/rows.js'

export const canvasElements = sqliteTable(
  'canvas_elements',
  {
    room: text('room').notNull(),
    elementId: text('element_id').notNull(),
    data: text('data', {mode: 'json'}).$type<JsonValue>().notNull(),
    version: integer('version').notNull(),
    ownerKind: text('owner_kind', {enum: ['human', 'ai']}).notNull().default('human'),
    ownerId: text('owner_id'),
    ownerName: text('owner_name'),
    ownerModel: text('owner_model'),
    lastEditedByKind: text('last_edited_by_kind', {enum: ['human', 'ai']}).notNull().default('human'),
    lastEditedById: text('last_edited_by_id'),
    lastEditedByName: text('last_edited_by_name'),
    lastEditedByModel: text('last_edited_by_model'),
  },
  (table) => [primaryKey({columns: [table.room, table.elementId]})],
)

export const canvasDraftElements = sqliteTable(
  'canvas_draft_elements',
  {
    room: text('room').notNull(),
    elementId: text('element_id').notNull(),
    data: text('data', {mode: 'json'}).$type<JsonValue>().notNull(),
    version: integer('version').notNull(),
    ownerKind: text('owner_kind', {enum: ['human', 'ai']}).notNull().default('human'),
    ownerId: text('owner_id'),
    ownerName: text('owner_name'),
    ownerModel: text('owner_model'),
    lastEditedByKind: text('last_edited_by_kind', {enum: ['human', 'ai']}).notNull().default('human'),
    lastEditedById: text('last_edited_by_id'),
    lastEditedByName: text('last_edited_by_name'),
    lastEditedByModel: text('last_edited_by_model'),
  },
  (table) => [primaryKey({columns: [table.room, table.elementId]})],
)

export const canvasPending = sqliteTable('canvas_pending', {
  id: text('id').primaryKey(),
  room: text('room').notNull(),
  kind: text('kind', {enum: ['skeletons', 'mermaid', 'svg', 'export', 'commit', 'discard']}).notNull(),
  stage: text('stage', {enum: ['draft', 'live']})
    .notNull()
    .default('live'),
  payload: text('payload', {mode: 'json'}).$type<JsonValue>().notNull(),
})

export const canvasReplies = sqliteTable('canvas_replies', {
  id: text('id').primaryKey(),
  room: text('room').notNull(),
  requestId: text('request_id').notNull(),
  kind: text('kind', {enum: ['export']}).notNull(),
  payload: text('payload', {mode: 'json'}).$type<JsonValue>().notNull(),
})

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  cid: text('cid').notNull(),
  threadId: text('thread_id').notNull(),
  parentId: text('parent_id'),
  parts: text('parts', {mode: 'json'}).$type<JsonValue>().notNull(),
  authorKind: text('author_kind', {enum: ['human', 'ai']}).notNull(),
  authorModel: text('author_model'),
  authorId: text('author_id'),
  authorName: text('author_name'),
  authorAvatar: text('author_avatar'),
  status: text('status', {enum: ['open', 'resolved', 'drifted', 'orphaned']})
    .notNull()
    .default('open'),
  kind: text('kind', {enum: ['source-linked', 'floating']}).notNull(),
  anchor: text('anchor', {mode: 'json'}).$type<JsonValue>(),
  anchorFile: text('anchor_file'),
  anchorComponent: text('anchor_component'),
  anchorHash: text('anchor_hash'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  resolvedAt: integer('resolved_at'),
})

export const pins = sqliteTable('pins', {
  id: text('id').primaryKey(),
  room: text('room').notNull(),
  cid: text('cid').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  elementId: text('element_id'),
  pinState: text('pin_state', {enum: ['locked', 'offset']})
    .notNull()
    .default('locked'),
  anchorX: real('anchor_x'),
  anchorY: real('anchor_y'),
})

export const reads = sqliteTable('reads', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  threadId: text('thread_id').notNull(),
  accountId: text('account_id').notNull(),
  lastReadAt: integer('last_read_at').notNull(),
})
