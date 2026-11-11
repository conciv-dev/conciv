import {z} from 'zod'
import {argument, command, description, dynamic, extend, multiple, name, option, schema, toggle} from '@bomb.sh/router'
import {concivHome, readHomeDb, type CommandOption, type CommandValues} from '@conciv/db'
import {sourceCommands} from './db.js'
import {dashValue} from './dash-value.js'
import {envelopeFlag} from './envelope.js'
import {failureOf, type EnvelopeError} from './failure.js'
import {localCatalog} from './local-catalog.js'
import {runRpc} from './request.js'
import {handler} from './router/handler.js'
import {stateRoot} from './state-root.js'

const OptionValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])

const ExtensionCatalogSchema = z.object({
  owners: z.array(z.string()),
  commands: z.array(
    z.object({
      name: z.string(),
      extension: z.string(),
      description: z.string(),
      positionals: z.array(z.string()),
      options: z.record(
        z.string(),
        z.object({
          type: z.enum(['string', 'number', 'boolean']),
          description: z.string(),
          multiple: z.boolean().optional(),
        }),
      ),
      scope: z.enum(['project', 'home']),
    }),
  ),
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
        ...Object.entries(entry.options).map(([key, declared]) => optionOf({key, declared})),
        envelopeFlag,
        handler((model, target) =>
          runRpc({...target, ...(entry.scope === 'home' ? {home: entry.extension} : {})}, (rpc) =>
            rpc.extensions.run({
              name: entry.name,
              args: entry.positionals.flatMap((positional) => {
                const value: unknown = model[positional]
                return typeof value === 'string' ? [value] : []
              }),
              options: valuesOf({model, declared: Object.keys(entry.options)}),
            }),
          ),
        ),
      ),
    ),
  ),
)

export function extensionCatalog(): ExtensionCatalog {
  const empty = {owners: [], commands: []}
  const home = concivHome({env: process.env})
  if (stateRoot({cwd: process.cwd(), env: process.env}) === undefined && readHomeDb(home, () => true) === null)
    return {...empty, unreadable: null}
  try {
    const {sources, commands} = localCatalog()
    return {
      owners: [...new Set(sources.list().map((source) => source.extension))],
      commands: commands.map((entry) => ({
        name: entry.name,
        extension: entry.extension,
        description: entry.description,
        positionals: entry.positionals,
        options: entry.options,
        scope: entry.scope,
      })),
      unreadable: null,
    }
  } catch (error) {
    return {...empty, unreadable: failureOf(error)}
  }
}

function optionOf(input: {key: string; declared: CommandOption}) {
  const {key, declared} = input
  if (declared.type === 'boolean') return toggle(name(key), description(declared.description))
  if (declared.multiple === true)
    return option(
      name(key),
      description(declared.description),
      dashValue,
      multiple(),
      schema(z.array(z.string()).optional()),
    )
  const scalar = declared.type === 'number' ? z.number() : z.string()
  return option(name(key), description(declared.description), dashValue, schema(scalar.optional()))
}

function valuesOf(input: {model: Record<string, unknown>; declared: string[]}): CommandValues {
  return Object.fromEntries(
    input.declared.flatMap((key) => {
      const parsed = OptionValueSchema.safeParse(input.model[key])
      return parsed.success ? [[key, parsed.data]] : []
    }),
  )
}
