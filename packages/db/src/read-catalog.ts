import {asc} from 'drizzle-orm'
import type {ConcivDb} from './db.js'
import {commands} from './command-schema.js'
import {sources} from './catalog-schema.js'
import type {CatalogCommand, CatalogSource} from './source-types.js'

export function readCatalog(orm: ConcivDb): {sources: CatalogSource[]; commands: CatalogCommand[]} {
  return {
    sources: orm.select().from(sources).orderBy(asc(sources.extension), asc(sources.order)).all(),
    commands: orm.select().from(commands).orderBy(asc(commands.name)).all(),
  }
}
