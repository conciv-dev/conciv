export * as SessionInbox from './inbox.js'

import {and, asc, eq, or} from 'drizzle-orm'
import {Context, DateTime, Effect, Layer, Option, Schema} from 'effect'
import {chatMessages} from '@conciv/db'
import {
  Compaction,
  CompactionPayload,
  Delivery,
  Info,
  Item,
  MediaInfo,
  MediaUser,
  MediaUserPayload,
  Move,
  MovePayload,
  Synthetic,
  SyntheticPayload,
  User,
  UserPayload,
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

export {
  Compaction,
  CompactionPayload,
  Delivery,
  Info,
  Item,
  MediaInfo,
  MediaUser,
  MediaUserPayload,
  Move,
  MovePayload,
  Synthetic,
  SyntheticPayload,
  User,
  UserPayload,
}

export type Promotable = 'input' | 'steer'

const decodeMediaUser = Schema.decodeUnknownSync(MediaUserPayload)
const inboxLocks = KeyedMutex.makeUnsafe<SessionId>()
type PendingRef = {readonly id: SessionMessage.Id; readonly sessionID: SessionId}

export const serialized = <A, E, R>(sessionID: SessionId, effect: Effect.Effect<A, E, R>) =>
  inboxLocks.withLock(sessionID)(effect)

export class LifecycleConflict extends Schema.TaggedError<LifecycleConflict>()('SessionInbox.LifecycleConflict', {
  id: SessionMessage.Id,
}) {}

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
  throw new LifecycleConflict({id: base.id})
}

export const find = Effect.fn('SessionInbox.find')(function* (db: DatabaseService, id: SessionMessage.Id) {
  const row = yield* db.select().from(SessionInboxTable).where(eq(SessionInboxTable.id, id)).get().pipe(Effect.orDie)
  if (row === undefined) return undefined
  return fromRow(row)
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
    return yield* new LifecycleConflict({id})
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

export interface Interface {
  readonly list: (sessionID: SessionId) => Effect.Effect<Info[]>
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
  readonly admitCompaction: (input: {
    readonly id: SessionMessage.Id
    readonly sessionID: SessionId
    readonly delivery: Delivery
  }) => Effect.Effect<Info, LifecycleConflict>
  readonly cancel: (input: PendingRef) => Effect.Effect<void, LifecycleConflict>
  readonly steer: (input: PendingRef) => Effect.Effect<void, LifecycleConflict>
  readonly queue: (input: PendingRef) => Effect.Effect<void, LifecycleConflict>
}

export const Service = Context.Service<Interface>('@conciv/SessionInbox')

export const make = Effect.fn('SessionInbox.make')(function* () {
  const database = yield* Database.Service
  const db = database.db
  const bus = yield* Bus.Service

  const reconcile: Interface['reconcile'] = (request) =>
    Effect.gen(function* () {
      const existing =
        (yield* find(db, request.id)) ??
        (yield* promotedFromMessage(db, request.sessionID, request.id, request.delivery))
      if (existing === undefined) return undefined
      if (existing.type === 'compaction' || !matches(existing, request))
        return yield* new LifecycleConflict({id: request.id})
      return existing
    }).pipe(Effect.withSpan('SessionInbox.reconcile'))

  const admit: Interface['admit'] = (request) =>
    Effect.gen(function* () {
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
            defect instanceof LifecycleConflict
              ? find(db, request.id).pipe(
                  Effect.flatMap((stored) => (stored === undefined ? Effect.fail(defect) : Effect.succeed(stored))),
                )
              : Effect.die(defect),
          ),
        )
      if (!matches(admitted, {...request, type: request.item.type}))
        return yield* new LifecycleConflict({id: request.id})
      return admitted
    }).pipe(Effect.withSpan('SessionInbox.admit'))

  const admitCompaction = Effect.fn('SessionInbox.admitCompaction')(function* (input: {
    readonly id: SessionMessage.Id
    readonly sessionID: SessionId
    readonly delivery: Delivery
  }) {
    return yield* serialized(
      input.sessionID,
      Effect.gen(function* () {
        const exact = yield* find(db, input.id)
        if (exact) {
          if (exact.type === 'compaction' && exact.sessionID === input.sessionID) return exact
          return yield* new LifecycleConflict({id: input.id})
        }
        if (yield* promotedFromMessage(db, input.sessionID, input.id, input.delivery))
          return yield* new LifecycleConflict({id: input.id})
        const pending = (yield* list(db, input.sessionID)).find((item) => item.type === 'compaction')
        if (pending) return pending
        return yield* admit({
          id: input.id,
          sessionID: input.sessionID,
          item: {type: 'compaction', payload: {}, delivery: input.delivery},
        })
      }),
    )
  })

  const cancel = Effect.fn('SessionInbox.cancel')((input: PendingRef) =>
    publishMutation(
      input,
      bus.publish(SessionEvent.InboxCancelled, {
        sessionID: input.sessionID,
        inboxID: input.id,
      }),
    ),
  )

  const steer = Effect.fn('SessionInbox.steer')((input: PendingRef) =>
    publishMutation(
      input,
      bus.publish(SessionEvent.InboxDeliveryChanged, {
        sessionID: input.sessionID,
        inboxID: input.id,
        delivery: 'steer',
      }),
    ),
  )

  const queue = Effect.fn('SessionInbox.queue')((input: PendingRef) =>
    publishMutation(
      input,
      bus.publish(SessionEvent.InboxDeliveryChanged, {
        sessionID: input.sessionID,
        inboxID: input.id,
        delivery: 'queue',
      }),
    ),
  )

  return Service.of({
    list: (sessionID: SessionId) => list(db, sessionID),
    reconcile,
    admit,
    admitCompaction,
    cancel,
    steer,
    queue,
  })
})

export const layer = Layer.effect(Service, make())

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
    return yield* Effect.die(new LifecycleConflict({id: request.id}))
  const payload =
    request.item.type === 'user'
      ? encodeUser(request.item.payload)
      : request.item.type === 'synthetic'
        ? encodeSynthetic(request.item.payload)
        : request.item.type === 'compaction'
          ? encodeCompaction(request.item.payload)
          : encodeMove(request.item.payload)
  const stored = yield* db
    .insert(SessionInboxTable)
    .values({
      id: request.id,
      session_id: request.sessionID,
      type: request.item.type,
      payload,
      delivery: request.item.delivery,
      enqueued_seq: request.enqueuedSeq,
      time_created: request.timeCreated,
    })
    .onConflictDoNothing()
    .returning({id: SessionInboxTable.id})
    .get()
    .pipe(Effect.orDie)
  if (!stored) return yield* Effect.die(new LifecycleConflict({id: request.id}))
})

export const projectDelivered = Effect.fn('SessionInbox.projectDelivered')(function* (
  db: DatabaseService,
  input: PendingRef,
) {
  const deleted = yield* db
    .delete(SessionInboxTable)
    .where(and(eq(SessionInboxTable.id, input.id), eq(SessionInboxTable.session_id, input.sessionID)))
    .returning()
    .get()
    .pipe(Effect.orDie)
  if (!deleted) return yield* Effect.die(new LifecycleConflict({id: input.id}))
  return delivered(deleted)
})

export type Delivered =
  | {readonly id: SessionMessage.Id; readonly type: 'user'; readonly payload: UserPayload}
  | {readonly id: SessionMessage.Id; readonly type: 'synthetic'; readonly payload: SyntheticPayload}
  | {readonly id: SessionMessage.Id; readonly type: 'compaction' | 'move'}

const delivered = (row: InboxRow): Delivered => {
  const id = SessionMessage.Id.make(row.id)
  if (row.type === 'user') return {id, type: 'user', payload: decodeUser(row.payload)}
  if (row.type === 'synthetic') return {id, type: 'synthetic', payload: decodeSynthetic(row.payload)}
  return {id, type: row.type}
}

export const projectCancelled = Effect.fn('SessionInbox.projectCancelled')(function* (
  db: DatabaseService,
  input: PendingRef,
) {
  const deleted = yield* db
    .delete(SessionInboxTable)
    .where(
      and(
        eq(SessionInboxTable.id, input.id),
        eq(SessionInboxTable.session_id, input.sessionID),
        or(eq(SessionInboxTable.delivery, 'queue'), eq(SessionInboxTable.delivery, 'steer')),
      ),
    )
    .returning({id: SessionInboxTable.id})
    .get()
    .pipe(Effect.orDie)
  if (!deleted) return yield* Effect.die(new LifecycleConflict({id: input.id}))
})

const projectDelivery = Effect.fn('SessionInbox.projectDelivery')(function* (
  db: DatabaseService,
  input: PendingRef & {readonly from: Delivery; readonly to: Delivery},
) {
  const updated = yield* db
    .update(SessionInboxTable)
    .set({delivery: input.to})
    .where(
      and(
        eq(SessionInboxTable.id, input.id),
        eq(SessionInboxTable.session_id, input.sessionID),
        eq(SessionInboxTable.delivery, input.from),
      ),
    )
    .returning({id: SessionInboxTable.id})
    .get()
    .pipe(Effect.orDie)
  if (!updated) return yield* Effect.die(new LifecycleConflict({id: input.id}))
})

export const projectDeliveryChanged = Effect.fn('SessionInbox.projectDeliveryChanged')(
  (db: DatabaseService, input: PendingRef & {readonly delivery: Delivery}) =>
    projectDelivery(db, {
      ...input,
      from: input.delivery === 'steer' ? 'queue' : 'steer',
      to: input.delivery,
    }),
)

const listRows = (db: DatabaseService, sessionID: SessionId) =>
  db
    .select()
    .from(SessionInboxTable)
    .where(eq(SessionInboxTable.session_id, sessionID))
    .orderBy(asc(SessionInboxTable.enqueued_seq))
    .all()
    .pipe(Effect.orDie)

export const list = Effect.fn('SessionInbox.list')(function* (db: DatabaseService, sessionID: SessionId) {
  return (yield* listRows(db, sessionID)).map(fromRow)
})

export const listWithRefs = Effect.fn('SessionInbox.listWithRefs')(function* (
  db: DatabaseService,
  sessionID: SessionId,
) {
  return (yield* listRows(db, sessionID)).map((row): MediaInfo => {
    if (row.type !== 'user') return fromRow(row)
    return MediaUser.make({
      id: SessionMessage.Id.make(row.id),
      sessionID: row.session_id,
      time: {created: DateTime.makeUnsafe(row.time_created)},
      type: 'user',
      payload: decodeMediaUser(row.payload),
      delivery: row.delivery,
    })
  })
})

export const moveIDs = Effect.fn('SessionInbox.moveIDs')(function* (db: DatabaseService, sessionID: SessionId) {
  return yield* db
    .select({id: SessionInboxTable.id})
    .from(SessionInboxTable)
    .where(and(eq(SessionInboxTable.session_id, sessionID), eq(SessionInboxTable.type, 'move')))
    .orderBy(asc(SessionInboxTable.enqueued_seq))
    .all()
    .pipe(Effect.orDie)
})

export const nextPromotable = Effect.fn('SessionInbox.nextPromotable')(function* (
  db: DatabaseService,
  sessionID: SessionId,
  promotable: Promotable,
) {
  const steer = (yield* pendingSteers(db, sessionID))[0]
  if (steer) return promotion(steer)
  if (promotable !== 'input') return undefined
  const queued = yield* firstQueued(db, sessionID)
  return queued ? promotion(queued) : undefined
})

export type Promotion =
  | {readonly id: SessionMessage.Id; readonly type: 'user' | 'synthetic' | 'compaction'; readonly delivery: Delivery}
  | {
      readonly id: SessionMessage.Id
      readonly type: 'move'
      readonly delivery: Delivery
      readonly payload: MovePayload
    }

const promotion = (row: InboxRow): Promotion =>
  row.type === 'move'
    ? {id: SessionMessage.Id.make(row.id), type: 'move', delivery: row.delivery, payload: decodeMove(row.payload)}
    : {id: SessionMessage.Id.make(row.id), type: row.type, delivery: row.delivery}

export type Scope = 'input' | Delivery

export const has = Effect.fn('SessionInbox.has')(function* (db: DatabaseService, sessionID: SessionId, scope: Scope) {
  const row = yield* db
    .select({id: SessionInboxTable.id})
    .from(SessionInboxTable)
    .where(
      and(
        eq(SessionInboxTable.session_id, sessionID),
        scope === 'input'
          ? or(eq(SessionInboxTable.delivery, 'steer'), eq(SessionInboxTable.delivery, 'queue'))
          : eq(SessionInboxTable.delivery, scope),
      ),
    )
    .limit(1)
    .get()
    .pipe(Effect.orDie)
  return row !== undefined
})

const publishMutation = <A, E, R>(input: PendingRef, effect: Effect.Effect<A, E, R>) =>
  serialized(input.sessionID, effect).pipe(
    Effect.asVoid,
    Effect.catchDefect((defect) => (defect instanceof LifecycleConflict ? Effect.fail(defect) : Effect.die(defect))),
  )

const publish = Effect.fn('SessionInbox.publish')(function* (
  db: DatabaseService,
  bus: Bus.Interface,
  sessionID: SessionId,
  rows: ReadonlyArray<InboxRow>,
) {
  yield* Effect.forEach(
    rows,
    (row) =>
      bus.publish(SessionEvent.InboxDelivered, {sessionID, inboxID: SessionMessage.Id.make(row.id)}).pipe(
        Effect.catchDefect((defect) =>
          defect instanceof LifecycleConflict
            ? promotedFromMessage(db, sessionID, SessionMessage.Id.make(row.id), row.delivery).pipe(
                Effect.flatMap((stored) => (stored !== undefined ? Effect.void : Effect.die(defect))),
                Effect.orDie,
              )
            : Effect.die(defect),
        ),
      ),
    {discard: true},
  )
  return rows.length
})

export const promote = Effect.fn('SessionInbox.promote')(function* (
  db: DatabaseService,
  bus: Bus.Interface,
  sessionID: SessionId,
  scope: Promotable,
) {
  return yield* serialized(
    sessionID,
    Effect.gen(function* () {
      const steers = yield* pendingSteers(db, sessionID)
      if (steers.length > 0 || scope === 'steer') {
        const first = steers[0]
        if (first !== undefined && isControl(first)) return undefined
        return yield* publish(db, bus, sessionID, beforeControl(steers))
      }

      const queued = yield* firstQueued(db, sessionID)
      if (!queued) return 0
      if (isControl(queued)) return undefined
      const promoted = yield* publish(db, bus, sessionID, [queued])
      return promoted + (yield* publish(db, bus, sessionID, beforeControl(yield* pendingSteers(db, sessionID))))
    }),
  )
})

const isControl = (row: InboxRow) => row.type === 'compaction' || row.type === 'move'

const beforeControl = (rows: Array<InboxRow>) => {
  const control = rows.findIndex(isControl)
  return control === -1 ? rows : rows.slice(0, control)
}

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
    .pipe(
      Effect.orDie,
      Effect.map((rows) => {
        const control = rows.findIndex(isControl)
        if (control > 0 && rows[control]?.type === 'compaction') rows.unshift(...rows.splice(control, 1))
        return rows
      }),
    )
