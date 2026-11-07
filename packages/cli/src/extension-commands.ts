import {defineCommand, type ArgsDef, type SubCommandsDef} from 'citty'
import {sourceCommands} from './db.js'
import {localOutcome} from './local-outcome.js'

export async function extensionCommands(): Promise<SubCommandsDef> {
  const [asked] = process.argv.slice(2).filter((token) => !token.startsWith('-'))
  if (asked !== undefined && !asked.includes(':')) return {}
  const {localProject} = await import('./local-project.js')
  const {extensions} = await localProject()
  const scoped = extensions
    .filter((extension) => extension.sources !== undefined)
    .flatMap(({name: owner}) =>
      Object.entries(sourceCommands({extension: owner, label: `the ${owner}`})).map(
        ([verb, command]) => [`${owner}:${verb}`, command] as const,
      ),
    )
  const commands = extensions.flatMap((extension) =>
    Object.entries(extension.commands ?? {}).map(([verb, command]) => {
      const name = `${extension.name}:${verb}`
      return [
        name,
        defineCommand({
          meta: {name, description: command.description},
          args: positionalArgs(command.positionals),
          run: ({args}) =>
            localOutcome({
              code: 'COMMAND_FAILED',
              work: (db) =>
                db.commands
                  .find((entry) => entry.name === name)
                  ?.run(
                    command.positionals.flatMap((positional) => {
                      const value: unknown = args[positional]
                      return typeof value === 'string' ? [value] : []
                    }),
                  ),
            }),
        }),
      ] as const
    }),
  )
  return Object.fromEntries([...scoped, ...commands])
}

function positionalArgs(names: readonly string[]): ArgsDef {
  return Object.fromEntries(
    names.map((name) => [name, {type: 'positional', required: false, description: name}] as const),
  )
}
