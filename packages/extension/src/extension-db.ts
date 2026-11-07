import {
  catalogSources,
  extensionTable,
  sourceCatalog,
  writeCatalog,
  type ConcivDb,
  type SourceRead,
  type SourceWrite,
} from '@conciv/db'
import type {AnyExtension} from './define-extension.js'

export function extensionDb(input: {orm: ConcivDb; extensions: readonly AnyExtension[]}) {
  const {orm, extensions} = input
  const declared = extensions.map((extension) => {
    const tables = extension.tables?.(extensionTable(extension.name)) ?? {}
    const catalog = sourceCatalog({extension: extension.name, sources: extension.sources?.(tables) ?? {}})
    return {extension, tables, catalog}
  })
  const sources = catalogSources({orm, sources: declared.flatMap(({catalog}) => catalog)})
  const bound = declared.map(({extension, tables}) => ({
    extension,
    db: {
      orm,
      tables,
      sources: () => sources.list(extension.name),
      read: (query: SourceRead) => sources.read({...query, extension: extension.name}),
      write: (query: SourceWrite) => sources.write({...query, extension: extension.name}),
    },
  }))
  const commands = bound.flatMap(({extension, db}) =>
    Object.entries(extension.cliCommands ?? {}).map(([command, entry]) => ({
      name: `${extension.name}:${command}`,
      extension: extension.name,
      command,
      description: entry.description,
      positionals: [...entry.positionals],
      run: (args: string[]) => entry.run({args, db}),
    })),
  )
  writeCatalog({
    orm,
    extensions: extensions.map((extension) => extension.name),
    sources: declared.flatMap(({catalog}) => catalog),
    commands: commands.map(({name, extension, command, description, positionals}) => ({
      name,
      extension,
      command,
      description,
      positionals,
    })),
  })
  return {
    scoped: new Map(bound.map(({extension, db}) => [extension.name, db])),
    sources: {list: () => sources.list(), read: sources.read, write: sources.write},
    commands,
  }
}
