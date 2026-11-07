import {description, extend, name, route, type AnyRoute} from '@bomb.sh/router'
import type {ToolCommandSignature} from '@conciv/contract'
import {envelopeFlag, type CliOutcome} from './envelope.js'
import {wireToolCommand} from './tool-command.js'

type ToolGroup = {
  name: string
  description: string
  signatures: readonly ToolCommandSignature[]
  call: (signature: ToolCommandSignature, input: Record<string, unknown>) => Promise<CliOutcome>
  extra: readonly AnyRoute[]
}

export function toolGroupRoute(group: ToolGroup) {
  return route(
    name(group.name),
    description(group.description),
    envelopeFlag,
    extend(...group.signatures.map((signature) => verbCommand(group, signature)), ...group.extra),
  )
}

function verbCommand(group: ToolGroup, signature: ToolCommandSignature) {
  return wireToolCommand(signature, {
    name: signature.name.slice(signature.name.indexOf('_') + 1),
    run: (input) => group.call(signature, input),
  })
}
