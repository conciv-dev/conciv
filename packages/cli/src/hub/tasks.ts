import {z} from 'zod'
import {ascending} from '@conciv/plugin/schema/identifier'
import {Clock, Effect, Fiber, FiberMap, Option, Ref} from 'effect'
import {cappedText, type CodeReply} from '@conciv/contract'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {GoneQueue, OutsideQueues, PolledQueue, QueueHandle, WaitedResult} from './page.js'

export const TASK_POLL_MS = 1000

const TASK_TTL_MS = 60 * 60_000

const UNKNOWN_TASK = -32602

const TaskIdSchema = z.string().startsWith('tsk_').brand<'Task.ID'>()

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

export type QueuesState = {tasks: QueueTask[]}

export type QueuesEvent =
  | {type: 'delivered'; queueIds: string[]}
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
  if (event.type === 'delivered') return delivered(state, event.queueIds)
  if (event.type === 'created') return {tasks: [...state.tasks, event.task]}
  if (event.type === 'expired') {
    return {tasks: state.tasks.filter((task) => Date.parse(task.createdAt) >= event.now - TASK_TTL_MS)}
  }
  return {tasks: state.tasks.map((task) => (task.taskId === event.taskId ? polled(task, event) : task))}
}

function delivered(state: QueuesState, queueIds: string[]): QueuesState {
  return {
    tasks: state.tasks.flatMap((task): QueueTask[] => {
      if (task.status === 'settled') return [task]
      const pending = task.queued.filter((handle) => !queueIds.includes(handle.queueId))
      return pending.length === 0 ? [] : [{...task, queued: pending}]
    }),
  }
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
  settled: readonly (WaitedResult | GoneQueue)[],
  lastUpdatedAt: string,
): TaskAnswer {
  const notices = settled.map((state): TextPart =>
    state.status === 'gone' ? goneNotice(state) : {type: 'text', text: cappedText(state.notice)},
  )
  if (settled.every((state) => state.status !== 'gone')) {
    const result = {...reply, content: [...reply.content, ...notices]}
    return {resultType: 'complete', ...stamped, status: 'completed', lastUpdatedAt, result}
  }
  const statusMessage = notices.map((notice) => notice.text).join('\n\n')
  return {resultType: 'complete', ...stamped, status: 'failed', lastUpdatedAt, statusMessage}
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
  const state = yield* Ref.make<QueuesState>({tasks: []})
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
    delivered: (outside: OutsideQueues) =>
      expire.pipe(
        Effect.andThen(dispatch({type: 'delivered', queueIds: outside.finished.map((each) => each.result.queueId)})),
      ),
    create: (tab: SessionId, queued: QueueHandle[], reply: CodeReply) =>
      Effect.gen(function* () {
        const taskId = TaskIdSchema.parse('tsk_' + ascending())
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
