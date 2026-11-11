import {join} from 'node:path'
import {getTableName, getViewName, isView} from 'drizzle-orm'
import {z} from 'zod'
import type {
  CatalogDatabase,
  CatalogField,
  CatalogSource,
  Source,
  SourceCorrection,
  SourceField,
} from './source-types.js'

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
    fields: Object.entries(entry.fields).map(([name, field]) =>
      corrected({field: catalogField({name, field}), correction: entry.correctable}),
    ),
    order,
    writable: entry.writable === true || entry.correctable !== undefined,
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

function corrected(input: {field: CatalogField; correction: SourceCorrection | undefined}): CatalogField {
  const {field, correction} = input
  if (correction === undefined) return field
  if (field.name === correction.key) return {...field, key: true}
  const schema = correction.fields[field.name]
  if (schema === undefined) return field
  return {...field, schema: z.toJSONSchema(schema)}
}
