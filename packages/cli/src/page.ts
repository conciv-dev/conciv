import {z} from 'zod'
import {defineCommand, type SubCommandsDef} from 'citty'
import {ToolCommandSignatureSchema, type ToolCommandSignature} from '@conciv/contract'
import {userFailure} from './failure.js'
import {runRpc} from './request.js'
import {wireToolCommand} from './tool-command.js'

const REACT_CATEGORY = 'react'

const PAGE_TOOL_PREFIX = 'page_'

const CatalogSchema = z.array(ToolCommandSignatureSchema)

async function fetchPageSignatures(): Promise<ToolCommandSignature[]> {
  const outcome = await runRpc((rpc) => rpc.registry.catalog(undefined))
  if (outcome.report !== 'json') throw new Error('the registry catalog returned no data')
  return CatalogSchema.parse(outcome.data).filter((signature) => signature.name.startsWith(PAGE_TOOL_PREFIX))
}

function verbOf(signature: ToolCommandSignature): string {
  return signature.name.slice(PAGE_TOOL_PREFIX.length)
}

function pageVerbSubCommands(signatures: readonly ToolCommandSignature[]): SubCommandsDef {
  if (signatures.length === 0) {
    throw userFailure('the running server declares no page capabilities', {
      hint: 'page tools come from the page extension the conciv core mounts; update or restart the dev server',
    })
  }
  return Object.fromEntries(
    signatures.map((signature) => {
      const verb = verbOf(signature)
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
  subCommands: async () => ({...pageVerbSubCommands(await fetchPageSignatures()), changes: changesCommand}),
})

export const reactCommand = defineCommand({
  meta: {name: 'react', description: 'inspect & edit live React components; run --help for every capability'},
  subCommands: async () =>
    pageVerbSubCommands((await fetchPageSignatures()).filter((signature) => signature.category === REACT_CATEGORY)),
})
