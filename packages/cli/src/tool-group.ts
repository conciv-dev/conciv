import {z} from 'zod'
import {description, dynamic, extend, name, route, type AnyRoute} from '@bomb.sh/router'
import {ToolCommandSignatureSchema, type ToolCommandSignature} from '@conciv/contract'
import type {ToolMeta} from '@conciv/extension/tool'
import {envelopeFlag} from './envelope.js'
import {userFailure} from './failure.js'
import {runRpc, runRpcWhenServing, type CliTarget} from './request.js'
import {tabFlag} from './tab-flag.js'
import {wireToolCommand} from './tool-command.js'

const CatalogSchema = z.array(ToolCommandSignatureSchema)

const LiveCatalogSchema = CatalogSchema.nullable()

export type LiveCatalog = z.infer<typeof LiveCatalogSchema>

type GroupSignature = Pick<ToolCommandSignature, 'name' | 'summary' | 'category' | 'positional' | 'inputSchema'>

type BuiltInTool = {name: string; inputSchema: z.ZodType; meta?: ToolMeta}

export type ToolGroupOptions = {
  prefix: string
  name: string
  description: string
  builtIns: readonly BuiltInTool[]
  filter?: (signature: GroupSignature) => boolean
  extra?: readonly AnyRoute[]
}

export async function liveCatalog(target: CliTarget): Promise<LiveCatalog> {
  const outcome = await runRpcWhenServing(target, (rpc) => rpc.registry.catalog(undefined))
  if (outcome === null) return null
  if (outcome.report !== 'json') throw new Error('the registry catalog returned no data')
  return CatalogSchema.parse(outcome.data)
}

export function toolGroupRoute(options: ToolGroupOptions) {
  return route(
    name(options.name),
    description(options.description),
    envelopeFlag,
    tabFlag,
    dynamic(LiveCatalogSchema, (catalog) => extend(...verbCommands(options, catalog), ...(options.extra ?? []))),
  )
}

function verbCommands(options: ToolGroupOptions, catalog: LiveCatalog) {
  const filter = options.filter ?? (() => true)
  const signatures = (catalog ?? builtInSignatures(options.builtIns)).filter(
    (signature) => signature.name.startsWith(options.prefix) && filter(signature),
  )
  if (signatures.length === 0) {
    throw userFailure(`the running server declares no ${options.name} capabilities`, {
      hint: `${options.name} tools come from an extension the conciv core mounts; update or restart the dev server`,
    })
  }
  return signatures.map((signature) => {
    const verb = signature.name.slice(options.prefix.length)
    return wireToolCommand(signature, {
      name: verb,
      positional: signature.positional,
      run: (input, target) => runRpc(target, (rpc) => rpc.registry.call({name: signature.name, input})),
    })
  })
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
