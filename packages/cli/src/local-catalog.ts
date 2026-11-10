import {
  catalogSources,
  concivHome,
  existingDb,
  homeCatalog,
  readCatalog,
  readHomeDb,
  type CatalogCommand,
} from '@conciv/db'
import {userFailure} from './failure.js'
import {stateRoot} from './state-root.js'

export type LocalCatalog = {sources: ReturnType<typeof catalogSources>; commands: CatalogCommand[]}

export function localCatalog(): LocalCatalog {
  const cwd = process.cwd()
  const root = stateRoot({cwd, env: process.env})
  const home = concivHome({env: process.env})
  const shared = readHomeDb(home, readCatalog)
  if (root === undefined && shared === null)
    throw userFailure(`No conciv database: looked for .conciv/conciv.db in ${cwd} and every directory above it.`, {
      hint: 'Run your app with conciv once, or set CONCIV_STATE_ROOT to the directory that holds .conciv.',
    })
  if (root === undefined) return homeCatalog(home)
  const orm = opened(root)
  const project = readCatalog(orm)
  const homeSources = (shared?.sources ?? []).filter((source) => !project.sources.some(named(source.name)))
  const homeCommands = (shared?.commands ?? []).filter((entry) => !project.commands.some(named(entry.name)))
  return {
    sources: catalogSources({orm, sources: [...project.sources, ...homeSources]}),
    commands: [...project.commands, ...homeCommands],
  }
}

function named(name: string): (entry: {name: string}) => boolean {
  return (entry) => entry.name === name
}

function opened(root: string) {
  try {
    return existingDb({stateRoot: root})
  } catch (error) {
    throw userFailure(error instanceof Error ? error.message : String(error), {code: 'NO_CATALOG'})
  }
}
