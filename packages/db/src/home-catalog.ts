import {catalogSources} from './catalog-sources.js'
import {openHomeDb} from './home-db.js'
import {readCatalog} from './read-catalog.js'

export function homeCatalog(home: string) {
  const orm = openHomeDb(home)
  const catalog = readCatalog(orm)
  return {sources: catalogSources({orm, sources: catalog.sources}), commands: catalog.commands}
}
