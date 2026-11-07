import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core'
import type {CatalogField, SourceOrder} from './source-types.js'

export const sources = sqliteTable('sources', {
  name: text().primaryKey(),
  extension: text().notNull(),
  source: text().notNull(),
  table: text().notNull(),
  fields: text({mode: 'json'}).$type<CatalogField[]>().notNull(),
  order: integer().notNull(),
  writable: integer({mode: 'boolean'}).notNull(),
  sort: text({mode: 'json'}).$type<SourceOrder[]>().notNull().default([]),
})
