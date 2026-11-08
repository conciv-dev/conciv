import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const engines = sqliteTable('engines', {
  id: text('id').primaryKey(),
  pid: integer('pid').notNull(),
  root: text('root').notNull(),
  apiBase: text('api_base').notNull(),
  deletedAt: integer('deleted_at'),
})

export const hubRevocations = sqliteTable('hub_revocations', {
  revokedAt: integer('revoked_at').primaryKey(),
})

export const hubConnections = sqliteTable('hub_connections', {
  harness: text('harness').primaryKey(),
  connectedAt: integer('connected_at').notNull(),
})
