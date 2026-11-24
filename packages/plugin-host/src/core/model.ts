export * as Model from './model.js'

import {Context, type Effect} from 'effect'
import {Model} from '@conciv/plugin/schema/model'
import {tags} from './effect/app-node.js'
import {LayerNode} from './effect/layer-node.js'

export const Info: typeof Model.Info = Model.Info
export type Info = Model.Info

export interface Interface {
  readonly available: (types?: readonly Model.Type[]) => Effect.Effect<readonly Info[]>
  readonly default: () => Effect.Effect<Info | undefined>
}

export const Service = Context.Service<Interface>('@conciv/Model')

export const node = LayerNode.unbound(Service, tags.values.location)
