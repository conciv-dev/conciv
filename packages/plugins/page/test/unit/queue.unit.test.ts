import {Deferred, Effect, Fiber} from 'effect'
import {describe, expect} from 'vitest'
import {SessionId} from '@conciv/types/chat-types'
import {test} from '../utils/clock-test.js'
import {makeQueues, type QueueStart, type RequestSettlement} from '../../src/queue.js'

describe('waiting on a queue', () => {
  test('a wait that ends because the queue finished leaves no timer running, so a stopped engine leaves nothing behind', async ({
    clock,
  }) => {
    const sessionId = SessionId.parse('ses_7d1c2f3a-0b4e-4c5d-8e9f-a0b1c2d3e4f5')
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const reply = yield* Deferred.make<RequestSettlement>()
          const queues = yield* makeQueues({
            play: () => Effect.succeed([reply]),
            journal: () => Effect.void,
            finished: () => Effect.void,
          })
          const {queueId} = yield* queues.start(sessionId, {
            agentId: 'agent',
            toolCallId: 'c1',
            origin: 'chat',
            action: {
              type: 'queue_async',
              actions: [{tool: 'page_click', selector: '#buy'}],
            } satisfies QueueStart['action'],
          })

          const waiting = yield* Effect.forkChild(queues.wait(sessionId, queueId, 60_000))
          yield* Deferred.succeed(reply, {ok: true, result: {value: true, files: []}})

          expect(yield* Fiber.join(waiting)).toMatchObject({queueId})
          yield* Effect.promise(() => clock.advanceTimersByTimeAsync(0))
          expect(clock.getTimerCount()).toBe(0)
        }),
      ),
    )
  })
})
