import {z} from 'zod'
import {argument, command, description, dynamic, extend, name, schema} from '@bomb.sh/router'
import {sourceCommands} from './db.js'
import {envelopeFlag} from './envelope.js'
import {localOutcome} from './local-outcome.js'
import {handler} from './router/handler.js'

const ExtensionCatalogSchema = z.object({
  owners: z.array(z.string()),
  commands: z.array(z.object({name: z.string(), description: z.string(), positionals: z.array(z.string())})),
})

export type ExtensionCatalog = z.infer<typeof ExtensionCatalogSchema>

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
          localOutcome({
            code: 'COMMAND_FAILED',
            work: (db) =>
              db.commands
                .find((found) => found.name === entry.name)
                ?.run(
                  entry.positionals.flatMap((positional) => {
                    const value: unknown = model[positional]
                    return typeof value === 'string' ? [value] : []
                  }),
                ),
          }),
        ),
      ),
    ),
  ),
)

export async function extensionCatalog(): Promise<ExtensionCatalog> {
  const {localProject} = await import('./local-project.js')
  const {extensions} = await localProject()
  return {
    owners: extensions.filter((extension) => extension.sources !== undefined).map((extension) => extension.name),
    commands: extensions.flatMap((extension) =>
      Object.entries(extension.commands ?? {}).map(([verb, entry]) => ({
        name: `${extension.name}:${verb}`,
        description: entry.description,
        positionals: [...entry.positionals],
      })),
    ),
  }
}
