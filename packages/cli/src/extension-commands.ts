import {safe} from '@orpc/client'
import {defineCommand, type ArgsDef, type SubCommandsDef} from 'citty'
import {makeRpcClient} from '@conciv/contract'
import {engineOrigin} from './engine-origin.js'
import {runRpc} from './request.js'

export async function extensionCommands(): Promise<SubCommandsDef> {
  const listed = await safe(makeRpcClient(engineOrigin(process.cwd(), process.env)).extensions.commands())
  if (!listed.isSuccess) return {}
  return Object.fromEntries(
    listed.data.map((command) => [
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
    ]),
  )
}

function positionalArgs(names: readonly string[]): ArgsDef {
  return Object.fromEntries(
    names.map((name) => [name, {type: 'positional', required: false, description: name}] as const),
  )
}
