export * as SessionSynthetic from './synthetic.js'

import type {Effect as EffectType} from 'effect'
import {Effect} from 'effect'
import type {Delivery} from '@conciv/plugin/schema/session-inbox'
import type {SessionId} from '@conciv/plugin/schema/session-id'
import {SessionMessage} from '@conciv/plugin/schema/session-message'
import {makeSyntheticConflictError, type NotFoundError} from './error.js'
import type {SessionInbox} from './inbox.js'

export type Store = {readonly get: (sessionID: SessionId) => EffectType.Effect<unknown, NotFoundError>}

export const make = (
  store: Store,
  inbox: SessionInbox.Interface,
  wake: (sessionID: SessionId) => EffectType.Effect<void>,
) =>
  Effect.fn('Session.synthetic')(function* (input: {
    sessionID: SessionId
    id?: SessionMessage.Id
    text: string
    description?: string
    metadata?: Record<string, unknown>
    delivery?: Delivery
    resume?: boolean
  }) {
    const sessionID = input.sessionID
    yield* store.get(sessionID)
    const id = input.id ?? SessionMessage.Id.create()
    const admitted = yield* inbox
      .admit({
        id,
        sessionID,
        item: {
          type: 'synthetic',
          delivery: input.delivery ?? 'steer',
          payload: {text: input.text, description: input.description, metadata: input.metadata},
        },
      })
      .pipe(
        Effect.catchTag('SessionInbox.LifecycleConflict', () =>
          Effect.fail(makeSyntheticConflictError({sessionID, inputID: id})),
        ),
      )
    if (input.resume !== false) yield* wake(sessionID)
    return admitted
  }, Effect.uninterruptible)
