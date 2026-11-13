export * as SessionProjector from './projector.js'

import {Effect, Layer} from 'effect'
import {Database} from '../database/database.js'
import {Bus} from '../bus.js'
import {SessionEvent} from '../../schema/session-event.js'
import {InstructionState} from './instruction-state.js'

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const db = (yield* Database.Service).db
    yield* bus.project(SessionEvent.InstructionsUpdated, (event) =>
      Effect.gen(function* () {
        yield* InstructionState.apply(db, event.data.sessionID, event.durable.seq, event.data.delta)
      }),
    )
  }),
)
