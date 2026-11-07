import {getTableName} from 'drizzle-orm'
import type {CatalogField, CatalogSource, Source, SourceField} from './source-types.js'

export function sourceCatalog(input: {extension: string; sources: Record<string, Source>}): CatalogSource[] {
  return Object.entries(input.sources).map(([source, entry], order) => ({
    name: `${input.extension}_${source}`,
    extension: input.extension,
    source,
    table: getTableName(entry.table),
    fields: Object.entries(entry.fields).map(([name, field]) => catalogField({name, field})),
    order,
    writable: entry.writable === true,
  }))
}

function catalogField(input: {name: string; field: SourceField}): CatalogField {
  const {name, field} = input
  if ('path' in field) return {name, column: field.column.name, path: field.path, type: 'unknown'}
  return {name, column: field.name, path: null, type: field.dataType}
}
