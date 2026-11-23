import {randomUUID} from 'node:crypto'
import {Clock, Effect, Fiber, FiberMap, Option, Ref} from 'effect'
import {cappedText, type CodeReply} from '@conciv/contract'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {GoneQueue, OutsideQueues, PolledQueue, QueueHandle, QueueResult} from './page.js'

export const TASK_POLL_MS = 1000

const TASK_TTL_MS = 60 * 60_000

const UNKNOWN_TASK = -32602

export type TaskAnswer = Record<string, unknown>

export type QueueTask =
  | {
      status: 'working'
      taskId: string
      tab: SessionId
      queued: QueueHandle[]
      createdAt: string
      lastUpdatedAt: string
      reply: CodeReply
    }
  | {status: 'settled'; taskId: string; createdAt: string; answer: TaskAnswer}

export type OwedCall = {tab: SessionId; toolCallIds: string[]; queueIds: string[]}

export type QueuesState = {tasks: QueueTask[]; owed: OwedCall[]}

export type QueuesEvent =
  | {type: 'replied'; tab: SessionId; toolCallIds: string[]; outside: OutsideQueues}
  | {type: 'created'; task: Extract<QueueTask, {status: 'working'}>}
  | {type: 'polled'; taskId: string; polled: (PolledQueue | null)[]; now: string}
  | {type: 'expired'; now: number}

export type TaskReply = {
  content: CodeReply['content']
  resultType: 'task'
  taskId: string
  status: 'working'
  createdAt: string
  lastUpdatedAt: string
  ttlMs: number
  pollIntervalMs: number
}

type TextPart = {type: 'text'; text: string}

export function transitionQueues(state: QueuesState, event: QueuesEvent): QueuesState {
  if (event.type === 'replied') return replied(state, event)
  if (event.type === 'created') return {...state, tasks: [...state.tasks, event.task]}
  if (event.type === 'expired') {
    return {...state, tasks: state.tasks.filter((task) => Date.parse(task.createdAt) >= event.now - TASK_TTL_MS)}
  }
  return {...state, tasks: state.tasks.map((task) => (task.taskId === event.taskId ? polled(task, event) : task))}
}

function replied(state: QueuesState, event: Extract<QueuesEvent, {type: 'replied'}>): QueuesState {
  const queued = event.outside.queued.map((handle) => handle.queueId)
  const delivered = event.outside.finished.map((finished) => finished.result.queueId)
  const own = readOwnQueued(state, event.tab, event.outside.queued).map((handle) => handle.queueId)
  const kept = state.owed.flatMap((call) => {
    if (call.tab !== event.tab) return [call]
    const queueIds = call.queueIds.filter((queueId) => queued.includes(queueId))
    return queueIds.length === 0 ? [] : [{...call, queueIds}]
  })
  const tasks = state.tasks.flatMap((task): QueueTask[] => {
    if (task.status === 'settled') return [task]
    const pending = task.queued.filter((handle) => !delivered.includes(handle.queueId))
    return pending.length === 0 ? [] : [{...task, queued: pending}]
  })
  const owed = own.length === 0 ? kept : [...kept, {tab: event.tab, toolCallIds: event.toolCallIds, queueIds: own}]
  return {tasks, owed}
}

function polled(task: QueueTask, event: Extract<QueuesEvent, {type: 'polled'}>): QueueTask {
  if (task.status === 'settled') return task
  const pending = task.queued.map((handle) => handle.queueId)
  const settled = event.polled.flatMap((state) =>
    state === null || state.status === 'playing' || !pending.includes(state.queueId) ? [] : [state],
  )
  if (settled.length < task.queued.length) return task
  const stamped = {taskId: task.taskId, createdAt: task.createdAt, ttlMs: TASK_TTL_MS}
  return {
    status: 'settled',
    taskId: task.taskId,
    createdAt: task.createdAt,
    answer: settledAnswer(stamped, task.reply, settled, event.now),
  }
}

export function readOwedToolCalls(state: QueuesState, tab: SessionId): string[] {
  return state.owed.flatMap((call) => (call.tab === tab ? call.toolCallIds : []))
}

export function readOwnQueued(state: QueuesState, tab: SessionId, queued: QueueHandle[]): QueueHandle[] {
  const owed = state.owed.flatMap((call) => (call.tab === tab ? call.queueIds : []))
  return queued.filter((handle) => !owed.includes(handle.queueId))
}

export function readTaskAnswer(state: QueuesState, taskId: string): TaskAnswer | null {
  const task = state.tasks.find((each) => each.taskId === taskId)
  if (task === undefined) return null
  if (task.status === 'settled') return task.answer
  return {
    resultType: 'complete',
    taskId,
    createdAt: task.createdAt,
    ttlMs: TASK_TTL_MS,
    status: 'working',
    lastUpdatedAt: task.lastUpdatedAt,
    pollIntervalMs: TASK_POLL_MS,
  }
}

function settledAnswer(
  stamped: {taskId: string; createdAt: string; ttlMs: number},
  reply: CodeReply,
  settled: readonly (QueueResult | GoneQueue)[],
  lastUpdatedAt: string,
): TaskAnswer {
  const notices = settled.map((state) => (state.status === 'gone' ? goneNotice(state) : queueNoticePart(state)))
  if (settled.every((state) => state.status !== 'gone')) {
    const result = {...reply, content: [...reply.content, ...notices]}
    return {resultType: 'complete', ...stamped, status: 'completed', lastUpdatedAt, result}
  }
  const statusMessage = notices.map((notice) => notice.text).join('\n\n')
  return {resultType: 'complete', ...stamped, status: 'failed', lastUpdatedAt, statusMessage}
}

function queueNoticePart(result: QueueResult): TextPart {
  return {
    type: 'text',
    text: cappedText(
      `queue ${result.queueId} ${result.status}: ${result.played} played, ${result.failed} failed\n${JSON.stringify(result)}`,
    ),
  }
}

function goneNotice(gone: GoneQueue): TextPart {
  return {
    type: 'text',
    text: `queue ${gone.queueId} was lost: the engine holding the tab no longer has it (it restarted), so its actions may have partly run`,
  }
}

export const makeQueues = Effect.fn('Queues.make')(function* (
  poll: (tab: SessionId, queueId: string) => Effect.Effect<PolledQueue | null>,
) {
  const state = yield* Ref.make<QueuesState>({tasks: [], owed: []})
  const polls = yield* FiberMap.make<string, TaskAnswer, Error>()
  const dispatch = (event: QueuesEvent) => Ref.update(state, (current) => transitionQueues(current, event))
  const expire = Clock.currentTimeMillis.pipe(Effect.flatMap((now) => dispatch({type: 'expired', now})))
  const known = (taskId: string) =>
    expire.pipe(
      Effect.andThen(Ref.get(state)),
      Effect.flatMap((current) => {
        const answer = readTaskAnswer(current, taskId)
        if (answer !== null) return Effect.succeed({answer, task: current.tasks.find((task) => task.taskId === taskId)})
        return Effect.fail(Object.assign(new Error(`no queue task ${taskId}`), {code: UNKNOWN_TASK}))
      }),
    )
  const pollTask = (taskId: string) =>
    Effect.gen(function* () {
      const first = yield* known(taskId)
      if (first.task === undefined || first.task.status === 'settled') return first.answer
      const {tab, queued} = first.task
      const polledQueues = yield* Effect.forEach(queued, (handle) => poll(tab, handle.queueId), {
        concurrency: 'unbounded',
      })
      yield* known(taskId)
      const now = new Date(yield* Clock.currentTimeMillis).toISOString()
      yield* dispatch({type: 'polled', taskId, polled: polledQueues, now})
      return (yield* known(taskId)).answer
    })
  return {
    owedToolCalls: (tab: SessionId) => Ref.get(state).pipe(Effect.map((current) => readOwedToolCalls(current, tab))),
    replied: (tab: SessionId, toolCallIds: string[], outside: OutsideQueues) =>
      expire.pipe(
        Effect.andThen(
          Ref.modify(state, (current): [QueueHandle[], QueuesState] => [
            readOwnQueued(current, tab, outside.queued),
            transitionQueues(current, {type: 'replied', tab, toolCallIds, outside}),
          ]),
        ),
      ),
    create: (tab: SessionId, queued: QueueHandle[], reply: CodeReply) =>
      Effect.gen(function* () {
        const taskId = randomUUID()
        const now = new Date(yield* Clock.currentTimeMillis).toISOString()
        yield* dispatch({
          type: 'created',
          task: {status: 'working', taskId, tab, queued, createdAt: now, lastUpdatedAt: now, reply},
        })
        const created: TaskReply = {
          content: [],
          resultType: 'task',
          taskId,
          status: 'working',
          createdAt: now,
          lastUpdatedAt: now,
          ttlMs: TASK_TTL_MS,
          pollIntervalMs: TASK_POLL_MS,
        }
        return created
      }),
    get: (taskId: string) =>
      FiberMap.get(polls, taskId).pipe(
        Effect.flatMap((running) =>
          Option.isSome(running) ? Effect.succeed(running.value) : FiberMap.run(polls, taskId, pollTask(taskId)),
        ),
        Effect.flatMap(Fiber.join),
      ),
  }
})

export type Queues = Effect.Success<ReturnType<typeof makeQueues>>
