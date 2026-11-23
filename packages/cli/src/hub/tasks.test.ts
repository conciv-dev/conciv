import {describe, expect, it} from 'vitest'
import type {CodeReply} from '@conciv/contract'
import {SessionId} from '@conciv/protocol/chat-types'
import type {PolledQueue, WaitedResult} from './page.js'
import {readTaskAnswer, transitionQueues, type QueueTask, type QueuesState} from './tasks.js'

describe('the hub turns queued page actions into MCP tasks', () => {
  const tab = SessionId.parse('conciv_shelf')
  const createdAt = '2026-11-23T10:00:00.000Z'
  const later = '2026-11-23T10:00:05.000Z'
  const reply: CodeReply = {content: [{type: 'text', text: '{"result":{"queueId":"q_water","actions":1},"logs":[]}'}]}
  const working: QueueTask = {
    status: 'working',
    taskId: 'task-water',
    tab,
    queued: [{queueId: 'q_water', actions: 1}],
    createdAt,
    lastUpdatedAt: createdAt,
    reply,
  }
  const notice = `queue q_water finished: 1 played, 0 failed\n{"queueId":"q_water"}`
  const finished: WaitedResult = {queueId: 'q_water', status: 'finished', outcomes: [], failed: 0, played: 1, notice}
  const empty: QueuesState = {tasks: []}
  const withTask = transitionQueues(empty, {type: 'created', task: working})

  it('answers working while a queue plays, then completed with its outcome on every later poll', () => {
    expect(readTaskAnswer(withTask, 'task-water')).toEqual({
      resultType: 'complete',
      taskId: 'task-water',
      createdAt,
      ttlMs: 3_600_000,
      status: 'working',
      lastUpdatedAt: createdAt,
      pollIntervalMs: 1000,
    })
    const playing: PolledQueue = {queueId: 'q_water', status: 'playing', done: 0, of: 1}
    expect(transitionQueues(withTask, {type: 'polled', taskId: 'task-water', polled: [playing], now: later})).toEqual(
      withTask,
    )
    const settled = transitionQueues(withTask, {type: 'polled', taskId: 'task-water', polled: [finished], now: later})
    expect(readTaskAnswer(settled, 'task-water')).toEqual({
      resultType: 'complete',
      taskId: 'task-water',
      createdAt,
      ttlMs: 3_600_000,
      status: 'completed',
      lastUpdatedAt: later,
      result: {
        content: [...reply.content, {type: 'text', text: notice}],
      },
    })
    expect(transitionQueues(settled, {type: 'polled', taskId: 'task-water', polled: [null], now: later})).toEqual(
      settled,
    )
  })

  it('fails a task whose queue the engine no longer has, naming the lost queue', () => {
    const gone = transitionQueues(withTask, {
      type: 'polled',
      taskId: 'task-water',
      polled: [{queueId: 'q_water', status: 'gone'}],
      now: later,
    })
    expect(readTaskAnswer(gone, 'task-water')).toEqual({
      resultType: 'complete',
      taskId: 'task-water',
      createdAt,
      ttlMs: 3_600_000,
      status: 'failed',
      lastUpdatedAt: later,
      statusMessage:
        'queue q_water was lost: the engine holding the tab no longer has it (it restarted), so its actions may have partly run',
    })
  })

  it('forgets a task an hour after it was created', () => {
    const hour = Date.parse(createdAt) + 3_600_000
    expect(transitionQueues(withTask, {type: 'expired', now: hour})).toEqual(withTask)
    expect(readTaskAnswer(transitionQueues(withTask, {type: 'expired', now: hour + 1}), 'task-water')).toBeNull()
  })

  it('drops a task once a later reply delivered every one of its queues', () => {
    const twoQueues = transitionQueues(empty, {
      type: 'created',
      task: {...working, queued: [...working.queued, {queueId: 'q_feed', actions: 2}]},
    })
    const halfDelivered = transitionQueues(twoQueues, {type: 'delivered', queueIds: ['q_water', 'q_other']})
    expect(halfDelivered).toEqual({tasks: [{...working, queued: [{queueId: 'q_feed', actions: 2}]}]})
    const delivered = transitionQueues(halfDelivered, {type: 'delivered', queueIds: ['q_feed']})
    expect(delivered).toEqual({tasks: []})
    expect(readTaskAnswer(delivered, 'task-water')).toBeNull()
  })
})
