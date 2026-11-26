import {ORPCError} from '@orpc/client'
import {Plugin, Slot} from '@conciv/frontend-plugin-api'
import {createFakeEngine, type FakeEngine, type FakeEngineHandlers} from '@conciv/client/testing'
import type {ChatHydration, MarkerRow} from '@conciv/protocol'
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
import type {UiAnswerValue} from '@conciv/types/ui-types'
import type {UsageSnapshot} from '@conciv/types/usage-types'
import {shellEngine, type ShellPlugin} from './mount-shell.js'

export const PANE_SESSION = 'ses_pane'

const INTERRUPTED = 'Tool execution interrupted'

const STOPPED_METADATA = {tanstack: {stopReason: 'aborted'}}

type Promisable<T> = T | Promise<T>

export type PaneOutcome = {readonly failed: string; readonly code?: string}

export type PaneAsk = {readonly title: string; readonly always: boolean}

export type PaneRun = {
  readonly say: (text: string) => void
  readonly think: (text: string) => void
  readonly call: (id: string, name: string, input: unknown, parent?: string) => void
  readonly result: (id: string, value: unknown, outcome?: 'error' | 'denied') => void
  readonly ask: (ask: PaneAsk) => Promise<PermissionReply>
  readonly answer: (toolCallId: string) => Promise<UiAnswerValue>
  readonly hold: () => Promise<void>
  readonly open: (id: string, file: string, line: number) => void
}

export type PaneTurn = (run: PaneRun) => Promisable<PaneOutcome | void>

export type PaneEngineOptions = {
  readonly messages?: readonly ChatMessage[]
  readonly usage?: UsageSnapshot
  readonly compaction?: () => Promise<string>
  readonly plugin?: FakeEngineHandlers['plugin']
}

export type PaneEngine = {
  readonly engine: FakeEngine
  readonly turns: (...turns: PaneTurn[]) => void
  readonly send: (text: string, turn: PaneTurn) => Promise<void>
  readonly notice: (message: ChatMessage, turn?: PaneTurn) => Promise<void>
  readonly ask: (ask: PaneAsk) => Promise<PermissionReply>
  readonly approve: () => void
  readonly answers: () => readonly UiAnswerValue[]
  readonly opened: () => readonly {readonly file: string; readonly line: number}[]
}

type Pending = {
  readonly approvalId: string
  readonly title: string
  readonly always: boolean
  readonly runId: string | null
  readonly settle: (reply: PermissionReply) => void
}

type Run = {
  readonly id: string
  readonly startedAt: number
  readonly events: ChatEvent[]
  readonly stopped: AbortController
  readonly wake: Set<() => void>
  done: boolean
}

function pushChannel() {
  const readers = new Set<{queue: ChatEvent[]; wake: () => void}>()
  return {
    push: (event: ChatEvent) =>
      readers.forEach((reader) => {
        reader.queue.push(event)
        reader.wake()
      }),
    read: async function* (signal: AbortSignal | undefined): AsyncGenerator<ChatEvent> {
      const reader: {queue: ChatEvent[]; wake: () => void} = {queue: [], wake: () => undefined}
      readers.add(reader)
      const stop = (): void => reader.wake()
      signal?.addEventListener('abort', stop, {once: true})
      try {
        for (;;) {
          if (signal?.aborted === true) return
          const next = reader.queue.shift()
          if (next !== undefined) {
            yield next
            continue
          }
          await new Promise<void>((resolve) => {
            reader.wake = resolve
          })
        }
      } finally {
        readers.delete(reader)
      }
    },
  }
}

function lifecycle(run: Run, phase: RunLifecycle['phase'], error: string | null): RunLifecycle {
  const now = Date.now()
  return {
    runId: run.id,
    phase,
    startedAt: run.startedAt,
    finishedAt: phase === 'running' ? null : now,
    serverNow: now,
    error,
  }
}

function savedToDisk(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function unansweredCalls(parts: readonly ChatPart[], children: boolean): string[] {
  const answered = parts.flatMap((part) => (part.type === 'tool-result' ? [part.toolCallId] : []))
  return parts.flatMap((part) =>
    part.type === 'tool-call' && !answered.includes(part.id) && childCall(part.metadata) === children ? [part.id] : [],
  )
}

function childCall(metadata: unknown): boolean {
  return typeof metadata === 'object' && metadata !== null && 'parentToolCallId' in metadata
}

function stoppedError(): Error {
  return new Error('the run was stopped')
}

function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(stoppedError())
    signal.addEventListener('abort', () => reject(stoppedError()), {once: true})
  })
}

async function* follow(run: Run, signal: AbortSignal | undefined): AsyncGenerator<ChatEvent> {
  let index = 0
  for (;;) {
    const event = run.events[index]
    if (event !== undefined) {
      index += 1
      yield event
      continue
    }
    if (run.done || signal?.aborted === true) return
    await new Promise<void>((resolve) => {
      run.wake.add(resolve)
      signal?.addEventListener('abort', () => resolve(), {once: true})
    })
  }
}

async function* noEvents(): AsyncGenerator<ChatEvent> {}

function serialized(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function interrupted(parts: readonly ChatPart[]): ChatPart[] {
  const open = unansweredCalls(parts, false)
  return parts.flatMap((part): ChatPart[] =>
    part.type === 'tool-call' && open.includes(part.id)
      ? [part, {type: 'tool-result', toolCallId: part.id, content: INTERRUPTED, state: 'error', error: INTERRUPTED}]
      : [part],
  )
}

async function runEnded(run: Run): Promise<void> {
  while (!run.done) await new Promise<void>((resolve) => run.wake.add(resolve))
}

function userMessage(text: string): ChatMessage {
  return {id: `msg_${crypto.randomUUID()}`, role: 'user', parts: [{type: 'text', content: text}]}
}

function historyWindow(
  history: readonly ChatMessage[],
  input: {limit?: number | undefined; before?: string | undefined},
): Pick<ChatHydration, 'messages' | 'page'> {
  const end = input.before === undefined ? history.length : history.findIndex((message) => message.id === input.before)
  const start = input.limit === undefined ? 0 : Math.max(end - input.limit, 0)
  const messages = history.slice(start, end)
  const first = messages[0]
  if (input.limit === undefined) return {messages}
  if (start === 0 || first === undefined) return {messages, page: {truncated: false}}
  return {messages, page: {truncated: true, cursor: first.id}}
}

export function paneEngine(options: PaneEngineOptions = {}): PaneEngine {
  const history: ChatMessage[] = [...(options.messages ?? [])]
  const script: PaneTurn[] = []
  const runs = new Map<string, Run>()
  const pending: Pending[] = []
  const answers: UiAnswerValue[] = []
  const opened: {file: string; line: number}[] = []
  const waitingAnswers = new Map<string, (value: UiAnswerValue) => void>()
  const session = pushChannel()
  const last: {run: RunLifecycle | null} = {run: null}
  const markers: MarkerRow[] = []

  const wake = (run: Run): void => {
    const waiting = [...run.wake]
    run.wake.clear()
    waiting.forEach((resolve) => resolve())
  }
  const record = (run: Run, event: ChatEvent): void => {
    run.events.push(event)
    wake(run)
  }

  const openAsk = (ask: PaneAsk, runId: string | null, signal: AbortSignal | undefined): Promise<PermissionReply> => {
    const approvalId = `per_${crypto.randomUUID()}`
    const settled = Promise.withResolvers<PermissionReply>()
    const drop = (): void => {
      const index = pending.findIndex((card) => card.approvalId === approvalId)
      if (index >= 0) pending.splice(index, 1)
      session.push(approvalSettledEvent.create({approvalId}))
    }
    pending.push({...ask, approvalId, runId, settle: settled.resolve})
    session.push(
      approvalRequestedEvent.create({
        approvalId,
        toolCallId: approvalId,
        title: ask.title,
        input: {},
        permission: {always: ask.always},
      }),
    )
    const answered = settled.promise.then((reply) => {
      drop()
      return reply
    })
    if (signal === undefined) return answered
    return Promise.race([
      answered,
      untilAborted(signal).catch((error: unknown) => {
        drop()
        throw error
      }),
    ])
  }

  const play = async (run: Run, turn: PaneTurn, messageId: string): Promise<void> => {
    const parts: ChatPart[] = []
    const startedAt = new Map<string, number>()
    const text: {open: boolean} = {open: false}
    const signal = run.stopped.signal
    const closeText = (): void => {
      if (!text.open) return
      text.open = false
      record(run, {type: ChatEventType.TEXT_MESSAGE_END, messageId})
    }
    const paneRun: PaneRun = {
      say: (content) => {
        if (!text.open) record(run, {type: ChatEventType.TEXT_MESSAGE_START, messageId, role: 'assistant'})
        text.open = true
        record(run, {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId, delta: content})
        const previous = parts.at(-1)
        if (previous?.type === 'text') parts.splice(-1, 1, {...previous, content: previous.content + content})
        else parts.push({type: 'text', content})
      },
      think: (content) => {
        closeText()
        const thinkingId = `${messageId}-thinking-${parts.length}`
        record(run, {type: ChatEventType.REASONING_START, messageId: thinkingId})
        record(run, {type: ChatEventType.REASONING_MESSAGE_START, messageId: thinkingId, role: 'reasoning'})
        record(run, {type: ChatEventType.REASONING_MESSAGE_CONTENT, messageId: thinkingId, delta: content})
        record(run, {type: ChatEventType.REASONING_MESSAGE_END, messageId: thinkingId})
        record(run, {type: ChatEventType.REASONING_END, messageId: thinkingId})
        parts.push({type: 'thinking', content})
      },
      call: (id, name, input, parent) => {
        closeText()
        const start = Date.now()
        startedAt.set(id, start)
        const metadata = {metadata: parent === undefined ? {time: {start}} : {parentToolCallId: parent, time: {start}}}
        record(run, {
          type: ChatEventType.TOOL_CALL_START,
          toolCallId: id,
          toolCallName: name,
          parentMessageId: messageId,
          ...metadata,
        })
        record(run, {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: id, delta: JSON.stringify(input)})
        record(run, {type: ChatEventType.TOOL_CALL_END, toolCallId: id})
        parts.push({
          type: 'tool-call',
          id,
          name,
          arguments: JSON.stringify(input),
          input,
          state: 'input-complete',
          ...metadata,
        })
      },
      result: (id, value, outcome) => {
        const content = serialized(value)
        const time = {start: startedAt.get(id) ?? Date.now(), end: Date.now()}
        const tanstack =
          outcome === undefined
            ? {}
            : {
                tanstack:
                  outcome === 'denied' ? {state: 'output-error', toolResultOutcome: 'denied'} : {state: 'output-error'},
              }
        record(run, {
          type: ChatEventType.TOOL_CALL_RESULT,
          messageId,
          toolCallId: id,
          content,
          metadata: {time, ...tanstack},
        })
        parts.push({
          type: 'tool-result',
          toolCallId: id,
          content,
          state: outcome === undefined ? 'complete' : 'error',
          ...(outcome === 'denied' ? {outcome: 'denied'} : {}),
        })
      },
      ask: (ask) => openAsk(ask, run.id, signal),
      answer: (toolCallId) => {
        const answered = Promise.withResolvers<UiAnswerValue>()
        waitingAnswers.set(toolCallId, answered.resolve)
        return Promise.race([answered.promise, untilAborted(signal)])
      },
      hold: () => untilAborted(signal),
      open: (id, file, line) => {
        const child = `call_${id}`
        paneRun.call(id, 'execute_typescript', {
          typescriptCode: `return await external_open({file: '${file}', line: ${line}})`,
        })
        paneRun.call(child, 'open', {file, line}, id)
        opened.push({file, line})
        paneRun.result(child, {opened: true})
        paneRun.result(id, {success: true, result: {opened: true}})
      },
    }
    const finish = (phase: 'completed' | 'failed' | 'aborted', error: string | null, code?: string): void => {
      closeText()
      const ended = lifecycle(run, phase, error)
      last.run = ended
      record(run, runLifecycleEvent.create(ended))
      if (phase === 'failed' && error !== null)
        record(
          run,
          code === undefined
            ? {type: ChatEventType.RUN_ERROR, message: error}
            : {type: ChatEventType.RUN_ERROR, message: error, code},
        )
      if (phase === 'completed')
        record(run, {type: ChatEventType.RUN_FINISHED, threadId: PANE_SESSION, runId: run.id, finishReason: 'stop'})
      if (phase === 'aborted')
        history.push({id: messageId, role: 'assistant', parts: interrupted(parts), metadata: STOPPED_METADATA})
      if (phase !== 'aborted' && parts.length > 0) history.push({id: messageId, role: 'assistant', parts})
      run.done = true
      wake(run)
    }
    const stop = async (): Promise<void> => {
      await savedToDisk()
      closeText()
      unansweredCalls(parts, true).forEach((toolCallId) =>
        paneRun.result(toolCallId, {error: stoppedError().message}, 'error'),
      )
      unansweredCalls(parts, false).forEach((toolCallId) =>
        record(run, {
          type: ChatEventType.TOOL_CALL_RESULT,
          messageId,
          toolCallId,
          content: JSON.stringify({error: INTERRUPTED}),
          metadata: {tanstack: {state: 'output-error'}},
        }),
      )
      finish('aborted', null)
    }
    record(run, {type: ChatEventType.RUN_STARTED, threadId: PANE_SESSION, runId: run.id})
    record(run, runLifecycleEvent.create(lifecycle(run, 'running', null)))
    try {
      const outcome = await Promise.race([turn(paneRun), untilAborted(signal)])
      if (outcome === undefined) return finish('completed', null)
      return finish('failed', outcome.failed, outcome.code)
    } catch (error) {
      if (signal.aborted) return stop()
      throw error
    }
  }

  const start = (runId: string, turn: PaneTurn): {run: Run; played: Promise<void>} => {
    const run: Run = {
      id: runId,
      startedAt: Date.now(),
      events: [],
      stopped: new AbortController(),
      wake: new Set(),
      done: false,
    }
    runs.set(runId, run)
    return {run, played: play(run, turn, `msg_${crypto.randomUUID()}`)}
  }

  const nextTurn = (): PaneTurn => {
    const turn = script.shift()
    if (turn === undefined) throw new Error('the pane engine has no turn left: script one with turns(...)')
    return turn
  }

  const announce = (turn: PaneTurn): Promise<void> => {
    const {run, played} = start(`run_${crypto.randomUUID()}`, turn)
    session.push(sessionRunEvent.create({runId: run.id}))
    return played
  }

  const handlers: FakeEngineHandlers = {
    ...(options.plugin === undefined ? {} : {plugin: options.plugin}),
    markers: {list: ({sessionId}) => markers.filter((marker) => marker.sessionId === sessionId)},
    chat: {
      events: (_input, call) => session.read(call.signal),
      send: ({runId}, call) => {
        const turnMessages = engine.sent().at(-1)?.messages ?? []
        const ids = history.map((message) => message.id)
        history.push(...turnMessages.filter((message) => !ids.includes(message.id)))
        const {run} = start(runId, nextTurn())
        return follow(run, call.signal)
      },
      join: ({runId}, call) => {
        const run = runs.get(runId)
        if (run === undefined) return noEvents()
        return follow(run, call.signal)
      },
      hydrate: (input) => {
        const active = [...runs.values()].find((run) => !run.done)
        return {
          ...historyWindow(history, input),
          messageHarness: {},
          activeRun: active === undefined ? null : {runId: active.id},
          lastRun: last.run,
          pendingApprovals: pending.map((card) => ({
            approvalId: card.approvalId,
            toolCallId: card.approvalId,
            toolName: card.title,
            input: {},
            runId: card.runId,
            permission: {always: card.always},
          })),
          interrupts: null,
        }
      },
      stop: async ({runIds}) => {
        const stopping = runIds.flatMap((runId) => {
          const run = runs.get(runId)
          return run === undefined ? [] : [run]
        })
        stopping.forEach((run) => run.stopped.abort())
        await Promise.all(stopping.map(runEnded))
        return {ok: true}
      },
      permissionDecision: ({approvalId, reply}) => {
        const card = pending.find((found) => found.approvalId === approvalId)
        if (card === undefined) throw new ORPCError('UNKNOWN_REQUEST', {message: 'no pending approval'})
        card.settle(reply)
        return {ok: true}
      },
      uiReply: ({toolCallId, value}) => {
        const waiting = waitingAnswers.get(toolCallId)
        if (waiting === undefined) throw new ORPCError('UNKNOWN_REQUEST', {message: 'no pending ui question'})
        waitingAnswers.delete(toolCallId)
        answers.push(value)
        waiting(value)
        return {ok: true}
      },
    },
    sessions: {
      ...(options.usage === undefined
        ? {}
        : {
            get: ({sessionId}: {sessionId: string}) => ({
              id: sessionId,
              title: 'New session',
              updatedAt: Date.now(),
              running: false,
              origin: 'conciv' as const,
              usage: options.usage ?? null,
              model: null,
              effort: null,
              hidden: false,
              native: null,
              harnessKind: 'fake',
              lastRunAt: Date.now(),
            }),
          }),
      compact: async ({sessionId}) => {
        markers.push({
          id: `mrk_${crypto.randomUUID()}`,
          sessionId,
          afterMessageId: history.at(-1)?.id ?? null,
          kind: 'compact',
        })
        const summary = (await options.compaction?.()) ?? 'Compacted'
        history.push({
          id: `msg_${crypto.randomUUID()}`,
          role: 'assistant',
          parts: [{type: 'text', content: summary}],
          metadata: {conciv: {compaction: true}},
        })
        await announce(() => undefined)
        return {ok: true}
      },
    },
  }

  const engine = shellEngine(createFakeEngine({sessions: [{id: PANE_SESSION, title: 'New session'}], handlers}))

  return {
    engine,
    turns: (...turns) => script.push(...turns),
    send: (text, turn) => {
      history.push(userMessage(text))
      return announce(turn)
    },
    notice: (message, turn) => {
      history.push(message)
      return turn === undefined ? Promise.resolve() : announce(turn)
    },
    ask: (ask) => openAsk(ask, null, undefined),
    approve: () => pending[0]?.settle('once'),
    answers: () => [...answers],
    opened: () => [...opened],
  }
}

function paragraph(text: string): HTMLParagraphElement {
  return Object.assign(document.createElement('p'), {textContent: text})
}

export const releaseTrainSlotsPlugin: ShellPlugin = {
  id: 'release-train',
  plugin: Plugin.define({
    setup(ctx) {
      ctx.add(Slot, {at: 'session.header', render: () => paragraph('Release train: on time')})
      ctx.add(Slot, {at: 'session.status', render: () => paragraph('Next train at noon')})
    },
  }),
}

export const SESSION_ADDRESS = `/panel/${PANE_SESSION}?open=true`

export function released(): {started: Promise<void>; release: () => void; hold: () => Promise<void>} {
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  return {
    started: started.promise,
    release: () => release.resolve(),
    hold: () => {
      started.resolve()
      return release.promise
    },
  }
}

export async function shipped(run: PaneRun, id: string, branch: string): Promise<void> {
  const child = `call_${id}`
  run.call(id, 'execute_typescript', {typescriptCode: `return await external_release_ship({branch: '${branch}'})`})
  run.call(child, 'release_ship', {branch}, id)
  const reply = await run.ask({title: `release_ship ${branch}`, always: true})
  if (reply === 'reject') {
    run.result(child, {error: 'the call was not approved'}, 'denied')
    run.result(id, {success: false, error: {message: 'the call was not approved'}}, 'denied')
    return
  }
  run.result(child, {shipped: true})
  run.result(id, {success: true, result: {shipped: true}})
}

export async function uiQuestion(run: PaneRun, id: string, input: Record<string, unknown>): Promise<void> {
  const child = `call_${id}`
  run.call(id, 'execute_typescript', {typescriptCode: `return await external_conciv_ui(${JSON.stringify(input)})`})
  run.call(child, 'conciv_ui', input, id)
  const value = await run.answer(child)
  run.result(child, {answered: true, value})
  run.result(id, {success: true, result: {answered: true, value}})
}

export function noticeMessage(text: string, description?: string, metadata?: Record<string, unknown>): ChatMessage {
  return {
    id: `msg_${crypto.randomUUID()}`,
    role: 'user',
    parts: [{type: 'text', content: text}],
    metadata: {conciv: {synthetic: {description, metadata}}},
  }
}
