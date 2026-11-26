import {and, eq, inArray, isNull, max} from 'drizzle-orm'
import {Effect, Layer} from 'effect'
import {chatMessages} from '../../db/run-schema.js'
import type {SessionId} from '@conciv/protocol/schema/session-id'
import type {SyntheticPayload} from '@conciv/protocol/schema/session-inbox'
import type * as SessionMessage from '@conciv/protocol/schema/session-message'
import * as Database from '@conciv/backend-app-api/core/database/database'
import {OutsideNoticeTable} from '@conciv/backend-app-api/core/session/sql'
import * as Bus from '@conciv/backend-app-api/core/bus'
import * as SessionEvent from '@conciv/protocol/schema/session-event'
import * as InstructionState from './instruction-state.js'
import * as SessionInbox from './inbox.js'

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
    yield* bus.project(SessionEvent.OutsideExpected, (event) =>
      db
        .insert(OutsideNoticeTable)
        .values({
          id: event.data.id,
          session_id: event.data.sessionID,
          tool_call_id: event.data.toolCallId,
          text: null,
          delivered: false,
          created_at: event.created,
        })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie),
    )
    yield* bus.project(SessionEvent.OutsideNotice, (event) =>
      db
        .insert(OutsideNoticeTable)
        .values({
          id: event.data.id,
          session_id: event.data.sessionID,
          tool_call_id: event.data.toolCallId,
          text: event.data.text,
          delivered: false,
          created_at: event.created,
        })
        .onConflictDoUpdate({target: OutsideNoticeTable.id, set: {text: event.data.text}})
        .run()
        .pipe(Effect.orDie),
    )
    yield* bus.project(SessionEvent.OutsideDelivered, (event) =>
      db
        .update(OutsideNoticeTable)
        .set({delivered: true})
        .where(
          and(eq(OutsideNoticeTable.session_id, event.data.sessionID), inArray(OutsideNoticeTable.id, event.data.ids)),
        )
        .run()
        .pipe(Effect.orDie),
    )
    yield* bus.project(SessionEvent.Deleted, (event) =>
      db
        .delete(OutsideNoticeTable)
        .where(eq(OutsideNoticeTable.session_id, event.data.sessionID))
        .run()
        .pipe(Effect.orDie),
    )
    const lost = yield* db
      .select()
      .from(OutsideNoticeTable)
      .where(isNull(OutsideNoticeTable.text))
      .all()
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      lost,
      (row) =>
        bus.publish(SessionEvent.OutsideNotice, {
          sessionID: row.session_id,
          id: row.id,
          toolCallId: row.tool_call_id,
          text: `tool call ${row.tool_call_id} was lost: the engine restarted before it finished, so its actions may have partly run`,
        }),
      {discard: true},
    )
  }),
)
