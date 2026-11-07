import type {AnySQLiteColumn, AnySQLiteTable} from 'drizzle-orm/sqlite-core'

export type SourceField = AnySQLiteColumn | {column: AnySQLiteColumn; path: string}

export type Source = {table: AnySQLiteTable; fields: Record<string, SourceField>; writable?: true}

export type SourceOrder = {field: string; dir: 'asc' | 'desc'}

export type SourceRead = {
  from: string
  where?: string
  select?: readonly string[]
  order?: readonly SourceOrder[]
  limit?: number
}

export type SourceWrite = {into: string; values: Record<string, unknown>}

export type SourceListing = {name: string; fields: string[]; writable: boolean}

export type CatalogField = {name: string; column: string; path: string | null; type: string}

export type CatalogSource = {
  name: string
  extension: string
  source: string
  table: string
  fields: CatalogField[]
  order: number
  writable: boolean
}

export type CatalogCommand = {
  name: string
  extension: string
  command: string
  description: string
  positionals: string[]
}
