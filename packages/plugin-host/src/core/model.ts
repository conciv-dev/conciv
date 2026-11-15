export * as Model from './model.js'

import {Context, type Effect} from 'effect'
import {Model} from '../schema/model.js'

export const Info = Model.Info
export type Info = Model.Info

export interface Interface {
  readonly available: (types?: readonly Model.Type[]) => Effect.Effect<readonly Info[]>
  readonly default: () => Effect.Effect<Info | undefined>
}

export const Service = Context.Service<Interface>('@opencode/Model')
