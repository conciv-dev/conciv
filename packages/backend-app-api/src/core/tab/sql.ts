import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'
import type {SessionId} from '@conciv/types/chat-types'
import {sessions} from '../session/sql.js'

export const TabTable = sqliteTable(
  'tabs',
  {
    id: text().primaryKey(),
    session_id: text()
      .$type<SessionId>()
      .notNull()
      .references(() => sessions.id, {onDelete: 'cascade'}),
    connection_id: text().notNull(),
    url: text().notNull(),
    title: text().notNull(),
    focused_at: integer(),
    visible: integer({mode: 'boolean'}).notNull(),
    open: integer({mode: 'boolean'}).notNull(),
    updated_at: integer().notNull(),
  },
  (table) => [index('tabs_session_open_idx').on(table.session_id, table.open)],
)
