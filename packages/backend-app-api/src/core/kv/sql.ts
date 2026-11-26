import {sqliteTable, text} from 'drizzle-orm/sqlite-core'
import type {Schema} from 'effect'
import {Timestamps} from '../database/timestamps.js'

export const KVTable = sqliteTable('kv', {
  key: text().primaryKey(),
  value: text({mode: 'json'}).$type<Schema.Json>().notNull(),
  ...Timestamps,
})
