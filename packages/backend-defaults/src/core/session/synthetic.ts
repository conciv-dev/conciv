import type {Effect as EffectType} from 'effect'
import {Effect} from 'effect'
import type {SessionId} from '@conciv/protocol/schema/session-id'
import * as SessionMessage from '@conciv/protocol/schema/session-message'
import type {Maker} from '@conciv/protocol/schema/identifier'
import {sessionErrors} from '@conciv/errors'
import type {EvlogError} from 'evlog'
import * as SessionInbox from './inbox.js'

export type Store = {readonly get: (sessionID: SessionId) => EffectType.Effect<unknown, EvlogError>}

export const make = (
  store: Store,
  inbox: SessionInbox.Interface,
  ids: Maker,
  wake: (sessionID: SessionId) => EffectType.Effect<void>,
) =>
  Effect.fn('Session.synthetic')(function* (input: {
    sessionID: SessionId
    id?: SessionMessage.Id
    text: string
    description?: string
    metadata?: Record<string, unknown>
    delivery?: SessionInbox.Delivery
    resume?: boolean
  }) {
    const sessionID = input.sessionID
    yield* store.get(sessionID)
    const id = input.id ?? SessionMessage.Id.create(ids)
    const admitted = yield* inbox
      .admit({
        id,
        sessionID,
        item: {
          type: 'synthetic',
          delivery: input.delivery ?? 'steer',
          payload: SessionInbox.SyntheticPayload.make({
            text: input.text,
            description: input.description,
            metadata: input.metadata,
          }),
        },
      })
      .pipe(
        Effect.catchIf(SessionInbox.isLifecycleConflict, () =>
          Effect.fail(sessionErrors.SYNTHETIC_CONFLICT({inputId: id, internal: {sessionID, inputID: id}})),
        ),
      )
    if (input.resume !== false) yield* wake(sessionID)
    return admitted
  }, Effect.uninterruptible)
