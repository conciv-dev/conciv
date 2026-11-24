export * as InstructionEntry from './instruction-entry.js'

import {Context, type Effect, type Schema} from 'effect'
import {InstructionEntry} from '@conciv/plugin/schema/instruction-entry'
import type {Session} from '@conciv/plugin/schema/session'
import {tags} from '../effect/app-node.js'
import {LayerNode} from '../effect/layer-node.js'

export const Key = InstructionEntry.Key
export type Key = typeof Key.Type
export const Info = InstructionEntry.Info
export type Info = typeof Info.Type

export interface Interface {
  readonly list: (sessionId: Session.Id) => Effect.Effect<ReadonlyArray<Info>>
  readonly put: (input: {
    readonly sessionId: Session.Id
    readonly key: Key
    readonly value: Schema.Json
  }) => Effect.Effect<void, InstructionEntry.ValueTooLargeError>
  readonly remove: (input: {readonly sessionId: Session.Id; readonly key: Key}) => Effect.Effect<void>
}

export const Service = Context.Service<Interface>('@conciv/InstructionEntry')

export const node = LayerNode.unbound(Service, tags.values.location)
