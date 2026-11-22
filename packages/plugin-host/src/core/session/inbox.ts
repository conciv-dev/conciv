export * as SessionInbox from './inbox.js'

import {and, asc, eq, inArray, max} from 'drizzle-orm'
import {Context, DateTime, Effect, Layer, Option, Schema} from 'effect'
import {chatMessages} from '@conciv/db'
import {
  Compaction,
  CompactionPayload,
  Info,
  Move,
  MovePayload,
  Synthetic,
  SyntheticPayload,
  User,
  UserPayload,
  type Delivery,
  type Item,
} from '@conciv/plugin/schema/session-inbox'
import {SessionEvent} from '@conciv/plugin/schema/session-event'
import type {SessionId} from '@conciv/plugin/schema/session-id'
import {SessionMessage} from '@conciv/plugin/schema/session-message'
import {Database} from '../database/database.js'
import {Bus} from '../bus.js'
import {KeyedMutex} from '../effect/keyed-mutex.js'
import {SessionInboxTable} from './sql.js'

type DatabaseService = Database.Interface['db']
type InboxRow = typeof SessionInboxTable.$inferSelect
type StoredMessage = (typeof chatMessages.$inferSelect)['messageJson']
type PendingRef = {readonly id: SessionMessage.Id; readonly sessionID: SessionId}

export type Promotable = 'input' | 'steer'

export type Scope = 'input' | Delivery

export const LifecycleConflict = Schema.TaggedStruct('SessionInbox.LifecycleConflict', {id: SessionMessage.Id})
export type LifecycleConflict = typeof LifecycleConflict.Type & globalThis.Error

export const makeLifecycleConflict = (fields: Omit<typeof LifecycleConflict.Type, '_tag'>): LifecycleConflict =>
  Object.assign(new globalThis.Error(), LifecycleConflict.make(fields), {name: 'SessionInbox.LifecycleConflict'})

const isLifecycleConflict = Schema.is(LifecycleConflict)

const SyntheticTag = Schema.Struct({
  conciv: Schema.Struct({
    synthetic: Schema.Struct({
      description: Schema.optional(Schema.String),
      metadata: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
    }),
  }),
})

function matches<Type extends Item['type']>(
  stored: Info,
  request: PendingRef & {readonly type: Type},
): stored is Extract<Info, {readonly type: Type}> {
  return stored.sessionID === request.sessionID && stored.type === request.type
}

const decodeUser = Schema.decodeUnknownSync(UserPayload)
const encodeUser = Schema.encodeSync(UserPayload)
const decodeSynthetic = Schema.decodeUnknownSync(SyntheticPayload)
const encodeSynthetic = Schema.encodeSync(SyntheticPayload)
const decodeCompaction = Schema.decodeUnknownSync(CompactionPayload)
const encodeCompaction = Schema.encodeSync(CompactionPayload)
const decodeMove = Schema.decodeUnknownSync(MovePayload)
const encodeMove = Schema.encodeSync(MovePayload)
const readSyntheticTag = Schema.decodeUnknownOption(SyntheticTag)

const fromRow = (row: InboxRow): Info => {
  const base = {
    id: SessionMessage.Id.make(row.id),
    sessionID: row.session_id,
    time: {created: DateTime.makeUnsafe(row.time_created)},
  }
  if (row.type === 'compaction')
    return Compaction.make({
      ...base,
      type: 'compaction',
      payload: decodeCompaction(row.payload),
      delivery: row.delivery,
    })
  if (row.type === 'move')
    return Move.make({...base, type: 'move', payload: decodeMove(row.payload), delivery: row.delivery})
  if (row.type === 'user')
    return User.make({
      ...base,
      type: 'user',
      payload: decodeUser(row.payload),
      delivery: row.delivery,
    })
  if (row.type === 'synthetic')
    return Synthetic.make({
      ...base,
      type: 'synthetic',
      payload: decodeSynthetic(row.payload),
      delivery: row.delivery,
    })
  throw makeLifecycleConflict({id: base.id})
}

const find = Effect.fn('SessionInbox.find')(function* (db: DatabaseService, id: SessionMessage.Id) {
  const row = yield* db.select().from(SessionInboxTable).where(eq(SessionInboxTable.id, id)).get().pipe(Effect.orDie)
  return row === undefined ? undefined : fromRow(row)
})

const storedMessage = (db: DatabaseService, id: SessionMessage.Id) =>
  db
    .select({threadId: chatMessages.threadId, message: chatMessages.messageJson})
    .from(chatMessages)
    .where(eq(chatMessages.messageId, id))
    .get()
    .pipe(Effect.orDie)

const createdAt = (message: StoredMessage): number => {
  const created = message.createdAt === undefined ? Number.NaN : new Date(message.createdAt).getTime()
  return Number.isFinite(created) ? created : 0
}

const promotedFromMessage = Effect.fn('SessionInbox.promotedFromMessage')(function* (
  db: DatabaseService,
  sessionID: SessionId,
  id: SessionMessage.Id,
  delivery: Delivery,
) {
  const row = yield* storedMessage(db, id)
  if (row === undefined) return undefined
  const tag = readSyntheticTag(row.message.metadata)
  if (row.threadId !== sessionID || row.message.role !== 'user' || Option.isNone(tag))
    return yield* Effect.fail(makeLifecycleConflict({id}))
  return Synthetic.make({
    id,
    sessionID,
    time: {created: DateTime.makeUnsafe(createdAt(row.message))},
    type: 'synthetic',
    delivery,
    payload: SyntheticPayload.make({
      text: typeof row.message.content === 'string' ? row.message.content : '',
      description: tag.value.conciv.synthetic.description,
      metadata: tag.value.conciv.synthetic.metadata,
    }),
  })
})

const firstQueued = (db: DatabaseService, sessionID: SessionId) =>
  db
    .select()
    .from(SessionInboxTable)
    .where(and(eq(SessionInboxTable.session_id, sessionID), eq(SessionInboxTable.delivery, 'queue')))
    .orderBy(asc(SessionInboxTable.enqueued_seq))
    .limit(1)
    .get()
    .pipe(Effect.orDie)

const pendingSteers = (db: DatabaseService, sessionID: SessionId) =>
  db
    .select()
    .from(SessionInboxTable)
    .where(and(eq(SessionInboxTable.session_id, sessionID), eq(SessionInboxTable.delivery, 'steer')))
    .orderBy(asc(SessionInboxTable.enqueued_seq))
    .all()
    .pipe(Effect.orDie)

const deliveredMessages = (db: DatabaseService, sessionID: SessionId, rows: readonly InboxRow[]) =>
  rows.length === 0
    ? Effect.succeed<StoredMessage[]>([])
    : db
        .select({message: chatMessages.messageJson})
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.threadId, sessionID),
            inArray(
              chatMessages.messageId,
              rows.map((row) => row.id),
            ),
          ),
        )
        .orderBy(asc(chatMessages.position))
        .all()
        .pipe(
          Effect.orDie,
          Effect.map((found) => found.map((row) => row.message)),
        )

export interface Interface {
  readonly reconcile: <Type extends Item['type']>(request: {
    readonly id: SessionMessage.Id
    readonly sessionID: SessionId
    readonly type: Type
    readonly delivery: Delivery
  }) => Effect.Effect<Extract<Info, {readonly type: Type}> | undefined, LifecycleConflict>
  readonly admit: <Type extends Item['type']>(request: {
    readonly id: SessionMessage.Id
    readonly sessionID: SessionId
    readonly item: Item & {readonly type: Type}
  }) => Effect.Effect<Extract<Info, {readonly type: Type}>, LifecycleConflict>
  readonly has: (sessionID: SessionId, scope: Scope) => Effect.Effect<boolean>
  readonly promote: (sessionID: SessionId, scope: Promotable) => Effect.Effect<StoredMessage[]>
}

export const Service = Context.Service<Interface>('@conciv/SessionInbox')

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    const bus = yield* Bus.Service
    const locks = yield* KeyedMutex.make<SessionId>()

    const reconcile = Effect.fn('SessionInbox.reconcile')(function* <Type extends Item['type']>(request: {
      readonly id: SessionMessage.Id
      readonly sessionID: SessionId
      readonly type: Type
      readonly delivery: Delivery
    }) {
      const existing =
        (yield* find(db, request.id)) ??
        (yield* promotedFromMessage(db, request.sessionID, request.id, request.delivery))
      if (existing === undefined) return undefined
      if (existing.type === 'compaction' || !matches(existing, request))
        return yield* Effect.fail(makeLifecycleConflict({id: request.id}))
      return existing
    })

    const admit = Effect.fn('SessionInbox.admit')(function* <Type extends Item['type']>(request: {
      readonly id: SessionMessage.Id
      readonly sessionID: SessionId
      readonly item: Item & {readonly type: Type}
    }) {
      const existing = yield* reconcile({...request, type: request.item.type, delivery: request.item.delivery})
      if (existing !== undefined) return existing
      const admitted = yield* bus
        .publish(SessionEvent.InboxEnqueued, {
          inboxID: request.id,
          sessionID: request.sessionID,
          item: request.item,
        })
        .pipe(
          Effect.map((event) =>
            Info.make({
              id: request.id,
              sessionID: request.sessionID,
              time: {created: DateTime.makeUnsafe(event.created)},
              ...request.item,
            }),
          ),
          Effect.catchDefect((defect) =>
            isLifecycleConflict(defect)
              ? find(db, request.id).pipe(
                  Effect.flatMap((stored) =>
                    stored === undefined
                      ? Effect.fail(makeLifecycleConflict({id: request.id}))
                      : Effect.succeed(stored),
                  ),
                )
              : Effect.die(defect),
          ),
        )
      if (!matches(admitted, {...request, type: request.item.type}))
        return yield* Effect.fail(makeLifecycleConflict({id: request.id}))
      return admitted
    })

    const publish = (sessionID: SessionId, rows: readonly InboxRow[]) =>
      Effect.forEach(
        rows,
        (row) =>
          bus
            .publish(SessionEvent.InboxDelivered, {sessionID: sessionID, inboxID: SessionMessage.Id.make(row.id)})
            .pipe(
              Effect.catchDefect((defect) =>
                isLifecycleConflict(defect)
                  ? promotedFromMessage(db, sessionID, SessionMessage.Id.make(row.id), row.delivery).pipe(
                      Effect.flatMap((stored) => (stored !== undefined ? Effect.void : Effect.die(defect))),
                      Effect.orDie,
                    )
                  : Effect.die(defect),
              ),
            ),
        {discard: true},
      ).pipe(Effect.andThen(deliveredMessages(db, sessionID, rows)))

    return Service.of({
      reconcile,
      admit,
      has: Effect.fn('SessionInbox.has')(function* (sessionID, scope) {
        const row = yield* db
          .select({id: SessionInboxTable.id})
          .from(SessionInboxTable)
          .where(
            and(
              eq(SessionInboxTable.session_id, sessionID),
              scope === 'input' ? undefined : eq(SessionInboxTable.delivery, scope),
            ),
          )
          .limit(1)
          .get()
          .pipe(Effect.orDie)
        return row !== undefined
      }),
      promote: Effect.fn('SessionInbox.promote')(function* (sessionID, scope) {
        return yield* locks.withLock(sessionID)(
          Effect.gen(function* () {
            const steers = yield* pendingSteers(db, sessionID)
            if (steers.length > 0 || scope === 'steer') return yield* publish(sessionID, steers)
            const queued = yield* firstQueued(db, sessionID)
            if (queued === undefined) return []
            const promoted = yield* publish(sessionID, [queued])
            return [...promoted, ...(yield* publish(sessionID, yield* pendingSteers(db, sessionID)))]
          }),
        )
      }),
    })
  }),
)

export const projectAdmitted = Effect.fn('SessionInbox.projectAdmitted')(function* (
  db: DatabaseService,
  request: {
    readonly enqueuedSeq: number
    readonly id: SessionMessage.Id
    readonly sessionID: SessionId
    readonly item: Item
    readonly timeCreated: number
  },
) {
  if ((yield* storedMessage(db, request.id)) !== undefined)
    return yield* Effect.die(makeLifecycleConflict({id: request.id}))
  const stored = yield* db
    .insert(SessionInboxTable)
    .values({
      id: request.id,
      session_id: request.sessionID,
      type: request.item.type,
      payload:
        request.item.type === 'user'
          ? encodeUser(request.item.payload)
          : request.item.type === 'synthetic'
            ? encodeSynthetic(request.item.payload)
            : request.item.type === 'compaction'
              ? encodeCompaction(request.item.payload)
              : encodeMove(request.item.payload),
      delivery: request.item.delivery,
      enqueued_seq: request.enqueuedSeq,
      time_created: request.timeCreated,
    })
    .onConflictDoNothing()
    .returning({id: SessionInboxTable.id})
    .get()
    .pipe(Effect.orDie)
  if (!stored) return yield* Effect.die(makeLifecycleConflict({id: request.id}))
})

const syntheticMessage = (id: string, payload: SyntheticPayload, delivered: number): StoredMessage => ({
  id,
  role: 'user',
  content: payload.text,
  createdAt: new Date(delivered),
  metadata: {conciv: {synthetic: {description: payload.description, metadata: payload.metadata}}},
})

export const projectDelivered = Effect.fn('SessionInbox.projectDelivered')(function* (
  db: DatabaseService,
  input: PendingRef & {readonly timeDelivered: number},
) {
  const deleted = yield* db
    .delete(SessionInboxTable)
    .where(and(eq(SessionInboxTable.id, input.id), eq(SessionInboxTable.session_id, input.sessionID)))
    .returning()
    .get()
    .pipe(Effect.orDie)
  if (!deleted) return yield* Effect.die(makeLifecycleConflict({id: input.id}))
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
      messageId: deleted.id,
      role: 'user',
      messageJson: syntheticMessage(deleted.id, decodeSynthetic(deleted.payload), input.timeDelivered),
    })
    .run()
    .pipe(Effect.orDie)
})
