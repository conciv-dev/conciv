import {describe, expect, it} from 'vitest'
import type {CodeReply} from '@conciv/contract'
import {SessionId} from '@conciv/protocol/chat-types'
import type {PolledQueue, WaitedResult} from './page.js'
import {
  readTaskAnswer,
  transitionQueues,
  type QueueTask,
  type QueuesEvent,
  type QueuesState,
  type TaskAnswer,
} from './tasks.js'

describe('the hub turns queued page actions into MCP tasks', () => {
  it('answers working while a queue plays then completed with its outcome on every later poll, fails a task whose queue the engine no longer has naming the lost queue, forgets a task an hour after it was created, and drops a task once a later reply delivered every one of its queues', () => {
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
    const playing: PolledQueue = {queueId: 'q_water', status: 'playing', done: 0, of: 1}
    const hour = Date.parse(createdAt) + 3_600_000
    const empty: QueuesState = {tasks: []}
    const withTask: QueuesState = {tasks: [working]}
    const completed: TaskAnswer = {
      resultType: 'complete',
      taskId: 'task-water',
      createdAt,
      ttlMs: 3_600_000,
      status: 'completed',
      lastUpdatedAt: later,
      result: {content: [...reply.content, {type: 'text', text: notice}]},
    }
    const lost: TaskAnswer = {
      resultType: 'complete',
      taskId: 'task-water',
      createdAt,
      ttlMs: 3_600_000,
      status: 'failed',
      lastUpdatedAt: later,
      statusMessage:
        'queue q_water was lost: the engine holding the tab no longer has it (it restarted), so its actions may have partly run',
    }
    const settled: QueuesState = {tasks: [{status: 'settled', taskId: 'task-water', createdAt, answer: completed}]}
    const gone: QueuesState = {tasks: [{status: 'settled', taskId: 'task-water', createdAt, answer: lost}]}
    const twoQueues: QueuesState = {tasks: [{...working, queued: [...working.queued, {queueId: 'q_feed', actions: 2}]}]}
    const halfDelivered: QueuesState = {tasks: [{...working, queued: [{queueId: 'q_feed', actions: 2}]}]}
    const rows: [string, QueuesState, QueuesEvent, QueuesState][] = [
      ['creates a task', empty, {type: 'created', task: working}, withTask],
      [
        'keeps working while the queue plays',
        withTask,
        {type: 'polled', taskId: 'task-water', polled: [playing], now: later},
        withTask,
      ],
      [
        'completes once the queue finished',
        withTask,
        {type: 'polled', taskId: 'task-water', polled: [finished], now: later},
        settled,
      ],
      [
        'keeps the completed answer on a later poll',
        settled,
        {type: 'polled', taskId: 'task-water', polled: [null], now: later},
        settled,
      ],
      [
        'fails once the engine no longer has the queue',
        withTask,
        {type: 'polled', taskId: 'task-water', polled: [{queueId: 'q_water', status: 'gone'}], now: later},
        gone,
      ],
      ['keeps a task up to an hour old', withTask, {type: 'expired', now: hour}, withTask],
      ['forgets a task older than an hour', withTask, {type: 'expired', now: hour + 1}, empty],
      [
        'creates a task with two queues',
        empty,
        {type: 'created', task: {...working, queued: [...working.queued, {queueId: 'q_feed', actions: 2}]}},
        twoQueues,
      ],
      [
        'keeps the queue not yet delivered',
        twoQueues,
        {type: 'delivered', queueIds: ['q_water', 'q_other']},
        halfDelivered,
      ],
      [
        'drops the task once every queue was delivered',
        halfDelivered,
        {type: 'delivered', queueIds: ['q_feed']},
        empty,
      ],
    ]
    const answers: [string, QueuesState, TaskAnswer | null][] = [
      [
        'working',
        withTask,
        {
          resultType: 'complete',
          taskId: 'task-water',
          createdAt,
          ttlMs: 3_600_000,
          status: 'working',
          lastUpdatedAt: createdAt,
          pollIntervalMs: 1000,
        },
      ],
      ['completed', settled, completed],
      ['failed', gone, lost],
      ['forgotten or delivered', empty, null],
    ]

    for (const [step, from, event, expected] of rows) expect(transitionQueues(from, event), step).toEqual(expected)
    for (const [step, state, expected] of answers) expect(readTaskAnswer(state, 'task-water'), step).toEqual(expected)
  })
})
