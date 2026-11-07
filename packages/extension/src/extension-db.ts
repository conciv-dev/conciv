import {createSources, extensionTable, type ConcivDb, type SourceRead, type SourceWrite} from '@conciv/db'
import type {AnyExtension} from './define-extension.js'

export function extensionDb(input: {orm: ConcivDb; extensions: readonly AnyExtension[]}) {
  const {orm, extensions} = input
  const declared = extensions.map((extension) => {
    const tables = extension.tables?.(extensionTable(extension.name)) ?? {}
    const sources = extension.sources?.(tables) ?? {}
    const own = createSources({orm, sources})
    return {extension, sources, scoped: {orm, tables, sources: own.list, read: own.read, write: own.write}}
  })
  const prefixed = declared.flatMap(({extension, sources}) =>
    Object.entries(sources).map(([source, entry]) => ({name: `${extension.name}_${source}`, extension, source, entry})),
  )
  const everySource = createSources({
    orm,
    sources: Object.fromEntries(prefixed.map(({name, entry}) => [name, entry])),
  })
  const scoped = new Map(declared.map(({extension, scoped}) => [extension.name, scoped]))
  function scopeOf(extension: string | undefined): Pick<ReturnType<typeof createSources>, 'read' | 'write'> {
    if (extension === undefined) return everySource
    const found = scoped.get(extension)
    if (found !== undefined) return found
    throw new Error(`no extension ${extension}; the extensions are ${[...scoped.keys()].join(', ')}`)
  }
  return {
    scoped,
    sources: {
      list: () =>
        prefixed.map(({name, extension, source, entry}) => ({
          name,
          extension: extension.name,
          source,
          fields: Object.keys(entry.fields),
          writable: entry.writable === true,
        })),
      read: ({extension, ...query}: SourceRead & {extension?: string}) => scopeOf(extension).read(query),
      write: ({extension, ...query}: SourceWrite & {extension?: string}) => scopeOf(extension).write(query),
    },
    commands: declared.flatMap(({extension, scoped: db}) =>
      Object.entries(extension.commands ?? {}).map(([name, command]) => ({
        name: `${extension.name}:${name}`,
        description: command.description,
        positionals: command.positionals,
        run: (args: string[]) => command.run({args, db}),
      })),
    ),
  }
}
