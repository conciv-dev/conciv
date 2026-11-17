import {description, dynamic, extend, name, route, type AnyRoute} from '@bomb.sh/router'
import {groupBy, partition} from 'es-toolkit'
import {z} from 'zod'
import {ToolCommandSignatureSchema, type ToolCommandSignature} from '@conciv/contract'
import {envelopeFlag} from './envelope.js'
import {pageChangesCommand} from './page.js'
import {runRpc, type CliTarget} from './request.js'
import {tabFlag} from './tab-flag.js'
import {wireToolCommand} from './tool-command.js'
import {toolGroupRoute} from './tool-group.js'

const PAGE_GROUP = 'page'

const REACT_CATEGORY = 'react'

export const toolsRoute = route(
  name('tools'),
  description('inspect & drive the live dev server: every tool group it serves (page, react, ...)'),
  envelopeFlag,
  tabFlag,
  dynamic(z.array(ToolCommandSignatureSchema), (catalog) => extend(...catalogRoutes(catalog))),
)

function catalogRoutes(catalog: readonly ToolCommandSignature[]): AnyRoute[] {
  const [grouped, single] = partition(catalog, (signature) => signature.name.includes('_'))
  const groups = Object.entries(groupBy(grouped, readGroup)).map(([group, signatures]) =>
    toolGroupRoute({
      name: group,
      description: `the ${group} tools the running dev server serves; run --help for every capability`,
      signatures,
      call: callRegistry,
      extra: group === PAGE_GROUP ? [pageChangesCommand] : [],
    }),
  )
  return [...groups, ...reactView(grouped), ...single.map(singleCommand)]
}

function reactView(grouped: readonly ToolCommandSignature[]): AnyRoute[] {
  const signatures = grouped.filter(
    (signature) => readGroup(signature) === PAGE_GROUP && signature.category === REACT_CATEGORY,
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
  return wireToolCommand(signature, {
    name: signature.name,
    run: (input, target) => callRegistry(signature, input, target),
  })
}

function readGroup(signature: ToolCommandSignature): string {
  return signature.name.slice(0, signature.name.indexOf('_'))
}

function callRegistry(signature: ToolCommandSignature, input: Record<string, unknown>, target: CliTarget) {
  return runRpc(target, (rpc) => rpc.registry.call({name: signature.name, input}))
}
