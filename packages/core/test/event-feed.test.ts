import {describe, expect, test} from 'vitest'
import {Agent, Bus, Event, Plugin} from '@conciv/plugin-host'
import {Deferred, Effect, Exit, Fiber, Layer, Option, Schema, type Scope, Stream} from 'effect'
import {TestClock, TestConsole} from 'effect/testing'
import {EventFeed} from '../src/runtime/event-feed.js'

const testEnvironment = Layer.mergeAll(TestConsole.layer, TestClock.layer())

const it = {
  effect: <A, E>(name: string, body: () => Effect.Effect<A, E, Scope.Scope>) =>
    test(name, () => Effect.runPromise(Effect.suspend(body).pipe(Effect.scoped, Effect.provide(testEnvironment)))),
}

const Internal = Bus.ephemeral({type: 'test.internal', schema: {value: Schema.String}})

const event = (id: string): Event.Payload<typeof Agent.Event.Updated> => ({
  id: Event.Id.make(`evt_${id}`),
  created: Date.now(),
  type: Agent.Event.Updated.type,
  data: {},
})

const internal = (value: string): Event.Payload<typeof Internal> => ({
  id: Event.Id.create(),
  created: Date.now(),
  type: Internal.type,
  data: {value},
})

function makeSource() {
  let subscriber: Bus.Subscriber | undefined
  return {
    observe: (next: Bus.Subscriber) =>
      Effect.sync(() => {
        subscriber = next
        return Effect.sync(() => {
          if (subscriber === next) subscriber = undefined
        })
      }),
    publish: (event: Event.Payload) => Effect.suspend(() => (subscriber ? subscriber(event) : Effect.void)),
  }
}

describe('EventFeed', () => {
  test('preserves the public event envelope encoding', () => {
    const payload = event('wire')
    expect(EventFeed.encode(payload)).toStrictEqual({
      id: 'evt_wire',
      created: payload.created,
      type: 'agent.updated',
      data: {},
    })
  })

  it.effect('encodes once and delivers the same frame to every subscriber', () =>
    Effect.gen(function* () {
      let encodes = 0
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        encode: (event) => {
          encodes += 1
          return {id: event.id, type: event.type, data: {}}
        },
      })
      const first = yield* feed.subscribe()
      const second = yield* feed.subscribe()
      const left = yield* first.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
      const right = yield* second.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)

      yield* source.publish(event('example'))

      expect([Array.from(yield* Fiber.join(left)), Array.from(yield* Fiber.join(right))]).toMatchObject([
        [{type: Agent.Event.Updated.type}],
        [{type: Agent.Event.Updated.type}],
      ])
      expect(encodes).toBe(1)
    }),
  )

  it.effect('delivers only the requested event types to filtered subscribers', () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        encode: (event) => ({id: event.id, type: event.type, data: {}}),
      })
      const filtered = yield* feed.subscribe([Plugin.Event.Updated.type])
      const all = yield* feed.subscribe()
      const left = yield* filtered.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
      const right = yield* all.pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped)

      yield* source.publish(event('ignored'))
      yield* source.publish({
        id: Event.Id.create(),
        created: Date.now(),
        type: Plugin.Event.Updated.type,
        data: {},
      })

      expect(Array.from(yield* Fiber.join(left))).toMatchObject([{type: Plugin.Event.Updated.type}])
      expect(Array.from(yield* Fiber.join(right))).toMatchObject([
        {type: Agent.Event.Updated.type},
        {type: Plugin.Event.Updated.type},
      ])
    }),
  )

  it.effect('fails only the subscriber that exceeds its lag capacity', () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        capacity: 1,
        encode: (event) => ({id: event.id, type: event.type, data: {}}),
      })
      const slow = yield* feed.subscribe()
      const fast = yield* feed.subscribe()
      const first = yield* Deferred.make<void>()
      const second = yield* Deferred.make<void>()
      const received = new Array<string>()
      const fastFiber = yield* fast.pipe(
        Stream.take(3),
        Stream.runForEach((frame) =>
          Effect.sync(() => received.push(frame.id)).pipe(
            Effect.andThen(
              frame.id === 'evt_one'
                ? Deferred.succeed(first, undefined)
                : frame.id === 'evt_two'
                  ? Deferred.succeed(second, undefined)
                  : Effect.void,
            ),
          ),
        ),
        Effect.forkScoped,
      )

      yield* source.publish(event('one'))
      yield* Deferred.await(first)
      yield* source.publish(event('two'))
      yield* Deferred.await(second)
      yield* source.publish(event('three'))

      yield* Fiber.join(fastFiber)

      const result = yield* slow.pipe(Stream.runCollect, Effect.exit)
      expect(received).toEqual(['evt_one', 'evt_two', 'evt_three'])
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isSuccess(result)) return
      expect(Option.getOrUndefined(Exit.findErrorOption(result))).toMatchObject({
        _tag: 'EventFeed.SubscriberOverflow',
      })
    }),
  )

  it.effect('delivers events published without a location to public subscribers', () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        encode: (event) => ({id: event.id, type: event.type, data: {}}),
      })
      const stream = yield* feed.subscribe()
      const received = yield* stream.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)

      yield* source.publish({
        id: Event.Id.create(),
        created: Date.now(),
        type: Plugin.Event.Updated.type,
        data: {},
      })

      expect(Array.from(yield* Fiber.join(received))).toMatchObject([{type: Plugin.Event.Updated.type}])
    }),
  )

  it.effect('filters internal events before they consume subscriber capacity', () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        capacity: 1,
        encode: (event) => ({id: event.id, type: event.type, data: {}}),
      })
      const stream = yield* feed.subscribe()

      yield* source.publish(internal('one'))
      yield* source.publish(internal('two'))
      yield* source.publish(event('public'))

      expect(Array.from(yield* stream.pipe(Stream.take(1), Stream.runCollect))).toMatchObject([
        {type: Agent.Event.Updated.type},
      ])
    }),
  )

  it.effect('disconnects current subscribers after an encoding failure and continues for later subscribers', () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        encode: (event) => {
          if (event.id === Event.Id.make('evt_bad')) throw new Error('invalid event')
          return {id: event.id, type: event.type, data: {}}
        },
      })
      const current = yield* feed.subscribe()
      const failed = yield* current.pipe(Stream.runCollect, Effect.exit, Effect.forkScoped)

      yield* source.publish(event('bad'))
      const exit = yield* Fiber.join(failed)

      const next = yield* feed.subscribe()
      const received = yield* next.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
      yield* source.publish(event('good'))

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isSuccess(exit)) return
      expect(Option.getOrUndefined(Exit.findErrorOption(exit))).toMatchObject({_tag: 'EventFeed.EncodingError'})
      expect(Array.from(yield* Fiber.join(received))).toMatchObject([{id: 'evt_good'}])
    }),
  )
})
