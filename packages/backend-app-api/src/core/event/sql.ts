import {index, integer, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core'
import type {Brand} from 'effect'

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
