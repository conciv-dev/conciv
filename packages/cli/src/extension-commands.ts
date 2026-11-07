import {z} from 'zod'
import {argument, command, description, dynamic, extend, name, schema} from '@bomb.sh/router'
import {sourceCommands} from './db.js'
import {envelopeFlag} from './envelope.js'
import {failureOf, type EnvelopeError} from './failure.js'
import {localCatalog} from './local-catalog.js'
import {runRpc} from './request.js'
import {handler} from './router/handler.js'
import {stateRoot} from './state-root.js'

const ExtensionCatalogSchema = z.object({
  owners: z.array(z.string()),
  commands: z.array(z.object({name: z.string(), description: z.string(), positionals: z.array(z.string())})),
})

export type ExtensionCatalog = z.infer<typeof ExtensionCatalogSchema> & {unreadable: EnvelopeError | null}

export const extensionCommands = dynamic(ExtensionCatalogSchema, (catalog) =>
  extend(
    ...catalog.owners.flatMap((owner) =>
      sourceCommands({extension: owner, label: `the ${owner}`, prefix: `${owner}:`}),
    ),
    ...catalog.commands.map((entry) =>
      command(
        name(entry.name),
        description(entry.description),
        ...entry.positionals.map((positional) =>
          argument(name(positional), description(positional), schema(z.string().optional())),
        ),
        envelopeFlag,
        handler((model) =>
          runRpc((rpc) =>
            rpc.extensions.run({
              name: entry.name,
              args: entry.positionals.flatMap((positional) => {
                const value: unknown = model[positional]
                return typeof value === 'string' ? [value] : []
              }),
            }),
          ),
        ),
      ),
    ),
  ),
)

export function extensionCatalog(): ExtensionCatalog {
  const empty = {owners: [], commands: []}
  if (stateRoot({cwd: process.cwd(), env: process.env}) === undefined) return {...empty, unreadable: null}
  try {
    const {sources, commands} = localCatalog()
    return {
      owners: [...new Set(sources.list().map((source) => source.extension))],
      commands: commands.map((entry) => ({
        name: entry.name,
        description: entry.description,
        positionals: entry.positionals,
      })),
      unreadable: null,
    }
  } catch (error) {
    return {...empty, unreadable: failureOf(error)}
  }
}
