export * as SessionProjector from './projector.js'

import {eq, max} from 'drizzle-orm'
import {Effect, Layer} from 'effect'
import {chatMessages} from '@conciv/db'
import type {SessionId} from '@conciv/plugin/schema/session-id'
import type {SyntheticPayload} from '@conciv/plugin/schema/session-inbox'
import type {SessionMessage} from '@conciv/plugin/schema/session-message'
import {Database} from '../database/database.js'
import {Bus} from '../bus.js'
import {SessionEvent} from '@conciv/plugin/schema/session-event'
import {InstructionState} from './instruction-state.js'
import {SessionInbox} from './inbox.js'

type DatabaseService = Database.Interface['db']

const insertSynthetic = Effect.fn('SessionProjector.insertSynthetic')(function* (
  db: DatabaseService,
  input: {
    readonly id: SessionMessage.Id
    readonly sessionID: SessionId
    readonly payload: SyntheticPayload
    readonly created: number
  },
) {
  const last = yield* db
    .select({position: max(chatMessages.position)})
    .from(chatMessages)
    .where(eq(chatMessages.threadId, input.sessionID))
    .get()
    .pipe(Effect.orDie)
  yield* db
    .insert(chatMessages)
    .values({
      threadId: input.sessionID,
      position: (last?.position ?? -1) + 1,
      messageId: input.id,
      role: 'user',
      messageJson: {
        id: input.id,
        role: 'user',
        content: input.payload.text,
        createdAt: new Date(input.created),
        metadata: {conciv: {synthetic: {description: input.payload.description, metadata: input.payload.metadata}}},
      },
    })
    .run()
    .pipe(Effect.orDie)
})

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const db = (yield* Database.Service).db
    yield* bus.project(SessionEvent.InstructionsUpdated, (event) =>
      Effect.gen(function* () {
        yield* InstructionState.apply(db, event.data.sessionID, event.durable.seq, event.data.delta)
      }),
    )
    yield* bus.project(SessionEvent.InboxDelivered, (event) =>
      Effect.gen(function* () {
        const input = yield* SessionInbox.projectDelivered(db, {
          id: event.data.inboxID,
          sessionID: event.data.sessionID,
        })
        if (input.type === 'synthetic')
          yield* insertSynthetic(db, {
            id: input.id,
            sessionID: event.data.sessionID,
            payload: input.payload,
            created: event.created,
          })
      }),
    )
    yield* bus.project(SessionEvent.InboxEnqueued, (event) =>
      SessionInbox.projectAdmitted(db, {
        enqueuedSeq: event.durable.seq,
        id: event.data.inboxID,
        sessionID: event.data.sessionID,
        item: event.data.item,
        timeCreated: event.created,
      }),
    )
    yield* bus.project(SessionEvent.InboxCancelled, (event) =>
      SessionInbox.projectCancelled(db, {
        id: event.data.inboxID,
        sessionID: event.data.sessionID,
      }),
    )
    yield* bus.project(SessionEvent.InboxDeliveryChanged, (event) =>
      SessionInbox.projectDeliveryChanged(db, {
        id: event.data.inboxID,
        sessionID: event.data.sessionID,
        delivery: event.data.delivery,
      }),
    )
  }),
)
