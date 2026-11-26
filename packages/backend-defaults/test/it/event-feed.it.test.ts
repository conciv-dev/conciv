import {Effect, Stream} from 'effect'
import {describe, expect, test} from 'vitest'
import type {Bus} from '@conciv/backend-app-api'
import * as Event from '@conciv/protocol/schema/event'
import {makeMaker} from '@conciv/protocol/schema/identifier'
import {make} from '../../src/engine/event-feed.js'

describe('event feed', () => {
  test('a subscriber that falls a full queue behind is ended with an overflow', async () => {
    const heard: Bus.Subscriber[] = []
    const ids = makeMaker()
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
            Effect.forEach([1, 2, 3], () =>
              publish({id: Event.Id.create(ids), type: 'rpc.tick', created: 0, data: {}}),
            ),
          )
          return yield* Effect.flip(Stream.runCollect(stream))
        }),
      ),
    )

    expect(overflow).toMatchObject({_tag: 'EventFeed.SubscriberOverflow', capacity: 2})
  })
})
