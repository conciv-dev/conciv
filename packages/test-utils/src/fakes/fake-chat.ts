import {testKitErrors} from '@conciv/errors'
import {ORPCError} from '@orpc/server'
import type {ChatHydration, SessionMeta} from '@conciv/protocol'
import {
  approvalRequestedEvent,
  approvalSettledEvent,
  ChatEventType,
  runLifecycleEvent,
  sessionRunEvent,
  type ChatEvent,
  type RunLifecycle,
} from '@conciv/types/chat-event-types'
import {outsideCallMessageId, type ChatMessage, type ChatPart} from '@conciv/types/chat-message-types'
import type {PermissionReply} from '@conciv/types/chat-types'
import type {UiAnswerValue} from '@conciv/types/ui-types'
import type {UsageSnapshot} from '@conciv/types/usage-types'
import {aborted, channel, type Channel} from './fake-channel.js'
import {executeTool, NOT_APPROVED, type AskedCall, type ExecuteDeps, type ExecuteSink} from './fake-execute.js'
import type {
  Call,
  FakeAsk,
  FakeEngineOptions,
  FakeGate,
  FakeOutside,
  FakeOutsideAgent,
  FakeOutsideReply,
  FakeReply,
  FakeSend,
  FakeSynthetic,
  Promisable,
} from './fake-types.js'

type RunKind = 'turn' | 'compact'

type Run = {
  readonly id: string
  readonly sessionId: string
  readonly kind: RunKind
  readonly startedAt: number
  readonly events: ChatEvent[]
  readonly waiting: Set<() => void>
  readonly stopped: AbortController
  done: boolean
}

type Turn = {readonly run: Run; readonly messageId: string; readonly parts: ChatPart[]}

type Held = {readonly reply: FakeReply} | {readonly gate: PromiseWithResolvers<void>; readonly started: () => void}

type Pending = {
  readonly approvalId: string
  readonly sessionId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly input: unknown
  readonly runId: string | null
  readonly always: boolean
  readonly settle: (reply: PermissionReply) => void
}

type Phase = RunLifecycle['phase']

export type ChatStore = {
  readonly sessions: Map<string, SessionMeta>
  readonly history: Map<string, ChatMessage[]>
  readonly touch: () => void
  readonly now: () => number
  readonly setUsage: (sessionId: string, usage: UsageSnapshot) => void
  readonly addMarker: (sessionId: string, afterMessageId: string | null) => void
}

const CHARS_PER_TOKEN = 4

const INTERRUPTED = 'Tool execution interrupted'

const STOPPED = 'the run was stopped'

const STOPPED_METADATA = {tanstack: {stopReason: 'aborted'}}

const COMPACTION = {conciv: {compaction: true}}

function wake(run: Run): void {
  const waiting = [...run.waiting]
  run.waiting.clear()
  waiting.forEach((resolve) => resolve())
}

function changed(run: Run, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    run.waiting.add(resolve)
    signal?.addEventListener('abort', () => resolve(), {once: true})
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
    await changed(run, signal)
  }
}

async function runEnded(run: Run): Promise<void> {
  while (!run.done) await changed(run, undefined)
}

async function* noEvents(): AsyncGenerator<ChatEvent> {}

function textChunks(text: string, tokensPerSecond: number | undefined): string[] {
  if (tokensPerSecond === undefined) return [text]
  return Array.from({length: Math.ceil(text.length / CHARS_PER_TOKEN)}, (_, index) =>
    text.slice(index * CHARS_PER_TOKEN, (index + 1) * CHARS_PER_TOKEN),
  )
}

function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      {once: true},
    )
  })
}

function savedToDisk(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function serialized(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function isLater(result: unknown): result is () => unknown {
  return typeof result === 'function'
}

function isChild(metadata: unknown): boolean {
  return typeof metadata === 'object' && metadata !== null && 'parentToolCallId' in metadata
}

function openCalls(parts: readonly ChatPart[]): Extract<ChatPart, {type: 'tool-call'}>[] {
  const answered = parts.flatMap((part) => (part.type === 'tool-result' ? [part.toolCallId] : []))
  return parts.flatMap((part) => (part.type === 'tool-call' && !answered.includes(part.id) ? [part] : []))
}

function outsideText(text: string, isError = false): FakeOutsideReply {
  return isError ? {content: [{type: 'text', text}], isError} : {content: [{type: 'text', text}]}
}

function noOutsideSession(): never {
  throw testKitErrors.FAKE_OUTSIDE_WITHOUT_SESSION()
}

function turnStart(history: readonly ChatMessage[], index: number): number {
  const found = history.slice(0, index + 1).findLastIndex((message) => message.role === 'user')
  return found < 0 ? 0 : found
}

function historyWindow(
  history: readonly ChatMessage[],
  input: {limit?: number | undefined; before?: string | undefined},
): Pick<ChatHydration, 'messages' | 'page'> {
  if (input.limit === undefined && input.before === undefined) return {messages: [...history]}
  const end = input.before === undefined ? history.length : history.findIndex((message) => message.id === input.before)
  if (end < 0) return {messages: [], page: {truncated: false}}
  const start = turnStart(history, Math.max(end - (input.limit ?? end), 0))
  const messages = history.slice(start, end)
  const first = messages[0]
  if (start === 0 || first === undefined) return {messages, page: {truncated: false}}
  return {messages, page: {truncated: true, cursor: first.id}}
}

export function createChat(
  store: ChatStore,
  options: Pick<FakeEngineOptions, 'tools' | 'tokensPerSecond'>,
  readTurn: (messages: readonly unknown[]) => ChatMessage[],
) {
  const script: Held[] = []
  const runs = new Map<string, Run>()
  const sent: FakeSend[] = []
  const pending: Pending[] = []
  const harnesses = new Map<string, string>()
  const pushes = new Map<string, Channel<ChatEvent>>()
  const lastRuns = new Map<string, RunLifecycle>()
  const questions = new Map<string, (value: UiAnswerValue) => void>()
  const sessionPush = (sessionId: string): Channel<ChatEvent> => {
    const found = pushes.get(sessionId) ?? channel<ChatEvent>()
    pushes.set(sessionId, found)
    return found
  }
  const setRunning = (sessionId: string, running: boolean): void => {
    const meta = store.sessions.get(sessionId)
    if (meta === undefined) return
    const at = store.now()
    store.sessions.set(sessionId, {...meta, running, updatedAt: at, lastRunAt: at})
    store.touch()
  }
  const record = (run: Run, event: ChatEvent): void => {
    run.events.push(event)
    wake(run)
  }
  const lifecycle = (run: Run, phase: Phase, error: string | null): ChatEvent => {
    const now = Date.now()
    const data: RunLifecycle = {
      runId: run.id,
      phase,
      startedAt: run.startedAt,
      finishedAt: phase === 'running' ? null : now,
      serverNow: now,
      error,
    }
    lastRuns.set(run.sessionId, data)
    return runLifecycleEvent.create(data)
  }
  const saveMessage = (sessionId: string, message: ChatMessage): void => {
    const history = store.history.get(sessionId) ?? []
    const index = history.findIndex((saved) => saved.id === message.id)
    store.history.set(sessionId, index < 0 ? [...history, message] : history.with(index, message))
  }
  const recordSend = (sessionId: string, messages: readonly unknown[]): ChatMessage[] => {
    const turn = readTurn(messages)
    sent.push({sessionId, messages: turn})
    return turn
  }
  const ask = (sessionId: string, call: AskedCall, request: FakeAsk, signal: AbortSignal): Promise<PermissionReply> => {
    const approvalId = `per_${crypto.randomUUID()}`
    const settled = Promise.withResolvers<PermissionReply>()
    const always = request.always ?? false
    pending.push({...call, approvalId, sessionId, always, settle: settled.resolve})
    sessionPush(sessionId).push(
      approvalRequestedEvent.create({
        approvalId,
        toolCallId: call.toolCallId,
        title: call.toolName,
        input: call.input,
        permission: {always},
      }),
    )
    const drop = (): void => {
      const index = pending.findIndex((card) => card.approvalId === approvalId)
      if (index >= 0) pending.splice(index, 1)
      sessionPush(sessionId).push(approvalSettledEvent.create({approvalId}))
    }
    return Promise.race([settled.promise, aborted(signal).then((): PermissionReply => 'reject')]).finally(drop)
  }
  const answer = (toolCallId: string, signal: AbortSignal): Promise<UiAnswerValue> => {
    const answered = Promise.withResolvers<UiAnswerValue>()
    questions.set(toolCallId, answered.resolve)
    void aborted(signal).then(() => questions.delete(toolCallId))
    return answered.promise
  }
  const executeDeps = (sessionId: string): ExecuteDeps => ({
    tools: options.tools,
    ask: (call, request, signal) => ask(sessionId, call, request, signal),
    answer,
  })
  const next = async (): Promise<FakeReply> => {
    const held = script.shift()
    if (held === undefined) throw testKitErrors.FAKE_NO_REPLY_LEFT()
    if ('reply' in held) return held.reply
    held.started()
    await held.gate.promise
    return next()
  }
  const finish = (turn: Turn, phase: Phase, last: ChatEvent | undefined, error: string | null): true => {
    const {run, messageId} = turn
    record(run, lifecycle(run, phase, error))
    if (last !== undefined) record(run, last)
    const message: ChatMessage = {id: messageId, role: 'assistant', parts: [...turn.parts]}
    const stamped = run.kind === 'compact' ? {...message, metadata: COMPACTION} : message
    saveMessage(run.sessionId, phase === 'aborted' ? {...stamped, metadata: STOPPED_METADATA} : stamped)
    const harnessId = store.sessions.get(run.sessionId)?.harnessKind
    if (harnessId !== undefined) harnesses.set(messageId, harnessId)
    run.done = true
    wake(run)
    setRunning(run.sessionId, false)
    return true
  }
  const result = (turn: Turn, toolCallId: string, content: string, metadata?: Record<string, unknown>): void =>
    record(turn.run, {
      type: ChatEventType.TOOL_CALL_RESULT,
      messageId: turn.messageId,
      toolCallId,
      content,
      ...(metadata === undefined ? {} : {metadata}),
    })
  const stopTurn = async (turn: Turn): Promise<true> => {
    await savedToDisk()
    openCalls(turn.parts).forEach((call) => {
      const child = isChild(call.metadata)
      const content = JSON.stringify({error: child ? STOPPED : INTERRUPTED})
      result(turn, call.id, content, {tanstack: {state: 'output-error'}})
      turn.parts.push(
        child
          ? {type: 'tool-result', toolCallId: call.id, content, state: 'error'}
          : {type: 'tool-result', toolCallId: call.id, content: INTERRUPTED, state: 'error', error: INTERRUPTED},
      )
    })
    return finish(turn, 'aborted', undefined, null)
  }
  const streamText = async (turn: Turn, text: string): Promise<void> => {
    const {run, messageId} = turn
    const metadata = run.kind === 'compact' ? {metadata: COMPACTION} : {}
    record(run, {type: ChatEventType.TEXT_MESSAGE_START, messageId, role: 'assistant', ...metadata})
    for (const delta of textChunks(text, options.tokensPerSecond)) {
      if (options.tokensPerSecond !== undefined) await pause(1000 / options.tokensPerSecond, run.stopped.signal)
      if (run.stopped.signal.aborted) return
      record(run, {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId, delta})
    }
    record(run, {type: ChatEventType.TEXT_MESSAGE_END, messageId})
  }
  const say = async (turn: Turn, reply: Extract<FakeReply, {kind: 'text'}>): Promise<boolean> => {
    const {run} = turn
    await streamText(turn, reply.text)
    if (run.stopped.signal.aborted) return stopTurn(turn)
    turn.parts.push({type: 'text', content: reply.text})
    if (!reply.ends) return false
    return finish(
      turn,
      'completed',
      {type: ChatEventType.RUN_FINISHED, threadId: run.sessionId, runId: run.id, finishReason: 'stop'},
      null,
    )
  }
  const think = (turn: Turn, text: string): false => {
    const {run} = turn
    const messageId = `${turn.messageId}-thinking-${turn.parts.length}`
    record(run, {type: ChatEventType.REASONING_START, messageId})
    record(run, {type: ChatEventType.REASONING_MESSAGE_START, messageId, role: 'reasoning'})
    record(run, {type: ChatEventType.REASONING_MESSAGE_CONTENT, messageId, delta: text})
    record(run, {type: ChatEventType.REASONING_MESSAGE_END, messageId})
    record(run, {type: ChatEventType.REASONING_END, messageId})
    turn.parts.push({type: 'thinking', content: text})
    return false
  }
  const fail = (turn: Turn, reply: Extract<FakeReply, {kind: 'failAfter'}>): true => {
    const error: ChatEvent =
      reply.code === undefined
        ? {type: ChatEventType.RUN_ERROR, message: reply.message}
        : {type: ChatEventType.RUN_ERROR, message: reply.message, code: reply.code}
    return finish(turn, 'failed', error, reply.message)
  }
  const callTool = async (turn: Turn, reply: Extract<FakeReply, {kind: 'toolCall'}>): Promise<boolean> => {
    const {run, messageId} = turn
    const args = JSON.stringify(reply.input ?? {})
    record(run, {
      type: ChatEventType.TOOL_CALL_START,
      toolCallId: reply.id,
      toolCallName: reply.name,
      parentMessageId: messageId,
    })
    record(run, {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: reply.id, delta: args})
    record(run, {type: ChatEventType.TOOL_CALL_END, toolCallId: reply.id})
    const callPart: ChatPart = {
      type: 'tool-call',
      id: reply.id,
      name: reply.name,
      arguments: args,
      state: 'input-complete',
    }
    turn.parts.push(callPart)
    const asked = options.tools?.[reply.name]?.ask
    if (asked !== undefined) {
      const call = {toolCallId: reply.id, toolName: asked.title ?? reply.name, input: reply.input, runId: run.id}
      const decision = await ask(run.sessionId, call, asked, run.stopped.signal)
      if (run.stopped.signal.aborted) return stopTurn(turn)
      if (decision === 'reject') {
        const content = JSON.stringify({error: NOT_APPROVED})
        result(turn, reply.id, content, {tanstack: {state: 'output-error', toolResultOutcome: 'denied'}})
        turn.parts.push({type: 'tool-result', toolCallId: reply.id, content, state: 'error', outcome: 'denied'})
        return false
      }
    }
    const settled = isLater(reply.result) ? reply.result() : reply.result
    const value: unknown = await Promise.race([settled, aborted(run.stopped.signal)])
    if (run.stopped.signal.aborted) return stopTurn(turn)
    const content = serialized(value)
    turn.parts.splice(turn.parts.indexOf(callPart), 1, {...callPart, output: value})
    result(turn, reply.id, content, reply.failed ? {tanstack: {state: 'output-error'}} : undefined)
    turn.parts.push({type: 'tool-result', toolCallId: reply.id, content, state: reply.failed ? 'error' : 'complete'})
    return false
  }
  const execute = async (turn: Turn, reply: Extract<FakeReply, {kind: 'execute'}>): Promise<boolean> => {
    const {run} = turn
    const sink: ExecuteSink = {
      emit: (event) => record(run, event),
      part: (part) => turn.parts.push(part),
      marker: {},
      messageId: turn.messageId,
      runId: run.id,
      signal: run.stopped.signal,
    }
    const outcome = await executeTool(executeDeps(run.sessionId), sink, reply)
    if (outcome.kind === 'stopped') return stopTurn(turn)
    return false
  }
  const playReply = (turn: Turn, reply: FakeReply): Promisable<boolean> => {
    if (reply.kind === 'hang') return aborted(turn.run.stopped.signal).then(() => stopTurn(turn))
    if (reply.kind === 'failAfter') return fail(turn, reply)
    if (reply.kind === 'text') return say(turn, reply)
    if (reply.kind === 'thinking') return think(turn, reply.text)
    if (reply.kind === 'execute') return execute(turn, reply)
    if (reply.kind === 'usage') {
      store.setUsage(turn.run.sessionId, reply.usage)
      return false
    }
    return callTool(turn, reply)
  }
  const play = async (run: Run): Promise<void> => {
    const turn: Turn = {run, messageId: `msg_${crypto.randomUUID()}`, parts: []}
    record(run, {type: ChatEventType.RUN_STARTED, threadId: run.sessionId, runId: run.id})
    record(run, lifecycle(run, 'running', null))
    setRunning(run.sessionId, true)
    for (;;) {
      const reply = await Promise.race([next(), aborted(run.stopped.signal).then(() => undefined)])
      if (reply === undefined || run.stopped.signal.aborted) {
        await stopTurn(turn)
        return
      }
      if (await playReply(turn, reply)) return
    }
  }
  const start = (sessionId: string, runId: string, kind: RunKind): Run => {
    const run: Run = {
      id: runId,
      sessionId,
      kind,
      startedAt: Date.now(),
      events: [],
      waiting: new Set(),
      stopped: new AbortController(),
      done: false,
    }
    runs.set(runId, run)
    void play(run)
    sessionPush(sessionId).push(sessionRunEvent.create({runId}))
    return run
  }
  const outsideCall = async (agent: FakeOutsideAgent, name: string, input: unknown): Promise<FakeOutsideReply> => {
    if (options.tools?.[name] === undefined) return outsideText(`Unknown tool: ${name}`, true)
    const sessionId = agent.session ?? noOutsideSession()
    const callId = `call_${crypto.randomUUID().replaceAll('-', '')}`
    const messageId = outsideCallMessageId(callId)
    const push = sessionPush(sessionId)
    const parts: ChatPart[] = []
    const sink: ExecuteSink = {
      emit: (event) => push.push(event),
      part: (part) => {
        parts.push(part)
        saveMessage(sessionId, {id: messageId, role: 'assistant', parts: [...parts]})
      },
      marker: {conciv: {origin: 'hub', client: agent.client ?? null, run: callId}},
      messageId,
      runId: null,
      signal: new AbortController().signal,
    }
    push.push({type: ChatEventType.RUN_STARTED, runId: `mirror-${callId}`, threadId: sessionId})
    const outcome = await executeTool(executeDeps(sessionId), sink, {id: callId, name, input})
    push.push({type: ChatEventType.RUN_FINISHED, runId: `mirror-${callId}`, threadId: sessionId, finishReason: 'stop'})
    if (outcome.kind === 'denied') return outsideText(NOT_APPROVED, true)
    if (outcome.kind === 'failed') return outsideText(outcome.message, true)
    if (outcome.kind === 'stopped') return outsideText(STOPPED, true)
    return outsideText(JSON.stringify(outcome.value))
  }
  const synthetic = (sessionId: string, notice: FakeSynthetic): Promise<void> => {
    saveMessage(sessionId, {
      id: `msg_${crypto.randomUUID()}`,
      role: 'user',
      parts: [{type: 'text', content: notice.text}],
      metadata: {conciv: {synthetic: {description: notice.description, metadata: notice.metadata}}},
    })
    store.touch()
    if (notice.resume === false) return Promise.resolve()
    return runEnded(start(sessionId, `run_${crypto.randomUUID()}`, 'turn'))
  }
  const compact = async (sessionId: string): Promise<{ok: true}> => {
    const active = [...runs.values()].filter((run) => run.sessionId === sessionId && !run.done)
    active.forEach((run) => run.stopped.abort())
    await Promise.all(active.map(runEnded))
    store.addMarker(sessionId, store.history.get(sessionId)?.at(-1)?.id ?? null)
    await runEnded(start(sessionId, `run_${crypto.randomUUID()}`, 'compact'))
    return {ok: true}
  }
  return {
    synthetic,
    compact,
    reply: (replies: readonly FakeReply[]) => replies.forEach((reply) => script.push({reply})),
    gate: (): FakeGate => {
      const gate = Promise.withResolvers<void>()
      const started = Promise.withResolvers<void>()
      script.push({gate, started: started.resolve})
      return {started: started.promise, release: () => gate.resolve()}
    },
    sent: () => sent,
    recordSend,
    outside: (agent: FakeOutsideAgent): FakeOutside => ({
      call: (name, input) => outsideCall(agent, name, input),
      discover: async (names) =>
        outsideText(
          names.map((name) => (options.tools?.[name] === undefined ? `Unknown tool: ${name}` : name)).join('\n'),
        ),
    }),
    handlers: {
      events: ({sessionId}: {sessionId: string}, call: Call) => sessionPush(sessionId).read(call.signal),
      send: ({sessionId, runId, messages}: {sessionId: string; runId: string; messages: unknown[]}, call: Call) => {
        const turn = recordSend(sessionId, messages)
        const history = store.history.get(sessionId) ?? []
        const ids = new Set(history.map((message) => message.id))
        store.history.set(sessionId, [...history, ...turn.filter((message) => !ids.has(message.id))])
        return follow(start(sessionId, runId, 'turn'), call.signal)
      },
      join: ({runId}: {runId: string}, call: Call) => {
        const run = runs.get(runId)
        if (run === undefined) return noEvents()
        return follow(run, call.signal)
      },
      hydrate: (input: {sessionId: string; limit?: number | undefined; before?: string | undefined}) => {
        const {sessionId} = input
        const active = [...runs.values()].find((run) => run.sessionId === sessionId && !run.done)
        const window = historyWindow(store.history.get(sessionId) ?? [], input)
        return {
          ...window,
          messageHarness: Object.fromEntries(
            window.messages.flatMap((message) => {
              const harnessId = harnesses.get(message.id)
              return harnessId === undefined ? [] : [[message.id, harnessId]]
            }),
          ),
          activeRun: active === undefined ? null : {runId: active.id},
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
      stop: async ({runIds}: {runIds: string[]}) => {
        const stopping = runIds.flatMap((runId) => {
          const run = runs.get(runId)
          return run === undefined ? [] : [run]
        })
        stopping.forEach((run) => run.stopped.abort())
        await Promise.all(stopping.map(runEnded))
        return {ok: true as const}
      },
      permissionDecision: ({approvalId, reply}: {approvalId: string; reply: PermissionReply}) => {
        const card = pending.find((found) => found.approvalId === approvalId)
        if (card === undefined) throw new ORPCError('UNKNOWN_REQUEST', {message: 'no pending approval'})
        card.settle(reply)
        return {ok: true as const}
      },
      uiReply: ({toolCallId, value}: {toolCallId: string; value: UiAnswerValue}) => {
        const waiting = questions.get(toolCallId)
        if (waiting === undefined) throw new ORPCError('UNKNOWN_REQUEST', {message: 'no pending ui question'})
        questions.delete(toolCallId)
        waiting(value)
        return {ok: true as const}
      },
    },
  }
}
