export * as SessionSynthetic from './synthetic.js'

import type {Effect as EffectType, Schema} from 'effect'
import {Effect} from 'effect'
import type {Delivery} from '@conciv/plugin/schema/session-inbox'
import type {SessionId} from '@conciv/plugin/schema/session-id'
import {SessionMessage} from '@conciv/plugin/schema/session-message'
import {makeSyntheticConflictError, type NotFoundError} from './error.js'
import type {SessionInbox} from './inbox.js'

export type Store = {readonly get: (sessionId: SessionId) => EffectType.Effect<unknown, NotFoundError>}

export const make = (
  store: Store,
  inbox: SessionInbox.Interface,
  wake: (sessionId: SessionId) => EffectType.Effect<void>,
) =>
  Effect.fn('Session.synthetic')(function* (input: {
    sessionId: SessionId
    id?: SessionMessage.Id
    text: string
    description?: string
    metadata?: Record<string, Schema.Json>
    delivery?: Delivery
    resume?: boolean
  }) {
    const sessionId = input.sessionId
    yield* store.get(sessionId)
    const id = input.id ?? SessionMessage.Id.create()
    const admitted = yield* inbox
      .admit({
        id,
        sessionId,
        item: {
          type: 'synthetic',
          delivery: input.delivery ?? 'steer',
          payload: {text: input.text, description: input.description, metadata: input.metadata},
        },
      })
      .pipe(
        Effect.catchTag('SessionInbox.LifecycleConflict', () =>
          Effect.fail(makeSyntheticConflictError({sessionId, inputId: id})),
        ),
      )
    if (input.resume !== false) yield* wake(sessionId)
    return admitted
  }, Effect.uninterruptible)
