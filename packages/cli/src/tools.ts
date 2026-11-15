import {description, dynamic, extend, name, route, type AnyRoute} from '@bomb.sh/router'
import {groupBy, partition} from 'es-toolkit'
import {z} from 'zod'
import {contract, ToolCommandSignatureSchema, type ToolCommandSignature} from '@conciv/contract'
import {envelopeFlag} from './envelope.js'
import {openCommand} from './open.js'
import {runRpc, type CliTarget} from './request.js'
import {callServerOperation} from './server.js'
import {tabFlag} from './tab-flag.js'
import {wireToolCommand} from './tool-command.js'
import {toolGroupRoute} from './tool-group.js'

const SERVER_GROUP = 'server'

const OPEN_TOOL = 'open'

export const toolsRoute = route(
  name('tools'),
  description('inspect & drive the live dev server: every tool group it serves (server, ...)'),
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
      call: group === SERVER_GROUP ? callServerTool : callRegistry,
    }),
  )
  return [...groups, ...single.map(singleCommand)]
}

function singleCommand(signature: ToolCommandSignature): AnyRoute {
  if (signature.name === OPEN_TOOL) return openCommand(signature)
  return wireToolCommand(signature, {
    name: signature.name,
    run: (input, target) => callRegistry(signature, input, target),
  })
}

function readGroup(signature: ToolCommandSignature): string {
  return signature.name.slice(0, signature.name.indexOf('_'))
}

function callServerTool(signature: ToolCommandSignature, input: Record<string, unknown>, target: CliTarget) {
  if (Object.hasOwn(contract.server, signature.name.slice(SERVER_GROUP.length + 1))) {
    return callServerOperation(signature, input, target)
  }
  return callRegistry(signature, input, target)
}

function callRegistry(signature: ToolCommandSignature, input: Record<string, unknown>, target: CliTarget) {
  return runRpc(target, (rpc) => rpc.registry.call({name: signature.name, input}))
}
