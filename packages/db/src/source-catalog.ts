import {join} from 'node:path'
import {getTableName, getViewName, isView} from 'drizzle-orm'
import type {CatalogDatabase, CatalogField, CatalogSource, Source, SourceField} from './source-types.js'

export function sourceCatalog(input: {
  extension: string
  sources: Record<string, Source>
  home: string
}): CatalogSource[] {
  return Object.entries(input.sources).map(([source, entry], order) => ({
    name: `${input.extension}_${source}`,
    extension: input.extension,
    source,
    table: isView(entry.table) ? getViewName(entry.table) : getTableName(entry.table),
    database: databaseOf({name: entry.database, home: input.home}),
    fields: Object.entries(entry.fields).map(([name, field]) => catalogField({name, field})),
    order,
    writable: entry.writable === true,
    sort: entry.order ?? [],
  }))
}

function databaseOf(input: {name: string | undefined; home: string}): CatalogDatabase | null {
  if (input.name === undefined) return null
  return {name: input.name, file: join(input.home, `${input.name}.db`)}
}

function catalogField(input: {name: string; field: SourceField}): CatalogField {
  const {name, field} = input
  if ('path' in field) return {name, column: field.column.name, path: field.path, type: 'unknown'}
  return {name, column: field.name, path: null, type: field.dataType}
}
