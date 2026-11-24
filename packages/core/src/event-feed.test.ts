import {Effect, Stream} from 'effect'
import {describe, expect} from 'vitest'
import {test} from './testing.js'
import type {Bus} from '@conciv/plugin-host'
import {Event} from '@conciv/plugin/schema/event'
import {make} from './event-feed.js'

describe('event feed', () => {
  test('a subscriber hears the heartbeat while nothing else happens', async ({createEngine}) => {
    const engine = await createEngine({}, {timeouts: {eventHeartbeatIntervalMs: 20}})
    const heartbeat = await engine.event('server.heartbeat')

    await expect(heartbeat.arrived).resolves.toMatchObject({type: 'server.heartbeat'})
  })

  test('a subscriber that falls a full queue behind is ended with an overflow', async () => {
    const heard: Bus.Subscriber[] = []
    const overflow = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const feed = yield* make(
            (subscriber) =>
              Effect.sync(() => {
                heard.push(subscriber)
                return Effect.void
              }),
            {capacity: 2, encode: (event) => ({id: event.id, type: event.type, data: {}})},
          )
          const stream = yield* feed.subscribe()
          yield* Effect.forEach(heard, (publish) =>
            Effect.forEach([1, 2, 3], () => publish({id: Event.Id.create(), type: 'rpc.tick', created: 0, data: {}})),
          )
          return yield* Effect.flip(Stream.runCollect(stream))
        }),
      ),
    )

    expect(overflow).toMatchObject({_tag: 'EventFeed.SubscriberOverflow', capacity: 2})
  })
})
