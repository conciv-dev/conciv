import {command, description, dynamic, extend, name, route, type AnyRoute} from '@bomb.sh/router'
import {groupBy, partition} from 'es-toolkit'
import {z} from 'zod'
import {ToolCommandSignatureSchema, type ToolCommandSignature} from '@conciv/protocol'
import {concivHome} from '@conciv/home'
import {envelopeFlag, type CliOutcome} from './envelope.js'
import {listTabs} from './engine-read.js'
import {handler} from './router/handler.js'
import {runRpc, type CliTarget} from './request.js'
import {tabFlag} from './tab-flag.js'
import {wireToolCommand} from './tool-command.js'

type ToolGroup = {
  name: string
  description: string
  signatures: readonly ToolCommandSignature[]
  call: (signature: ToolCommandSignature, input: Record<string, unknown>, target: CliTarget) => Promise<CliOutcome>
}

function toolGroupRoute(group: ToolGroup) {
  return route(
    name(group.name),
    description(group.description),
    envelopeFlag,
    tabFlag,
    extend(...group.signatures.map((signature) => verbCommand(group, signature))),
  )
}

function verbCommand(group: ToolGroup, signature: ToolCommandSignature) {
  return wireToolCommand(signature, {
    name: signature.name.slice(signature.name.indexOf('_') + 1),
    run: (input, target) => group.call(signature, input, target),
  })
}

const tabsCommand = command(
  name('tabs'),
  description('list the open conciv tabs of every running conciv dev server on this machine'),
  envelopeFlag,
  tabFlag,
  handler(async () => ({report: 'json', data: await listTabs(concivHome({env: process.env}))})),
)

export const toolsRoute = route(
  name('tools'),
  description('inspect & drive the live dev server: every tool group it serves (page, design, ...)'),
  envelopeFlag,
  tabFlag,
  tabsCommand,
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
    }),
  )
  return [...groups, ...single.map(singleCommand)]
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
  return runRpc(target, (rpc) => rpc.registry.invoke({name: signature.name, input}))
}
