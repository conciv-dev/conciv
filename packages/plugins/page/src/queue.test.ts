import {describe, expect} from 'vitest'
import {SessionId} from '@conciv/protocol/chat-types'
import {test} from '../test/clock-test.js'
import {fromPlay, type QueueStart, type RequestSettlement} from './queue.js'

describe('waiting on a queue', () => {
  test('a wait that ends because the queue finished leaves no timer running, so a stopped engine leaves nothing behind', async ({
    clock,
  }) => {
    const reply = Promise.withResolvers<RequestSettlement>()
    const queues = fromPlay({play: () => [reply.promise], journal: async () => {}, finished: () => {}})
    const sessionId = SessionId.parse('conciv_7d1c2f3a-0b4e-4c5d-8e9f-a0b1c2d3e4f5')
    const {queueId} = queues.start(sessionId, {
      agentId: 'agent',
      toolCallId: 'c1',
      action: {type: 'queue_async', actions: [{tool: 'page_click', selector: '#buy'}]} satisfies QueueStart['action'],
    })

    const waiting = queues.wait(sessionId, queueId, 60_000)
    reply.resolve({ok: true, result: {value: true, files: []}})

    await expect(waiting).resolves.toMatchObject({queueId})
    await clock.advanceTimersByTimeAsync(0)
    expect(clock.getTimerCount()).toBe(0)
  })
})
