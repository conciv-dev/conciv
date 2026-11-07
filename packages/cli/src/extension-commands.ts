import {safe} from '@orpc/client'
import {defineCommand, type ArgsDef, type SubCommandsDef} from 'citty'
import {makeRpcClient} from '@conciv/contract'
import {engineOrigin} from './engine-origin.js'
import {runRpc} from './request.js'
import {sourceCommands} from './db.js'

export async function extensionCommands(): Promise<SubCommandsDef> {
  const client = makeRpcClient(engineOrigin(process.cwd(), process.env))
  const [listed, sources] = await Promise.all([safe(client.extensions.commands()), safe(client.db.sources())])
  if (!listed.isSuccess) return {}
  const owners = sources.isSuccess ? new Set(sources.data.map((source) => source.extension)) : new Set<string>()
  const scoped = [...owners].flatMap((owner) =>
    Object.entries(sourceCommands({extension: owner, label: `the ${owner}`})).map(
      ([verb, command]) => [`${owner}:${verb}`, command] as const,
    ),
  )
  return Object.fromEntries([
    ...scoped,
    ...listed.data.map(
      (command) =>
        [
          command.name,
          defineCommand({
            meta: {name: command.name, description: command.description},
            args: positionalArgs(command.positionals),
            run: ({args}) =>
              runRpc((rpc) =>
                rpc.extensions.run({
                  name: command.name,
                  args: command.positionals.flatMap((name) => {
                    const value: unknown = args[name]
                    return typeof value === 'string' ? [value] : []
                  }),
                }),
              ),
          }),
        ] as const,
    ),
  ])
}

function positionalArgs(names: readonly string[]): ArgsDef {
  return Object.fromEntries(
    names.map((name) => [name, {type: 'positional', required: false, description: name}] as const),
  )
}
