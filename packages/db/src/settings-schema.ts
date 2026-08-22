import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const settingsLog = sqliteTable(
  'settings_log',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    key: text('key').notNull(),
    value: text('value'),
    actor: text('actor', {enum: ['user', 'agent']}).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('settings_log_key_id_idx').on(table.key, table.id)],
)
