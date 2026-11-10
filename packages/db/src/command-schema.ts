import {sqliteTable, text} from 'drizzle-orm/sqlite-core'
import type {CommandOption} from './source-types.js'

export const commands = sqliteTable('commands', {
  name: text().primaryKey(),
  extension: text().notNull(),
  command: text().notNull(),
  description: text().notNull(),
  positionals: text({mode: 'json'}).$type<string[]>().notNull(),
  options: text({mode: 'json'}).$type<Record<string, CommandOption>>().notNull().default({}),
  scope: text({enum: ['project', 'home']})
    .notNull()
    .default('project'),
})
