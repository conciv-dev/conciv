export * as EventFeed from './event-feed.js'

import {Bus, Event, EventManifest, Rpc} from '@conciv/plugin-host'
import {EventEnvelopeSchema} from '@conciv/contract'
import {Cause, Context, Effect, Layer, Queue, Schema, Scope, Stream} from 'effect'
import type {z} from 'zod'

export const SubscriberCapacity = 4_096

export const SubscriberOverflowError = Schema.TaggedStruct('EventFeed.SubscriberOverflow', {capacity: Schema.Int})
export type SubscriberOverflowError = typeof SubscriberOverflowError.Type & globalThis.Error

export const makeSubscriberOverflowError = (
  fields: Omit<typeof SubscriberOverflowError.Type, '_tag'>,
): SubscriberOverflowError =>
  Object.assign(new globalThis.Error(), SubscriberOverflowError.make(fields), {name: 'EventFeed.SubscriberOverflow'})

export const EncodingError = Schema.TaggedStruct('EventFeed.EncodingError', {
  eventId: Event.Id,
  eventType: Schema.String,
  cause: Schema.Defect(),
})
export type EncodingError = typeof EncodingError.Type & globalThis.Error

export const makeEncodingError = (fields: Omit<typeof EncodingError.Type, '_tag'>): EncodingError =>
  Object.assign(new globalThis.Error(), EncodingError.make(fields), {name: 'EventFeed.EncodingError'})

export type Error = SubscriberOverflowError | EncodingError

export type ConcivEvent = z.output<typeof EventEnvelopeSchema>

export interface Interface {
  readonly subscribe: (
    types?: ReadonlyArray<string>,
  ) => Effect.Effect<Stream.Stream<ConcivEvent, Error>, never, Scope.Scope>
}

export const Service = Context.Service<Interface>('@opencode/server/EventFeed')

const ServerEvent = Schema.Union(EventManifest.ServerDefinitions)

const isRpcType = (type: string): type is `rpc.${string}` => type.startsWith('rpc.')

const isConcivEvent = (event: {readonly type: string}) =>
  event.type === 'server.connected' || EventManifest.isServer(event) || isRpcType(event.type)

export function encode(event: Event.Payload): ConcivEvent {
  const definition = isRpcType(event.type) ? Rpc.eventDefinition(event.type) : ServerEvent
  return EventEnvelopeSchema.parse(Schema.encodeUnknownSync(definition)(event))
}

export const make = Effect.fn('EventFeed.make')(function* (
  observe: (subscriber: Bus.Subscriber) => Effect.Effect<Bus.Unsubscribe>,
  options?: {readonly capacity?: number; readonly encode?: (event: Event.Payload) => ConcivEvent},
) {
  const capacity = options?.capacity ?? SubscriberCapacity
  const render = options?.encode ?? encode
  const subscribers = new Map<Queue.Queue<ConcivEvent, Error>, ReadonlySet<string> | undefined>()

  const fail = (error: Error) =>
    Effect.sync(() => {
      const current = Array.from(subscribers.keys())
      subscribers.clear()
      for (const subscriber of current) Queue.failCauseUnsafe(subscriber, Cause.fail(error))
    })

  const publish = Effect.fnUntraced(function* (event: Event.Payload) {
    if (!isConcivEvent(event)) return
    let encoded: ConcivEvent | undefined
    for (const [subscriber, types] of subscribers) {
      if (types && !types.has(event.type)) continue
      encoded ??= yield* Effect.try({
        try: () => render(event),
        catch: (cause) => makeEncodingError({eventId: event.id, eventType: event.type, cause}),
      }).pipe(
        Effect.catch((error) =>
          Effect.logError('Failed to encode public event', {
            eventId: error.eventId,
            eventType: error.eventType,
            cause: error.cause,
          }).pipe(Effect.andThen(fail(error)), Effect.as(undefined)),
        ),
      )
      if (encoded === undefined) return
      if (Queue.offerUnsafe(subscriber, encoded)) continue
      subscribers.delete(subscriber)
      Queue.failCauseUnsafe(subscriber, Cause.fail(makeSubscriberOverflowError({capacity})))
    }
  })

  const unsubscribe = yield* observe(publish)
  yield* Effect.addFinalizer(() => unsubscribe)

  return Service.of({
    subscribe: (types) =>
      Effect.acquireRelease(
        Queue.dropping<ConcivEvent, Error>(capacity).pipe(
          Effect.tap((queue) => Effect.sync(() => subscribers.set(queue, types?.length ? new Set(types) : undefined))),
        ),
        (queue) =>
          Effect.sync(() => subscribers.delete(queue)).pipe(Effect.andThen(Queue.shutdown(queue)), Effect.asVoid),
      ).pipe(Effect.map(Stream.fromQueue)),
  })
})

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    return yield* make(bus.listen)
  }),
)
