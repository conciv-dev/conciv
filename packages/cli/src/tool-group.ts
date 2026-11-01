import {z} from 'zod'
import {defineCommand, type CommandDef, type SubCommandsDef} from 'citty'
import {ToolCommandSignatureSchema, type ToolCommandSignature} from '@conciv/contract'
import type {ToolMeta} from '@conciv/extension/tool'
import {userFailure} from './failure.js'
import {runRpc, runRpcWhenServing} from './request.js'
import {wireToolCommand} from './tool-command.js'

const CatalogSchema = z.array(ToolCommandSignatureSchema)

type GroupSignature = Pick<ToolCommandSignature, 'name' | 'summary' | 'category' | 'positional' | 'inputSchema'>

type BuiltInTool = {name: string; inputSchema: z.ZodType; meta?: ToolMeta}

type GroupCatalog = {signatures: GroupSignature[]; offline: boolean}

export type ToolGroupOptions = {
  prefix: string
  name: string
  description: string
  builtIns: readonly BuiltInTool[]
  filter?: (signature: GroupSignature) => boolean
  extra?: SubCommandsDef
}

function builtInSignatures(builtIns: readonly BuiltInTool[]): GroupSignature[] {
  return builtIns.map((def) => ({
    name: def.name,
    summary: def.meta?.summary ?? def.name,
    category: def.meta?.category,
    positional: def.meta?.positional,
    inputSchema: z.toJSONSchema(def.inputSchema, {io: 'input'}),
  }))
}

async function groupCatalog(builtIns: readonly BuiltInTool[]): Promise<GroupCatalog> {
  const outcome = await runRpcWhenServing((rpc) => rpc.registry.catalog(undefined))
  if (outcome === null) return {signatures: builtInSignatures(builtIns), offline: true}
  if (outcome.report !== 'json') throw new Error('the registry catalog returned no data')
  return {signatures: CatalogSchema.parse(outcome.data), offline: false}
}

function verbSubCommands(options: ToolGroupOptions, signatures: readonly GroupSignature[]): SubCommandsDef {
  if (signatures.length === 0) {
    throw userFailure(`the running server declares no ${options.name} capabilities`, {
      hint: `${options.name} tools come from an extension the conciv core mounts; update or restart the dev server`,
    })
  }
  return Object.fromEntries(
    signatures.map((signature) => {
      const verb = signature.name.slice(options.prefix.length)
      return [
        verb,
        wireToolCommand(signature, {
          name: verb,
          positional: signature.positional,
          run: (input) => runRpc((rpc) => rpc.registry.call({name: signature.name, input})),
        }),
      ]
    }),
  )
}

export function toolGroupCommand(options: ToolGroupOptions): CommandDef {
  const filter = options.filter ?? (() => true)
  return defineCommand({
    meta: {name: options.name, description: options.description},
    subCommands: async () => {
      const {signatures} = await groupCatalog(options.builtIns)
      const matching = signatures.filter((signature) => signature.name.startsWith(options.prefix) && filter(signature))
      return {...verbSubCommands(options, matching), ...options.extra}
    },
  })
}

export async function groupHelpNote(options: {
  commands: readonly (CommandDef | undefined)[]
  groups: Readonly<Record<string, CommandDef>>
}): Promise<string | null> {
  const noun = Object.keys(options.groups).find((key) => options.commands.includes(options.groups[key]))
  if (noun === undefined) return null
  const outcome = await runRpcWhenServing((rpc) => rpc.registry.catalog(undefined))
  if (outcome !== null) return null
  return `offline: showing the built-in ${noun} capabilities; a running server may add more`
}
