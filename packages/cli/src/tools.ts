import {description, dynamic, extend, name, route, type AnyRoute} from '@bomb.sh/router'
import {groupBy, partition} from 'es-toolkit'
import {z} from 'zod'
import {contract, ToolCommandSignatureSchema, type ToolCommandSignature} from '@conciv/contract'
import {envelopeFlag} from './envelope.js'
import {openCommand} from './open.js'
import {pageChangesCommand} from './page.js'
import {runRpc} from './request.js'
import {callServerOperation} from './server.js'
import {wireToolCommand} from './tool-command.js'
import {toolGroupRoute} from './tool-group.js'

const SERVER_GROUP = 'server'

const PAGE_GROUP = 'page'

const REACT_CATEGORY = 'react'

const OPEN_TOOL = 'open'

export const toolsRoute = route(
  name('tools'),
  description('inspect & drive the live dev server: every tool group it serves (page, react, server, ...)'),
  envelopeFlag,
  dynamic(z.array(ToolCommandSignatureSchema), (catalog) => extend(...catalogRoutes(catalog))),
)

function catalogRoutes(catalog: readonly ToolCommandSignature[]): AnyRoute[] {
  const [grouped, single] = partition(catalog, (signature) => signature.name.includes('_'))
  const groups = Object.entries(groupBy(grouped, groupOf)).map(([group, signatures]) =>
    toolGroupRoute({
      name: group,
      description: `the ${group} tools the running dev server serves; run --help for every capability`,
      signatures,
      call: group === SERVER_GROUP ? callServerTool : callRegistry,
      extra: group === PAGE_GROUP ? [pageChangesCommand] : [],
    }),
  )
  return [...groups, ...reactView(grouped), ...single.map(singleCommand)]
}

function reactView(grouped: readonly ToolCommandSignature[]): AnyRoute[] {
  const signatures = grouped.filter(
    (signature) => groupOf(signature) === PAGE_GROUP && signature.category === REACT_CATEGORY,
  )
  if (signatures.length === 0) return []
  return [
    toolGroupRoute({
      name: REACT_CATEGORY,
      description: 'inspect & edit live React components; run --help for every capability',
      signatures,
      call: callRegistry,
      extra: [],
    }),
  ]
}

function singleCommand(signature: ToolCommandSignature): AnyRoute {
  if (signature.name === OPEN_TOOL) return openCommand(signature)
  return wireToolCommand(signature, {name: signature.name, run: (input) => callRegistry(signature, input)})
}

function groupOf(signature: ToolCommandSignature): string {
  return signature.name.slice(0, signature.name.indexOf('_'))
}

function callServerTool(signature: ToolCommandSignature, input: Record<string, unknown>) {
  if (Object.hasOwn(contract.server, signature.name.slice(SERVER_GROUP.length + 1))) {
    return callServerOperation(signature, input)
  }
  return callRegistry(signature, input)
}

function callRegistry(signature: ToolCommandSignature, input: Record<string, unknown>) {
  return runRpc((rpc) => rpc.registry.call({name: signature.name, input}))
}
