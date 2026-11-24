import {describe, expect, it} from '@effect/vitest'
import {Effect, Stream} from 'effect'
import {test} from '../test/engine.js'
import type {Bus} from '@conciv/plugin-host'
import {Event} from '@conciv/plugin/schema/event'
import {make} from './event-feed.js'

describe('event feed', () => {
  test('a subscriber hears the heartbeat while nothing else happens', async ({createEngine}) => {
    const engine = await createEngine({}, {timeouts: {eventHeartbeatIntervalMs: 20}})
    const heartbeat = await engine.event('server.heartbeat')

    await expect(heartbeat.arrived).resolves.toMatchObject({type: 'server.heartbeat'})
  })

  it.effect('a subscriber that falls a full queue behind is ended with an overflow', () =>
    Effect.gen(function* () {
      const heard: Bus.Subscriber[] = []
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

      expect(yield* Effect.flip(Stream.runCollect(stream))).toMatchObject({
        _tag: 'EventFeed.SubscriberOverflow',
        capacity: 2,
      })
    }),
  )
})
