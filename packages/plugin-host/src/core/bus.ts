export * as Bus from './bus.js'

import {Cause, Clock, Context, Effect, Layer, Option, PubSub, Schema, Stream} from 'effect'
import {Event} from '../schema/event.js'
import type {EventLog} from '../schema/event-log.js'
import {and, asc, eq, gt, isNull, lte, sql} from 'drizzle-orm'
import {Database} from './database/database.js'
import {EventSequenceTable, EventTable} from './event/sql.js'
import type {Location} from '../schema/location.js'
import {KeyedMutex} from './effect/keyed-mutex.js'
import {isDeepStrictEqual} from 'node:util'
import {Durable} from '../schema/durable-event-manifest.js'
import {SessionEvent} from '../schema/session-event.js'
import {SessionLegacy} from '../schema/session-legacy.js'
import type {SessionId} from '../schema/session-id.js'

export type Subscriber<D extends Event.Definition = Event.Definition> = (event: Event.Payload<D>) => Effect.Effect<void>
export type Unsubscribe = Effect.Effect<void>

export const latestSequence = Effect.fn('Bus.latestSequence')(function* (
  db: Database.Interface['db'],
  aggregateId: string,
) {
  const row = yield* db
    .select({seq: EventSequenceTable.seq})
    .from(EventSequenceTable)
    .where(eq(EventSequenceTable.aggregate_id, aggregateId))
    .get()
    .pipe(Effect.orDie)
  return row?.seq ?? -1
})

export const reserveSequence = Effect.fn('Bus.reserveSequence')(function* (
  db: Database.Interface['db'],
  aggregateId: string,
  seq: number,
) {
  yield* db
    .insert(EventSequenceTable)
    .values([{aggregate_id: aggregateId, seq}])
    .onConflictDoUpdate({
      target: EventSequenceTable.aggregate_id,
      set: {seq: sql`max(${EventSequenceTable.seq}, ${seq})`},
    })
    .run()
    .pipe(Effect.orDie)
})

export type SerializedEvent = {
  readonly id: Event.Id
  readonly type: string
  readonly created?: number
  readonly seq: number
  readonly aggregateID: string
  readonly data: Record<string, unknown>
}

export const InvalidDurableEventError = Schema.TaggedStruct('Bus.InvalidDurableEvent', {
  type: Schema.String,
  message: Schema.String,
})
export type InvalidDurableEventError = typeof InvalidDurableEventError.Type & globalThis.Error

export const makeInvalidDurableEventError = (
  fields: Omit<typeof InvalidDurableEventError.Type, '_tag'>,
): InvalidDurableEventError =>
  Object.assign(new globalThis.Error(fields.message), InvalidDurableEventError.make(fields), {
    name: 'Bus.InvalidDurableEvent',
  })

const envelope = (aggregateId: string, seq: number, version: number) => ({
  aggregateID: aggregateId,
  seq: Event.Seq.make(seq),
  version: Event.Version.make(version),
})

const requireAggregateId = (type: string, aggregate: string, data: unknown) => {
  const aggregateId = (data as Record<string, unknown>)[aggregate]
  if (typeof aggregateId === 'string') return Effect.succeed(aggregateId)
  return Effect.die(makeInvalidDurableEventError({type, message: `Expected string aggregate field ${aggregate}`}))
}

const decodeStoredData = (definition: Event.DurableDefinition, data: unknown) =>
  Schema.decodeUnknownSync(definition.data)(SessionLegacy.event(definition.type, data))

const decodeSerializedEvent = (event: SerializedEvent): Event.Payload => {
  const definition = Durable.get(event.type)
  if (!definition?.durable) {
    throw makeInvalidDurableEventError({type: event.type, message: `Unknown durable event type ${event.type}`})
  }
  return {
    id: event.id,
    created: event.created ?? 0,
    type: definition.type,
    durable: envelope(event.aggregateID, event.seq, definition.durable.version),
    data: decodeStoredData(definition, event.data),
  }
}

export const versionedType = Event.versionedType
export const durable = Event.durable
export const ephemeral = Event.ephemeral

export interface PublishOptions {
  readonly id?: Event.Id
  readonly metadata?: Record<string, unknown>
  readonly location?: Location.Ref
  readonly global?: boolean
  readonly commit?: (seq: number) => Effect.Effect<void>
}

export type PublishInput<D extends Event.DurableDefinition = Event.DurableDefinition> = readonly [
  definition: D,
  data: Event.Data<D>,
  options?: PublishOptions,
]

export type PublishResult<I extends readonly PublishInput[]> = {
  readonly [K in keyof I]: I[K] extends PublishInput<infer D> ? Event.Payload<D> : never
}

export type LogItem = Event.Payload | EventLog.Synced

export const isSynced = (item: LogItem): item is EventLog.Synced => item.type === 'log.synced'

export type SubscribePayload<D extends readonly Event.Definition[]> = D[number] extends infer Item
  ? Item extends Event.Definition
    ? Event.Payload<Item>
    : never
  : never

export interface Subscribe {
  (): Stream.Stream<Event.Payload>
  <D extends Event.Definition>(definition: D): Stream.Stream<Event.Payload<D>>
  <const D extends readonly [Event.Definition, ...Event.Definition[]]>(
    definitions: D,
  ): Stream.Stream<SubscribePayload<D>>
}

const isDefinition = (input: Event.Definition | readonly Event.Definition[]): input is Event.Definition =>
  !Array.isArray(input)

export interface Interface {
  readonly publish: <D extends Event.Definition>(
    definition: D,
    data: Event.Data<D>,
    options?: PublishOptions,
  ) => Effect.Effect<Event.Payload<D>>
  readonly publishAll: <const I extends readonly [PublishInput, ...PublishInput[]]>(
    events: I,
  ) => Effect.Effect<PublishResult<I>>
  readonly subscribe: Subscribe
  readonly log: (input: {
    readonly aggregateID: string
    readonly after?: number
    readonly follow?: boolean
  }) => Stream.Stream<LogItem>
  readonly listen: (listener: Subscriber) => Effect.Effect<Unsubscribe>
  readonly project: <D extends Event.Definition>(definition: D, projector: Subscriber<D>) => Effect.Effect<void>
  readonly replay: (
    event: SerializedEvent,
    options?: {readonly publish?: boolean; readonly ownerID?: string; readonly strictOwner?: boolean},
  ) => Effect.Effect<void>
  readonly remove: (aggregateId: string) => Effect.Effect<void>
  readonly claim: (aggregateId: string, ownerId: string) => Effect.Effect<void>
}

export const Service = Context.Service<Interface>('@opencode/Bus')

interface Options {
  readonly beforeAggregateRead?: (aggregateId: string) => Effect.Effect<void>
  readonly logReadPageSize?: number
  readonly persist?: boolean
}

export function configured(options?: Options) {
  return Layer.effect(
    Service,
    Effect.gen(function* () {
      const {Location} = yield* Effect.promise(() => import('./location.js'))
      const {SessionTable} = yield* Effect.promise(() => import('./session/sql.js'))
      const engine = Option.getOrUndefined(yield* Effect.serviceOption(Location.Service))
      const pubsub = {
        live: yield* PubSub.unbounded<Event.Payload>(),
        durable: new Map<string, Set<PubSub.PubSub<void>>>(),
        typed: new Map<string, Set<PubSub.PubSub<Event.Payload>>>(),
      }
      const projectors = new Map<string, Subscriber[]>()
      const listeners = new Array<Subscriber>()
      const durableLocks = KeyedMutex.makeUnsafe<string>()
      const {db} = yield* Database.Service
      const logReadPageSize = options?.logReadPageSize ?? 512
      const persist = options?.persist ?? false
      const sessions = new Map<SessionId, Location.Ref>()
      const routes = new WeakMap<Event.Payload, readonly Location.Ref[]>()

      const isSessionEvent = (event: Event.Payload): event is SessionEvent.Event =>
        Object.hasOwn(SessionEvent.All.cases, event.type)

      const prepareRoutes = Effect.fnUntraced(function* (events: readonly Event.Payload[]) {
        const updates = new Map<SessionId, Location.Ref | undefined>()
        const resolved = new Map<Event.Payload, readonly Location.Ref[]>()
        for (const event of events) {
          if (!isSessionEvent(event)) continue
          const id = event.data.sessionID
          if (event.location) {
            if (event.type === 'session.deleted') updates.set(id, undefined)
            continue
          }
          const owner = id
          let ref = updates.has(owner) ? updates.get(owner) : sessions.get(owner)
          if (!ref && !updates.has(owner)) {
            if (engine) {
              const row = yield* db
                .select({id: SessionTable.id})
                .from(SessionTable)
                .where(and(eq(SessionTable.id, owner), isNull(SessionTable.deletedAt)))
                .get()
                .pipe(Effect.orDie)
              ref = row ? {directory: engine.directory, workspaceId: engine.workspaceId} : undefined
            }
            updates.set(owner, ref)
          }
          resolved.set(event, event.location ? [event.location] : ref ? [ref] : [])
          if (event.type === 'session.deleted') updates.set(id, undefined)
        }
        return () => {
          for (const [id, ref] of updates) {
            if (ref) sessions.set(id, ref)
            else sessions.delete(id)
          }
          for (const [event, ref] of resolved) routes.set(event, ref)
        }
      })

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* PubSub.shutdown(pubsub.live)
          yield* Effect.forEach(
            pubsub.durable.values(),
            (pubsubs) => Effect.forEach(pubsubs, PubSub.shutdown, {discard: true}),
            {discard: true},
          )
          yield* Effect.forEach(
            pubsub.typed.values(),
            (subscribers) => Effect.forEach(subscribers, PubSub.shutdown, {discard: true}),
            {discard: true},
          )
        }),
      )

      function commitDurableEvent(
        definition: Event.Definition,
        event: Event.Payload,
        input?: {
          readonly seq: number
          readonly aggregateID: string
          readonly ownerID?: string
          readonly strictOwner?: boolean
        },
        commit?: (seq: number) => Effect.Effect<void>,
      ) {
        return Effect.gen(function* () {
          const durable = definition.durable
          if (!durable) return yield* Effect.void
          const aggregateId = yield* requireAggregateId(event.type, durable.aggregate, event.data)
          if (input && input.aggregateID !== aggregateId) {
            yield* Effect.die(
              makeInvalidDurableEventError({
                type: event.type,
                message: `Aggregate mismatch: expected ${input.aggregateID}, got ${aggregateId}`,
              }),
            )
          }
          const list = projectors.get(versionedType(definition.type, durable.version)) ?? []
          return yield* Effect.uninterruptible(
            Effect.gen(function* () {
              const committed = yield* db
                .transaction(() =>
                  Effect.gen(function* () {
                    const row = yield* db
                      .select({seq: EventSequenceTable.seq, ownerID: EventSequenceTable.owner_id})
                      .from(EventSequenceTable)
                      .where(eq(EventSequenceTable.aggregate_id, aggregateId))
                      .get()
                      .pipe(Effect.orDie)
                    const latest = row?.seq ?? -1
                    const encode = () =>
                      Schema.encodeUnknownSync(definition.data)(event.data) as Record<string, unknown>
                    if (input?.strictOwner && row?.ownerID && row.ownerID !== input.ownerID) {
                      yield* Effect.die(
                        makeInvalidDurableEventError({
                          type: event.type,
                          message: `Replay owner mismatch for aggregate ${aggregateId}: expected ${row.ownerID}, got ${input.ownerID ?? 'none'}`,
                        }),
                      )
                    }
                    if (input && input.seq <= latest) {
                      if (!persist) return
                      const stored = yield* db
                        .select()
                        .from(EventTable)
                        .where(and(eq(EventTable.aggregate_id, aggregateId), eq(EventTable.seq, input.seq)))
                        .get()
                        .pipe(Effect.orDie)
                      if (
                        stored?.id === event.id &&
                        stored.type === versionedType(definition.type, durable.version) &&
                        stored.created === (event.created ?? 0) &&
                        isDeepStrictEqual(SessionLegacy.event(definition.type, stored.data), encode())
                      ) {
                        if (input.ownerID && row?.ownerID == null) {
                          yield* db
                            .update(EventSequenceTable)
                            .set({owner_id: input.ownerID})
                            .where(eq(EventSequenceTable.aggregate_id, aggregateId))
                            .run()
                            .pipe(Effect.orDie)
                        }
                        return
                      }
                      yield* Effect.die(
                        makeInvalidDurableEventError({
                          type: event.type,
                          message: `Replay diverged at aggregate ${aggregateId} sequence ${input.seq}`,
                        }),
                      )
                    }
                    if (input && row?.ownerID && row.ownerID !== input.ownerID) {
                      return
                    }
                    const seq = input?.seq ?? latest + 1
                    if (input && seq !== latest + 1) {
                      yield* Effect.die(
                        makeInvalidDurableEventError({
                          type: event.type,
                          message: `Sequence mismatch for aggregate ${aggregateId}: expected ${latest + 1}, got ${seq}`,
                        }),
                      )
                    }
                    if (persist) {
                      const stored = yield* db
                        .select({aggregateID: EventTable.aggregate_id, seq: EventTable.seq})
                        .from(EventTable)
                        .where(eq(EventTable.id, event.id))
                        .get()
                        .pipe(Effect.orDie)
                      if (stored)
                        yield* Effect.die(
                          makeInvalidDurableEventError({
                            type: event.type,
                            message: `Event ${event.id} already exists at aggregate ${stored.aggregateID} sequence ${stored.seq}`,
                          }),
                        )
                    }
                    const committed = {
                      ...event,
                      durable: {aggregateID: aggregateId, seq, version: durable.version},
                    } as Event.Payload
                    const route = yield* prepareRoutes([committed])
                    for (const projector of list) {
                      yield* projector(committed)
                    }
                    if (commit) yield* commit(seq)
                    yield* db
                      .insert(EventSequenceTable)
                      .values([{aggregate_id: aggregateId, seq, owner_id: input?.ownerID}])
                      .onConflictDoUpdate({
                        target: EventSequenceTable.aggregate_id,
                        set: {
                          seq: sql`max(${EventSequenceTable.seq}, ${seq})`,
                          ...(input?.ownerID && row?.ownerID == null ? {owner_id: input.ownerID} : {}),
                        },
                      })
                      .run()
                      .pipe(Effect.orDie)
                    if (persist)
                      yield* db
                        .insert(EventTable)
                        .values([
                          {
                            id: event.id,
                            aggregate_id: aggregateId,
                            seq,
                            created: event.created ?? 0,
                            type: versionedType(definition.type, durable.version),
                            data: encode(),
                          },
                        ])
                        .run()
                        .pipe(Effect.orDie)
                    return {aggregateID: aggregateId, seq, event: committed, route}
                  }),
                )
                .pipe(Effect.orDie)
              if (committed) {
                committed.route()
                yield* Effect.forEach(
                  pubsub.durable.get(committed.aggregateID) ?? [],
                  (wake) => PubSub.publish(wake, undefined),
                  {discard: true},
                )
              }
              return committed
            }),
          )
        })
      }

      function publishEvent<D extends Event.Definition>(
        definition: D,
        event: Event.Payload<D>,
        commit?: PublishOptions['commit'],
      ) {
        return Effect.gen(function* () {
          if (!definition.durable && commit)
            return yield* Effect.die(
              makeInvalidDurableEventError({
                type: event.type,
                message: 'Local commit hooks require a durable event',
              }),
            )
          if (definition.durable) {
            const aggregateId = (event.data as Record<string, unknown>)[definition.durable.aggregate]
            if (typeof aggregateId !== 'string')
              return yield* commitDurableEvent(definition, event as Event.Payload, undefined, commit).pipe(
                Effect.as(event),
              )
            return yield* durableLocks.withLock(aggregateId)(
              Effect.gen(function* () {
                const committed = yield* commitDurableEvent(definition, event as Event.Payload, undefined, commit)
                if (!committed) return event
                event = committed.event as Event.Payload<D>
                yield* notify(event as Event.Payload, true)
                return event
              }),
            )
          }
          const route = yield* prepareRoutes([event as Event.Payload])
          route()
          yield* notify(event as Event.Payload, false)
          return event
        })
      }

      const observe = (event: Event.Payload, observer: (event: Event.Payload) => Effect.Effect<void>) =>
        Effect.suspend(() => observer(event)).pipe(
          Effect.catchCauseIf(
            (cause) => !Cause.hasInterrupts(cause),
            (cause) => Effect.logError('Event listener failed', {eventID: event.id, eventType: event.type, cause}),
          ),
        )

      function notify(event: Event.Payload, isolateListeners: boolean) {
        return Effect.gen(function* () {
          yield* Effect.forEach(
            listeners,
            (listener) => (isolateListeners ? observe(event, listener) : listener(event)),
            {discard: true},
          )
          yield* PubSub.publish(pubsub.live, event)
          const typed = pubsub.typed.get(event.type)
          if (typed) yield* Effect.forEach(typed, (subscriber) => PubSub.publish(subscriber, event), {discard: true})
        })
      }

      const makePayload = (definition: Event.Definition, data: unknown, options: PublishOptions | undefined) =>
        Effect.gen(function* () {
          const serviceLocation = Option.getOrUndefined(yield* Effect.serviceOption(Location.Service))
          const location = options?.global
            ? undefined
            : (options?.location ??
              (serviceLocation
                ? {directory: serviceLocation.directory, workspaceId: serviceLocation.workspaceId}
                : undefined))
          return {
            id: options?.id ?? Event.Id.create(),
            created: yield* Clock.currentTimeMillis,
            ...(options?.metadata ? {metadata: options.metadata} : {}),
            type: definition.type,
            ...(location ? {location} : {}),
            data,
          } as Event.Payload
        })

      function publish<D extends Event.Definition>(definition: D, data: Event.Data<D>, options?: PublishOptions) {
        return Effect.gen(function* () {
          const event = (yield* makePayload(definition, data, options)) as Event.Payload<D>
          return yield* publishEvent(definition, event, options?.commit)
        })
      }

      function publishAll<const I extends readonly [PublishInput, ...PublishInput[]]>(events: I) {
        return Effect.gen(function* () {
          const payloads = yield* Effect.forEach(events, ([definition, data, options]) =>
            Effect.gen(function* () {
              const aggregateId = yield* requireAggregateId(definition.type, definition.durable.aggregate, data)
              return {
                definition,
                aggregateID: aggregateId,
                commit: options?.commit,
                event: yield* makePayload(definition, data, options),
              }
            }),
          )
          const aggregateId = payloads[0].aggregateID
          if (payloads.some((item) => item.aggregateID !== aggregateId)) {
            return yield* Effect.die(
              makeInvalidDurableEventError({
                type: payloads[0].definition.type,
                message: 'Published events must belong to the same aggregate',
              }),
            )
          }
          return yield* durableLocks.withLock(aggregateId)(
            Effect.uninterruptible(
              Effect.gen(function* () {
                const committed = yield* db
                  .transaction(() =>
                    Effect.gen(function* () {
                      const row = yield* db
                        .select({seq: EventSequenceTable.seq})
                        .from(EventSequenceTable)
                        .where(eq(EventSequenceTable.aggregate_id, aggregateId))
                        .get()
                        .pipe(Effect.orDie)
                      const firstSeq = (row?.seq ?? -1) + 1
                      const finalSeq = firstSeq + payloads.length - 1
                      const queued = payloads.map((item, index) => ({
                        ...item.event,
                        durable: envelope(aggregateId, firstSeq + index, item.definition.durable.version),
                      }))
                      const route = yield* prepareRoutes(queued)
                      const rows = new Array<typeof EventTable.$inferInsert>()
                      const ids = new Set<Event.Id>()
                      for (const [index, item] of payloads.entries()) {
                        const seq = firstSeq + index
                        if (persist) {
                          if (ids.has(item.event.id))
                            yield* Effect.die(
                              makeInvalidDurableEventError({
                                type: item.event.type,
                                message: `Event ${item.event.id} appears more than once in the batch`,
                              }),
                            )
                          ids.add(item.event.id)
                          const stored = yield* db
                            .select({aggregateID: EventTable.aggregate_id, seq: EventTable.seq})
                            .from(EventTable)
                            .where(eq(EventTable.id, item.event.id))
                            .get()
                            .pipe(Effect.orDie)
                          if (stored)
                            yield* Effect.die(
                              makeInvalidDurableEventError({
                                type: item.event.type,
                                message: `Event ${item.event.id} already exists at aggregate ${stored.aggregateID} sequence ${stored.seq}`,
                              }),
                            )
                        }
                        const event = queued[index]
                        if (!event) continue
                        for (const projector of projectors.get(
                          versionedType(item.definition.type, item.definition.durable.version),
                        ) ?? []) {
                          yield* projector(event)
                        }
                        if (item.commit) yield* item.commit(seq)
                        if (persist)
                          rows.push({
                            id: event.id,
                            aggregate_id: aggregateId,
                            seq,
                            created: event.created,
                            type: versionedType(item.definition.type, item.definition.durable.version),
                            data: Schema.encodeUnknownSync(item.definition.data)(item.event.data) as Record<
                              string,
                              unknown
                            >,
                          })
                      }
                      yield* db
                        .insert(EventSequenceTable)
                        .values([{aggregate_id: aggregateId, seq: finalSeq}])
                        .onConflictDoUpdate({target: EventSequenceTable.aggregate_id, set: {seq: finalSeq}})
                        .run()
                        .pipe(Effect.orDie)
                      if (persist) yield* db.insert(EventTable).values(rows).run().pipe(Effect.orDie)
                      return {events: queued, route}
                    }),
                  )
                  .pipe(Effect.orDie)
                committed.route()
                yield* Effect.forEach(
                  pubsub.durable.get(aggregateId) ?? [],
                  (wake) => PubSub.publish(wake, undefined),
                  {
                    discard: true,
                  },
                )
                yield* Effect.forEach(committed.events, (event) => notify(event, true), {discard: true})
                return committed.events as PublishResult<I>
              }),
            ),
          )
        })
      }

      function replay(
        event: SerializedEvent,
        options?: {readonly publish?: boolean; readonly ownerID?: string; readonly strictOwner?: boolean},
      ) {
        return Effect.gen(function* () {
          const definition = Durable.get(event.type)
          if (!definition?.durable)
            return yield* Effect.die(
              makeInvalidDurableEventError({type: event.type, message: `Unknown durable event type ${event.type}`}),
            )
          yield* durableLocks.withLock(event.aggregateID)(
            Effect.gen(function* () {
              const payload = {
                id: event.id,
                created: event.created ?? 0,
                type: definition.type,
                data: decodeStoredData(definition, event.data),
              } as Event.Payload
              const committed = yield* commitDurableEvent(definition, payload, {
                seq: event.seq,
                aggregateID: event.aggregateID,
                ownerID: options?.ownerID,
                strictOwner: options?.strictOwner,
              })
              if (committed && options?.publish) {
                yield* notify(committed.event, true)
              }
            }),
          )
        })
      }

      function remove(aggregateId: string) {
        return db
          .transaction(() =>
            Effect.gen(function* () {
              yield* db.delete(EventSequenceTable).where(eq(EventSequenceTable.aggregate_id, aggregateId)).run()
              yield* db.delete(EventTable).where(eq(EventTable.aggregate_id, aggregateId)).run()
            }),
          )
          .pipe(
            Effect.tap(() => Effect.sync(() => sessions.delete(aggregateId as SessionId))),
            Effect.orDie,
          )
      }

      function claim(aggregateId: string, ownerId: string) {
        return db
          .update(EventSequenceTable)
          .set({owner_id: ownerId})
          .where(eq(EventSequenceTable.aggregate_id, aggregateId))
          .run()
          .pipe(Effect.orDie)
      }

      const local = <A extends Event.Payload>(stream: Stream.Stream<A>) =>
        Stream.unwrap(
          Effect.serviceOption(Location.Service).pipe(
            Effect.map((location) =>
              Option.match(location, {
                onNone: () => stream,
                onSome: (location) => {
                  const matches = (ref: Location.Ref) =>
                    ref.directory === location.directory && ref.workspaceId === location.workspaceId
                  return stream.pipe(
                    Stream.filter((event) => {
                      const refs = routes.get(event)
                      if (refs) return refs.some(matches)
                      return !event.location || matches(event.location)
                    }),
                  )
                },
              }),
            ),
          ),
        )

      function subscribe(): Stream.Stream<Event.Payload>
      function subscribe<D extends Event.Definition>(definition: D): Stream.Stream<Event.Payload<D>>
      function subscribe<const D extends readonly [Event.Definition, ...Event.Definition[]]>(
        definitions: D,
      ): Stream.Stream<SubscribePayload<D>>
      function subscribe(input?: Event.Definition | readonly Event.Definition[]): Stream.Stream<Event.Payload> {
        if (input === undefined) return streamLive()
        const types = new Set((isDefinition(input) ? [input] : input).map((definition) => definition.type))
        return local(
          Stream.unwrap(
            Effect.acquireRelease(
              PubSub.unbounded<Event.Payload>().pipe(
                Effect.tap((subscriber) =>
                  Effect.sync(() => {
                    for (const type of types)
                      pubsub.typed.set(type, (pubsub.typed.get(type) ?? new Set()).add(subscriber))
                  }),
                ),
              ),
              (subscriber) =>
                Effect.sync(() => {
                  for (const type of types) {
                    const subscribers = pubsub.typed.get(type)
                    subscribers?.delete(subscriber)
                    if (subscribers?.size === 0) pubsub.typed.delete(type)
                  }
                }).pipe(Effect.andThen(PubSub.shutdown(subscriber))),
            ).pipe(Effect.flatMap(PubSub.subscribe), Effect.map(Stream.fromSubscription)),
          ),
        )
      }

      const streamLive = (): Stream.Stream<Event.Payload> => local(Stream.fromPubSub(pubsub.live))

      const readAfter = (
        aggregateId: string,
        after: number,
        input: {readonly through: number; readonly limit: number},
      ) =>
        (options?.beforeAggregateRead?.(aggregateId) ?? Effect.void).pipe(
          Effect.andThen(
            Effect.suspend(() => {
              const query = db
                .select()
                .from(EventTable)
                .where(
                  and(
                    eq(EventTable.aggregate_id, aggregateId),
                    gt(EventTable.seq, after),
                    lte(EventTable.seq, input.through),
                  ),
                )
                .orderBy(asc(EventTable.seq))
              return query.limit(input.limit).all()
            }),
          ),
          Effect.orDie,
          Effect.map((rows) => ({
            seq: rows.at(-1)?.seq,
            events: rows.flatMap((event) => {
              if (!Durable.get(event.type)?.durable) return []
              return [
                decodeSerializedEvent({
                  id: event.id,
                  created: event.created,
                  aggregateID: event.aggregate_id,
                  seq: event.seq,
                  type: event.type,
                  data: event.data,
                }),
              ]
            }),
          })),
        )

      const subscribeDurable = (aggregateId: string) =>
        Effect.gen(function* () {
          const wake = yield* PubSub.sliding<void>(1)
          const subscription = yield* PubSub.subscribe(wake)
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              const wakes = pubsub.durable.get(aggregateId) ?? new Set()
              wakes.add(wake)
              pubsub.durable.set(aggregateId, wakes)
            }),
            () =>
              Effect.sync(() => {
                const wakes = pubsub.durable.get(aggregateId)
                wakes?.delete(wake)
                if (wakes?.size === 0) pubsub.durable.delete(aggregateId)
              }).pipe(Effect.andThen(PubSub.shutdown(wake))),
          )
          return subscription
        })

      const log = (input: {
        readonly aggregateID: string
        readonly after?: number
        readonly follow?: boolean
      }): Stream.Stream<LogItem> =>
        Stream.unwrap(
          Effect.gen(function* () {
            let sequence = input.after ?? -1
            const readThrough = (through: number): Stream.Stream<Event.Payload> =>
              Stream.paginate(sequence, (cursor) =>
                readAfter(input.aggregateID, cursor, {through, limit: logReadPageSize}).pipe(
                  Effect.tap((page) =>
                    Effect.sync(() => {
                      sequence = page.seq ?? sequence
                    }),
                  ),
                  Effect.map(
                    (page) =>
                      [
                        page.events,
                        page.seq !== undefined && page.seq < through ? Option.some(page.seq) : Option.none<number>(),
                      ] as const,
                  ),
                ),
              )
            const wakes = input.follow ? yield* subscribeDurable(input.aggregateID) : undefined
            const target = yield* latestSequence(db, input.aggregateID)
            const marker: EventLog.Synced = {
              type: 'log.synced',
              aggregateID: input.aggregateID,
              ...(target >= 0 ? {seq: Event.Seq.make(target)} : {}),
            }
            const replay: Stream.Stream<LogItem> = readThrough(target).pipe(Stream.concat(Stream.make(marker)))
            if (!wakes) return replay
            const live: Stream.Stream<LogItem> = Stream.fromSubscription(wakes).pipe(
              Stream.mapEffect(() => latestSequence(db, input.aggregateID)),
              Stream.filter((target) => target > sequence),
              Stream.flatMap((target) => readThrough(target)),
            )
            return Stream.concat(replay, live)
          }),
        )

      const listen = (listener: Subscriber): Effect.Effect<Unsubscribe> =>
        Effect.sync(() => {
          listeners.push(listener)
          return Effect.sync(() => {
            const index = listeners.indexOf(listener)
            if (index >= 0) listeners.splice(index, 1)
          })
        })

      const project = <D extends Event.Definition>(definition: D, projector: Subscriber<D>): Effect.Effect<void> =>
        Effect.sync(() => {
          const key = definition.durable ? versionedType(definition.type, definition.durable.version) : definition.type
          const list = projectors.get(key) ?? []
          list.push((event) => projector(event as Event.Payload<D>))
          projectors.set(key, list)
        })

      return Service.of({
        publish,
        publishAll,
        subscribe,
        log,
        listen,
        project,
        replay,
        remove,
        claim,
      })
    }),
  )
}

export const layer = configured()
