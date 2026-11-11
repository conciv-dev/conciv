import {getTableColumns, getViewSelectedFields} from 'drizzle-orm'
import type {SQLiteColumn} from 'drizzle-orm/sqlite-core'
import type {Source} from '@conciv/extension'
import {storeTables} from './store-tables.js'
import {runsViews} from './views/index-of-views.js'

export function storeSources(): Record<string, Source> {
  const tables = Object.entries(storeTables).map(([name, table]): [string, Source] => [
    `stored_${name}`,
    {table, database: RUNS, fields: fieldsOf(getTableColumns(table))},
  ])
  const views = Object.entries(runsViews).map(([name, view]): [string, Source] => [
    name,
    {table: view, database: RUNS, fields: fieldsOf(getViewSelectedFields(view))},
  ])
  return Object.fromEntries([...tables, ...views])
}

const RUNS = 'runs'

const RENAMED: Record<string, string> = {run_id: 'run', target_id: 'target', artifact_id: 'id'}

function fieldsOf(columns: Record<string, SQLiteColumn>): Record<string, SQLiteColumn> {
  return Object.fromEntries(Object.values(columns).map((column) => [RENAMED[column.name] ?? column.name, column]))
}
