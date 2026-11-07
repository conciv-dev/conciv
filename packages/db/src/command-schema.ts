import {sqliteTable, text} from 'drizzle-orm/sqlite-core'

export const commands = sqliteTable('commands', {
  name: text().primaryKey(),
  extension: text().notNull(),
  command: text().notNull(),
  description: text().notNull(),
  positionals: text({mode: 'json'}).$type<string[]>().notNull(),
})
