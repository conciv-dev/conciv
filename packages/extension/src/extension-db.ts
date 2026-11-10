import {
  catalogSources,
  extensionTable,
  sourceCatalog,
  withHomeDb,
  writeCatalog,
  type CommandValues,
  type ConcivDb,
  type SourceRead,
  type SourceWrite,
} from '@conciv/db'
import type {AnyExtension} from './define-extension.js'

export function extensionDb(input: {orm: ConcivDb; extensions: readonly AnyExtension[]; home: string}) {
  const {orm, extensions, home} = input
  const declared = extensions.map((extension) => {
    const tables = extension.tables?.(extensionTable(extension.name)) ?? {}
    const catalog = sourceCatalog({extension: extension.name, sources: extension.sources?.(tables) ?? {}, home})
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
      options: entry.options ?? {},
      scope: entry.scope ?? 'project',
      run: (call: {args: string[]; options: CommandValues}) => entry.run({...call, db, home}),
    })),
  )
  const names = extensions.map((extension) => extension.name)
  const catalog = declared.flatMap((entry) => entry.catalog)
  const rows = commands.map(({name, extension, command, description, positionals, options, scope}) => ({
    name,
    extension,
    command,
    description,
    positionals,
    options,
    scope,
  }))
  writeCatalog({orm, extensions: names, sources: catalog, commands: rows})
  withHomeDb(home, (homeOrm) =>
    writeCatalog({
      orm: homeOrm,
      extensions: names,
      sources: catalog.filter((source) => source.database !== null),
      commands: rows.filter((row) => row.scope === 'home'),
    }),
  )
  return {
    scoped: new Map(bound.map(({extension, db}) => [extension.name, db])),
    sources: {list: () => sources.list(), read: sources.read, write: sources.write},
    commands,
  }
}
