import {z} from 'zod'
import {defineCommand, type CommandDef, type SubCommandsDef} from 'citty'
import {ToolCommandSignatureSchema, type ToolCommandSignature} from '@conciv/contract'
import {PAGE_TOOL_DEFS, PAGE_TOOL_PREFIX, pageVerbOfTool} from '@conciv/extension-page/defs'
import {userFailure} from './failure.js'
import {runRpc, runRpcWhenServing} from './request.js'
import {wireToolCommand} from './tool-command.js'

const REACT_CATEGORY = 'react'

const OFFLINE_HELP_NOTE = 'offline: showing the built-in page capabilities; a running server may add more'

const CatalogSchema = z.array(ToolCommandSignatureSchema)

type PageSignature = Pick<ToolCommandSignature, 'name' | 'summary' | 'category' | 'positional' | 'inputSchema'>

type PageCatalog = {signatures: PageSignature[]; offline: boolean}

function builtInSignatures(): PageSignature[] {
  return PAGE_TOOL_DEFS.map((def) => ({
    name: def.name,
    summary: def.meta?.summary ?? def.name,
    category: def.meta?.category,
    positional: def.meta?.positional,
    inputSchema: z.toJSONSchema(def.inputSchema, {io: 'input'}),
  }))
}

async function pageCatalog(): Promise<PageCatalog> {
  const outcome = await runRpcWhenServing((rpc) => rpc.registry.catalog(undefined))
  if (outcome === null) return {signatures: builtInSignatures(), offline: true}
  if (outcome.report !== 'json') throw new Error('the registry catalog returned no data')
  const signatures = CatalogSchema.parse(outcome.data).filter((signature) =>
    signature.name.startsWith(PAGE_TOOL_PREFIX),
  )
  return {signatures, offline: false}
}

function pageVerbSubCommands(signatures: readonly PageSignature[]): SubCommandsDef {
  if (signatures.length === 0) {
    throw userFailure('the running server declares no page capabilities', {
      hint: 'page tools come from the page extension the conciv core mounts; update or restart the dev server',
    })
  }
  return Object.fromEntries(
    signatures.map((signature) => {
      const verb = pageVerbOfTool(signature.name)
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

const changesCommand = defineCommand({
  meta: {name: 'changes', description: 'list (or --clear) the live-edit journal'},
  args: {clear: {type: 'boolean', description: 'reset the journal after listing'}},
  run: ({args}) => runRpc((rpc) => (args.clear ? rpc.page.clearChanges(undefined) : rpc.page.changes(undefined))),
})

export const pageCommand = defineCommand({
  meta: {name: 'page', description: 'read & drive the live page; run --help for every capability'},
  subCommands: async () => ({...pageVerbSubCommands((await pageCatalog()).signatures), changes: changesCommand}),
})

export const reactCommand = defineCommand({
  meta: {name: 'react', description: 'inspect & edit live React components; run --help for every capability'},
  subCommands: async () =>
    pageVerbSubCommands((await pageCatalog()).signatures.filter((signature) => signature.category === REACT_CATEGORY)),
})

export async function pageHelpNote(commands: readonly (CommandDef | undefined)[]): Promise<string | null> {
  if (!commands.some((command) => command === pageCommand || command === reactCommand)) return null
  return (await pageCatalog()).offline ? OFFLINE_HELP_NOTE : null
}
