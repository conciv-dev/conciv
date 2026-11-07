import {sqliteTableCreator, type SQLiteTableFn} from 'drizzle-orm/sqlite-core'

export function extensionTable(name: string): SQLiteTableFn {
  return sqliteTableCreator((table) => `${name}_${table}`)
}
