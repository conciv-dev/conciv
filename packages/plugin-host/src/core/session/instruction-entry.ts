export * as InstructionEntry from './instruction-entry.js'

import {Context, type Effect, type Schema} from 'effect'
import {InstructionEntry} from '../../schema/instruction-entry.js'
import type {Session} from '../../schema/session.js'

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

export const Service = Context.Service<Interface>('@opencode/InstructionEntry')
