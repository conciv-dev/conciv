export * as App from './app.js'

import {Context, Layer} from 'effect'
import {makeGlobalNode} from './effect/app-node.js'

export interface Info {
  readonly name: string
  readonly version: string
  readonly channel: string
}

export const Service = Context.Service<Info>('@conciv/App')

export function make(input: Partial<Info> = {}): Info {
  return {
    name: input.name ?? 'conciv',
    version: input.version ?? 'unknown',
    channel: input.channel ?? 'unknown',
  }
}

export const node = makeGlobalNode({service: Service, layer: Layer.succeed(Service, make()), deps: []})
