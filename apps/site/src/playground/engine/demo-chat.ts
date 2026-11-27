import {EventPublisher, ORPCError} from '@orpc/server'
import {
  approvalRequestedEvent,
  approvalSettledEvent,
  ChatEventType,
  runLifecycleEvent,
  sessionRunEvent,
  type ChatEvent,
  type RunLifecycle,
} from '@conciv/types/chat-event-types'
import type {ChatMessage, ChatPart} from '@conciv/types/chat-message-types'
import type {PermissionReply} from '@conciv/types/chat-types'
import type {Ask, PageEdit, Reply, ToolReply, Turn} from '../script'
import type {Drive} from './demo-drive'
import type {Publish} from './demo-events'
import {aborted, type Pace} from './demo-time'

type Run = {
  readonly id: string
  readonly sessionId: string
  readonly startedAt: number
  readonly events: ChatEvent[]
  readonly changed: EventPublisher<{changed: undefined}>
  readonly stopped: AbortController
  done: boolean
}

type Sink = {
  readonly run: Run
  readonly messageId: string
  readonly parts: ChatPart[]
}

type Queued = {readonly turn: Turn; readonly finished: () => void}

type Pending = {
  readonly approvalId: string
  readonly sessionId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly input: unknown
  readonly runId: string
  readonly always: boolean
  readonly settle: (reply: PermissionReply) => void
}

export type ChatDeps = {
  readonly pace: Pace
  readonly drive: Drive
  readonly publish: Publish
  readonly editPage: (edit: PageEdit) => void
  readonly saveMessage: (sessionId: string, message: ChatMessage) => void
  readonly setRunning: (sessionId: string, running: boolean) => void
}

const NOT_APPROVED = 'the call was not approved'

const STOPPED = 'Tool execution interrupted'

const CODE_TOOL = 'execute_typescript'

const UNSCRIPTED: Turn = {
  prompt: '',
  replies: [
    {
      kind: 'text',
      text: 'This playground plays a fixed script, so it cannot answer that. Add conciv to your own app to ask anything.',
    },
  ],
}

function record(run: Run, event: ChatEvent): void {
  run.events.push(event)
  run.changed.publish('changed', undefined)
}

async function* follow(run: Run, signal: AbortSignal | undefined): AsyncGenerator<ChatEvent> {
  const changes = run.changed.subscribe('changed', {signal})
  let index = 0
  try {
    for (;;) {
      const event = run.events[index]
      if (event !== undefined) {
        index += 1
        yield event
        continue
      }
      if (run.done || signal?.aborted === true) return
      await changes.next()
    }
  } finally {
    await changes.return(undefined)
  }
}

function ended(run: Run): Promise<void> {
  if (run.done) return Promise.resolve()
  return new Promise((resolve) => {
    const stop = run.changed.subscribe('changed', () => {
      if (!run.done) return
      stop()
      resolve()
    })
  })
}

function stamp(): Record<string, unknown> {
  return {time: {start: Date.now()}}
}

export function createChat(deps: ChatDeps) {
  const runs = new Map<string, Run>()
  const lastRuns = new Map<string, RunLifecycle>()
  const pending: Pending[] = []
  const pushes = new Map<string, EventPublisher<{event: ChatEvent}>>()
  const queue: Queued[] = []
  const push = (sessionId: string): EventPublisher<{event: ChatEvent}> => {
    const found = pushes.get(sessionId) ?? new EventPublisher<{event: ChatEvent}>()
    pushes.set(sessionId, found)
    return found
  }
  const lifecycle = (run: Run, phase: RunLifecycle['phase']): ChatEvent => {
    const now = Date.now()
    const data: RunLifecycle = {
      runId: run.id,
      phase,
      startedAt: run.startedAt,
      finishedAt: phase === 'running' ? null : now,
      serverNow: now,
      error: null,
    }
    lastRuns.set(run.sessionId, data)
    return runLifecycleEvent.create(data)
  }
  const finish = (sink: Sink, phase: 'completed' | 'aborted'): void => {
    const {run} = sink
    record(run, lifecycle(run, phase))
    if (phase === 'completed')
      record(run, {type: ChatEventType.RUN_FINISHED, threadId: run.sessionId, runId: run.id, finishReason: 'stop'})
    const message: ChatMessage = {id: sink.messageId, role: 'assistant', parts: [...sink.parts]}
    deps.saveMessage(
      run.sessionId,
      phase === 'aborted' ? {...message, metadata: {tanstack: {stopReason: 'aborted'}}} : message,
    )
    run.done = true
    run.changed.publish('changed', undefined)
    deps.setRunning(run.sessionId, false)
  }
  const askUser = (sink: Sink, toolCallId: string, input: unknown, ask: Ask): Promise<PermissionReply> => {
    const {run} = sink
    const approvalId = `per_${crypto.randomUUID()}`
    const settled = Promise.withResolvers<PermissionReply>()
    const always = ask.always ?? false
    pending.push({
      approvalId,
      sessionId: run.sessionId,
      toolCallId,
      toolName: ask.title,
      input,
      runId: run.id,
      always,
      settle: settled.resolve,
    })
    push(run.sessionId).publish(
      'event',
      approvalRequestedEvent.create({approvalId, toolCallId, title: ask.title, input, permission: {always}}),
    )
    void deps.pace
      .beat(run.stopped.signal)
      .then(() => deps.drive.click('button', ask.answer, run.stopped.signal))
      .catch((error: unknown) => console.error('[playground] the scripted answer could not be clicked', error))
    const drop = (): void => {
      const index = pending.findIndex((card) => card.approvalId === approvalId)
      if (index >= 0) pending.splice(index, 1)
      push(run.sessionId).publish('event', approvalSettledEvent.create({approvalId}))
    }
    return Promise.race([settled.promise, aborted(run.stopped.signal).then((): PermissionReply => 'reject')]).finally(
      drop,
    )
  }
  const begin = (sink: Sink, toolCallId: string, name: string, input: unknown, parent?: string): ChatPart => {
    const metadata = {...stamp(), ...(parent === undefined ? {} : {parentToolCallId: parent})}
    const args = JSON.stringify(input)
    record(sink.run, {
      type: ChatEventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: name,
      parentMessageId: sink.messageId,
      metadata,
    })
    record(sink.run, {type: ChatEventType.TOOL_CALL_ARGS, toolCallId, delta: args})
    record(sink.run, {type: ChatEventType.TOOL_CALL_END, toolCallId})
    const part: ChatPart = {
      type: 'tool-call',
      id: toolCallId,
      name,
      arguments: args,
      input,
      state: 'input-complete',
      metadata,
    }
    sink.parts.push(part)
    return part
  }
  const end = (sink: Sink, toolCallId: string, content: string, outcome: 'complete' | 'error' | 'denied'): void => {
    const metadata =
      outcome === 'complete'
        ? undefined
        : {
            tanstack:
              outcome === 'denied' ? {state: 'output-error', toolResultOutcome: 'denied'} : {state: 'output-error'},
          }
    record(sink.run, {
      type: ChatEventType.TOOL_CALL_RESULT,
      messageId: sink.messageId,
      toolCallId,
      content,
      ...(metadata === undefined ? {} : {metadata}),
    })
    sink.parts.push(
      outcome === 'complete'
        ? {type: 'tool-result', toolCallId, content, state: 'complete'}
        : outcome === 'denied'
          ? {type: 'tool-result', toolCallId, content, state: 'error', outcome: 'denied'}
          : {type: 'tool-result', toolCallId, content, state: 'error'},
    )
  }
  const settle = async (sink: Sink, toolCallId: string, reply: ToolReply): Promise<'done' | 'denied'> => {
    const signal = sink.run.stopped.signal
    if (reply.ask !== undefined) {
      const decision = await askUser(sink, toolCallId, reply.input, reply.ask)
      if (decision === 'reject') return 'denied'
    }
    for (const event of reply.events ?? []) {
      await deps.pace.beat(signal)
      deps.publish(event.type, {...event.data})
    }
    await deps.pace.beat(signal)
    if (reply.page !== undefined) deps.editPage(reply.page)
    return 'done'
  }
  const direct = async (sink: Sink, reply: ToolReply): Promise<void> => {
    const toolCallId = `call_${crypto.randomUUID().replaceAll('-', '')}`
    begin(sink, toolCallId, reply.name, reply.input)
    const outcome = await settle(sink, toolCallId, reply)
    if (sink.run.stopped.signal.aborted) return
    if (outcome === 'denied') {
      end(sink, toolCallId, JSON.stringify({error: NOT_APPROVED}), 'denied')
      return
    }
    end(sink, toolCallId, JSON.stringify(reply.result), reply.failed === true ? 'error' : 'complete')
  }
  const code = async (sink: Sink, reply: ToolReply): Promise<void> => {
    const outerId = `call_${crypto.randomUUID().replaceAll('-', '')}`
    const childId = `call_${outerId}`
    const program = `return await external_${reply.name}(${JSON.stringify(reply.input)})`
    begin(sink, outerId, CODE_TOOL, {typescriptCode: program})
    await deps.pace.beat(sink.run.stopped.signal)
    begin(sink, childId, reply.name, reply.input, outerId)
    const outcome = await settle(sink, childId, reply)
    if (sink.run.stopped.signal.aborted) return
    if (outcome === 'denied') {
      end(sink, childId, JSON.stringify({error: NOT_APPROVED}), 'denied')
      end(sink, outerId, JSON.stringify({success: false, error: {message: NOT_APPROVED}}), 'denied')
      return
    }
    end(sink, childId, JSON.stringify(reply.result), 'complete')
    end(sink, outerId, JSON.stringify({success: true, result: reply.result}), 'complete')
  }
  const say = async (sink: Sink, text: string): Promise<void> => {
    const {run, messageId} = sink
    record(run, {type: ChatEventType.TEXT_MESSAGE_START, messageId, role: 'assistant'})
    for (const delta of deps.pace.chunks(text)) {
      await deps.pace.chunk(run.stopped.signal)
      if (run.stopped.signal.aborted) return
      record(run, {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId, delta})
    }
    record(run, {type: ChatEventType.TEXT_MESSAGE_END, messageId})
    sink.parts.push({type: 'text', content: text})
  }
  const think = (sink: Sink, text: string): void => {
    const {run} = sink
    const messageId = `${sink.messageId}-thinking-${sink.parts.length}`
    record(run, {type: ChatEventType.REASONING_START, messageId})
    record(run, {type: ChatEventType.REASONING_MESSAGE_START, messageId, role: 'reasoning'})
    record(run, {type: ChatEventType.REASONING_MESSAGE_CONTENT, messageId, delta: text})
    record(run, {type: ChatEventType.REASONING_MESSAGE_END, messageId})
    record(run, {type: ChatEventType.REASONING_END, messageId})
    sink.parts.push({type: 'thinking', content: text})
  }
  const playReply = (sink: Sink, reply: Reply): Promise<void> => {
    if (reply.kind === 'text') return say(sink, reply.text)
    if (reply.kind === 'thinking') return Promise.resolve(think(sink, reply.text))
    if (reply.mode === 'code') return code(sink, reply)
    return direct(sink, reply)
  }
  const stopOpenCalls = (sink: Sink): void => {
    const answered = sink.parts.flatMap((part) => (part.type === 'tool-result' ? [part.toolCallId] : []))
    sink.parts
      .flatMap((part) => (part.type === 'tool-call' && !answered.includes(part.id) ? [part] : []))
      .forEach((call) => end(sink, call.id, STOPPED, 'error'))
  }
  const playTurn = async (run: Run, turn: Turn): Promise<void> => {
    const sink: Sink = {run, messageId: `msg_${crypto.randomUUID()}`, parts: []}
    record(run, {type: ChatEventType.RUN_STARTED, threadId: run.sessionId, runId: run.id})
    record(run, lifecycle(run, 'running'))
    deps.setRunning(run.sessionId, true)
    for (const reply of turn.replies) {
      await deps.pace.beat(run.stopped.signal)
      if (run.stopped.signal.aborted) break
      await playReply(sink, reply).catch((error: unknown) => {
        console.error('[playground] a scripted reply failed', error)
        run.stopped.abort()
      })
    }
    if (run.stopped.signal.aborted) {
      stopOpenCalls(sink)
      finish(sink, 'aborted')
      return
    }
    finish(sink, 'completed')
  }
  const start = (sessionId: string, runId: string, prompt: string): Run => {
    const index = queue.findIndex((queued) => prompt.includes(queued.turn.prompt))
    const queued = index < 0 ? undefined : queue.splice(index, 1)[0]
    const run: Run = {
      id: runId,
      sessionId,
      startedAt: Date.now(),
      events: [],
      changed: new EventPublisher<{changed: undefined}>(),
      stopped: new AbortController(),
      done: false,
    }
    runs.set(runId, run)
    void playTurn(run, queued?.turn ?? UNSCRIPTED)
      .finally(() => queued?.finished())
      .catch((error: unknown) => console.error('[playground] the scripted turn failed', error))
    push(sessionId).publish('event', sessionRunEvent.create({runId}))
    return run
  }
  const active = (sessionId: string): Run | undefined =>
    [...runs.values()].find((run) => run.sessionId === sessionId && !run.done)
  return {
    script: (turns: readonly Turn[]): readonly Promise<void>[] =>
      turns.map((turn) => {
        const finished = Promise.withResolvers<void>()
        queue.push({turn, finished: finished.resolve})
        return finished.promise
      }),
    idle: async (sessionId: string): Promise<void> => {
      const running = active(sessionId)
      if (running !== undefined) await ended(running)
    },
    events: (sessionId: string, signal: AbortSignal | undefined) => push(sessionId).subscribe('event', {signal}),
    send: (sessionId: string, runId: string, prompt: string, signal: AbortSignal | undefined) =>
      follow(start(sessionId, runId, prompt), signal),
    join: (runId: string, signal: AbortSignal | undefined) => follow(runs.get(runId) ?? emptyRun(runId), signal),
    hydrateRun: (sessionId: string) => {
      const running = active(sessionId)
      return {
        activeRun: running === undefined ? null : {runId: running.id},
        lastRun: lastRuns.get(sessionId) ?? null,
        pendingApprovals: pending
          .filter((card) => card.sessionId === sessionId)
          .map((card) => ({
            approvalId: card.approvalId,
            toolCallId: card.toolCallId,
            toolName: card.toolName,
            input: card.input,
            runId: card.runId,
            permission: {always: card.always},
          })),
        interrupts: null,
      }
    },
    stop: async (runIds: readonly string[]) => {
      const stopping = runIds.flatMap((runId) => {
        const run = runs.get(runId)
        return run === undefined ? [] : [run]
      })
      stopping.forEach((run) => run.stopped.abort())
      await Promise.all(stopping.map(ended))
      return {ok: true as const}
    },
    decide: (approvalId: string, reply: PermissionReply) => {
      const card = pending.find((found) => found.approvalId === approvalId)
      if (card === undefined) throw new ORPCError('UNKNOWN_REQUEST', {message: 'no pending approval'})
      card.settle(reply)
      return {ok: true as const}
    },
    dispose: () => [...runs.values()].forEach((run) => run.stopped.abort()),
  }
}

function emptyRun(runId: string): Run {
  return {
    id: runId,
    sessionId: '',
    startedAt: 0,
    events: [],
    changed: new EventPublisher<{changed: undefined}>(),
    stopped: new AbortController(),
    done: true,
  }
}
