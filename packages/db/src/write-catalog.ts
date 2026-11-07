import {inArray} from 'drizzle-orm'
import type {ConcivDb} from './db.js'
import {commands} from './command-schema.js'
import {sources} from './catalog-schema.js'
import type {CatalogCommand, CatalogSource} from './source-types.js'

export function writeCatalog(input: {
  orm: ConcivDb
  extensions: readonly string[]
  sources: readonly CatalogSource[]
  commands: readonly CatalogCommand[]
}): void {
  const loaded = [...input.extensions]
  input.orm.transaction((tx) => {
    tx.delete(sources).where(inArray(sources.extension, loaded)).run()
    tx.delete(commands).where(inArray(commands.extension, loaded)).run()
    if (input.sources.length > 0)
      tx.insert(sources)
        .values([...input.sources])
        .run()
    if (input.commands.length > 0)
      tx.insert(commands)
        .values([...input.commands])
        .run()
  })
}
