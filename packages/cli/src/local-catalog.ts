import {catalogSources, existingDb, readCatalog, type CatalogCommand} from '@conciv/db'
import {userFailure} from './failure.js'
import {stateRoot} from './state-root.js'

export type LocalCatalog = {sources: ReturnType<typeof catalogSources>; commands: CatalogCommand[]}

export function localCatalog(): LocalCatalog {
  const cwd = process.cwd()
  const root = stateRoot({cwd, env: process.env})
  if (root === undefined)
    throw userFailure(`No conciv database: looked for .conciv/conciv.db in ${cwd} and every directory above it.`, {
      hint: 'Run your app with conciv once, or set CONCIV_STATE_ROOT to the directory that holds .conciv.',
    })
  const orm = opened(root)
  const catalog = readCatalog(orm)
  return {sources: catalogSources({orm, sources: catalog.sources}), commands: catalog.commands}
}

function opened(root: string) {
  try {
    return existingDb({stateRoot: root})
  } catch (error) {
    throw userFailure(error instanceof Error ? error.message : String(error), {code: 'NO_CATALOG'})
  }
}
