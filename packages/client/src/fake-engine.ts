import {call as callProcedure, implement, isProcedure, ORPCError, type AnyRouter} from '@orpc/server'
import {createORPCClient, type ClientLink} from '@orpc/client'
import {
  isContractProcedure,
  type AnyContractRouter,
  type ContractProcedure,
  type InferSchemaInput,
  type InferSchemaOutput,
} from '@orpc/contract'
import {contract, type DraftRow, type MarkerRow, type SessionMeta, type SettingsSnapshot} from '@conciv/protocol'
import {
  approvalRequestedEvent,
  approvalSettledEvent,
  ChatEventType,
  runLifecycleEvent,
  sessionRunEvent,
  type ChatEvent,
} from '@conciv/types/chat-event-types'
import {outsideCallMessageId, type ChatMessage, type ModelMessage} from '@conciv/types/chat-message-types'
import {modelMessagesToUIMessages} from '@tanstack/ai-client'
import {isSessionId, SessionId, type ChatModels, type PermissionReply} from '@conciv/types/chat-types'
import manifest from '../package.json' with {type: 'json'}
import {
  createConnectionState,
  REVOKED_SOCKET_CLOSE_CODE,
  transitionConnection,
  type ConnectionEvent,
  type ConnectionState,
} from './engine-connection-machine.js'
import type {
  EngineConnection,
  EngineTokenSource,
  EngineTrust,
  ReachabilityListener,
  RpcClientContext,
  TrustListener,
} from './engine-connection.js'
import type {RpcClient} from './rpc-client.js'

type Promisable<T> = T | Promise<T>

type Call = {readonly signal: AbortSignal | undefined}

type Handler<P> =
  P extends ContractProcedure<infer Input, infer Output, infer _Errors, infer _Meta>
    ? (input: InferSchemaOutput<Input>, call: Call) => Promisable<InferSchemaInput<Output>>
    : never

type Handlers<Router> = {
  [Key in keyof Router]?: Router[Key] extends ContractProcedure<infer _I, infer _O, infer _E, infer _M>
    ? Handler<Router[Key]>
    : Handlers<Router[Key]>
}

export type FakeEngineHandlers = Handlers<typeof contract>

export type FakePluginCall = {
  readonly emit: (type: `rpc.${string}`, data: Record<string, unknown>) => void
  readonly signal?: AbortSignal | undefined
}

export type FakePluginHandler = (input: unknown, call: FakePluginCall) => unknown

export type FakeReply =
  | {readonly kind: 'text'; readonly text: string}
  | {
      readonly kind: 'toolCall'
      readonly id: string
      readonly name: string
      readonly input: unknown
      readonly result: unknown
      readonly failed: boolean
    }
  | {readonly kind: 'failAfter'; readonly message: string; readonly code?: string}
  | {readonly kind: 'hang'}

export type FakeGate = {readonly started: Promise<void>; readonly release: () => void}

export type FakeSession = {readonly id: string; readonly title?: string; readonly messages?: readonly ChatMessage[]}

export type FakeEngineReading = {
  readonly stale: boolean
  readonly changed: readonly string[]
  readonly tracked: readonly string[]
  readonly bootedAt: number
  readonly fingerprint: string
}

export type FakeAsk = {readonly title?: string; readonly always?: boolean}

export type FakeTool = {readonly ask?: FakeAsk; readonly run?: (input: unknown) => unknown}

export type FakeOutsideAgent = {readonly client?: string; readonly session?: string}

export type FakeOutsideReply = {
  readonly content: readonly {readonly type: 'text'; readonly text: string}[]
  readonly isError?: boolean
}

export type FakeOutside = {
  call(name: string, input: unknown): Promise<FakeOutsideReply>
  discover(names: readonly string[]): Promise<FakeOutsideReply>
}

export type FakeEngineOptions = {
  readonly directory?: string
  readonly token?: string
  readonly loggedIn?: boolean
  readonly sessions?: readonly FakeSession[]
  readonly models?: ChatModels
  readonly settings?: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  readonly plugins?: Readonly<Record<string, Readonly<Record<string, FakePluginHandler>>>>
  readonly tools?: Readonly<Record<string, FakeTool>>
  readonly tokensPerSecond?: number
  readonly handlers?: FakeEngineHandlers
}

export type FakeSynthetic = {readonly text: string; readonly description: string}

export type FakeSend = {readonly sessionId: string; readonly messages: readonly ChatMessage[]}

export type FakeConnectOptions = {readonly token?: string; readonly tokenSource?: EngineTokenSource}

export type FakeEngine = {
  readonly apiBase: string
  readonly directory: string
  readonly connection: EngineConnection
  connect(options?: FakeConnectOptions): EngineConnection
  reply(...replies: FakeReply[]): void
  gate(): FakeGate
  outside(agent?: FakeOutsideAgent): FakeOutside
  synthetic(sessionId: string, notice: FakeSynthetic): void
  emit(type: `rpc.${string}`, data: Record<string, unknown>): void
  drop(): void
  recover(): void
  reconnect(): void
  stale(reading: FakeEngineReading): void
  version(version: string | null): void
  loginCode(): string
  revokeBrowsers(): void
  sent(): readonly FakeSend[]
  drafts(): readonly DraftRow[]
  unanswered(): readonly string[]
  dispose(): void
}

export const FakeLLM = {
  text: (text: string): FakeReply => ({kind: 'text', text}),
  toolCall: (id: string, name: string, input: unknown, result: unknown = {}): FakeReply => ({
    kind: 'toolCall',
    id,
    name,
    input,
    result,
    failed: false,
  }),
  toolError: (id: string, name: string, input: unknown, message: string): FakeReply => ({
    kind: 'toolCall',
    id,
    name,
    input,
    result: message,
    failed: true,
  }),
  failAfter: (error: Error & {code?: string}): FakeReply => ({
    kind: 'failAfter',
    message: error.message,
    code: error.code,
  }),
  hang: (): FakeReply => ({kind: 'hang'}),
}

type Channel<T> = {push(value: T): void; end(): void; read(signal: AbortSignal | undefined): AsyncGenerator<T>}

function channel<T>(): Channel<T> {
  const readers = new Set<{queue: (T | typeof END)[]; wake: () => void}>()
  return {
    push: (value) =>
      readers.forEach((reader) => {
        reader.queue.push(value)
        reader.wake()
      }),
    end: () =>
      readers.forEach((reader) => {
        reader.queue.push(END)
        reader.wake()
      }),
    read: (signal) => readChannel(readers, signal),
  }
}

const END = Symbol('end')

async function* readChannel<T>(
  readers: Set<{queue: (T | typeof END)[]; wake: () => void}>,
  signal: AbortSignal | undefined,
): AsyncGenerator<T> {
  const reader: {queue: (T | typeof END)[]; wake: () => void} = {queue: [], wake: () => undefined}
  readers.add(reader)
  const stop = (): void => {
    reader.queue.push(END)
    reader.wake()
  }
  signal?.addEventListener('abort', stop, {once: true})
  try {
    while (signal?.aborted !== true) {
      const next = reader.queue.shift()
      if (next === END) return
      if (next !== undefined) {
        yield next
        continue
      }
      await new Promise<void>((resolve) => {
        reader.wake = resolve
      })
    }
  } finally {
    signal?.removeEventListener('abort', stop)
    readers.delete(reader)
  }
}

function isWireRow(value: unknown): value is ModelMessage & {readonly content: unknown} {
  return typeof value === 'object' && value !== null && 'role' in value && typeof value.role === 'string'
}

function wireContent(content: unknown): unknown {
  if (!Array.isArray(content)) return content
  return content.map((part: unknown) =>
    typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part
      ? {type: 'text', content: part.text}
      : part,
  )
}

function wireRow(value: unknown): ModelMessage[] {
  if (!isWireRow(value)) return []
  const content = wireContent(value.content)
  return [{...value, content: isModelContent(content) ? content : null}]
}

function isModelContent(content: unknown): content is ModelMessage['content'] {
  return content === null || typeof content === 'string' || Array.isArray(content)
}

function readSentTurn(messages: readonly unknown[]): ChatMessage[] {
  return modelMessagesToUIMessages(messages.flatMap(wireRow))
}

function withSendRecorded(
  handlers: FakeEngineHandlers | undefined,
  record: (sessionId: string, messages: readonly unknown[]) => void,
): FakeEngineHandlers | undefined {
  const send = handlers?.chat?.send
  if (handlers === undefined || send === undefined) return handlers
  return {
    ...handlers,
    chat: {
      ...handlers.chat,
      send: (input, call) => {
        record(input.sessionId, input.messages)
        return send(input, call)
      },
    },
  }
}

function notImplemented(path: string, unanswered: string[]): never {
  unanswered.push(path)
  throw new ORPCError('NOT_IMPLEMENTED', {message: `the fake engine has no handler for ${path}`})
}

function lookup(handlers: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (node, key) => (typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined),
    handlers,
  )
}

function buildRouter(
  node: AnyContractRouter,
  path: readonly string[],
  layers: readonly unknown[],
  unanswered: string[],
): AnyRouter {
  if (isContractProcedure(node)) {
    const name = path.join('.')
    const declared = Object.keys(node['~orpc'].errorMap)
    return implement(node).handler(async ({input, signal}) => {
      const handler = layers.map((layer) => lookup(layer, path)).find((found) => typeof found === 'function')
      if (typeof handler !== 'function') return notImplemented(name, unanswered)
      try {
        const answer: unknown = await handler(input, {signal})
        return answer
      } catch (error) {
        if (!(error instanceof ORPCError) || !declared.includes(error.code)) throw error
        throw new ORPCError(error.code, {defined: true, status: error.status, message: error.message, data: error.data})
      }
    })
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, buildRouter(child, [...path, key], layers, unanswered)]),
  )
}

const DEFAULT_MODELS: ChatModels = {
  models: [{id: 'fake-model', name: 'Fake model'}],
  defaultModel: 'fake-model',
  modelsFailed: false,
  harness: {id: 'fake', name: 'Fake harness', imageInput: false, persistentPty: false},
  login: {loggedIn: true},
}

function sessionMeta(session: FakeSession, updatedAt: number): SessionMeta {
  return {
    id: SessionId.parse(session.id),
    title: session.title ?? 'New session',
    updatedAt,
    running: false,
    origin: 'conciv',
    usage: null,
    model: null,
    effort: null,
    hidden: false,
    native: null,
    harnessKind: 'fake',
    lastRunAt: null,
  }
}

function toolResult(result: unknown): string {
  return typeof result === 'string' ? result : JSON.stringify(result)
}

type Run = {
  readonly id: string
  readonly sessionId: string
  readonly startedAt: number
  readonly events: ChatEvent[]
  readonly waiting: Set<() => void>
  readonly stopped: AbortController
  done: boolean
}

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

type Held = {readonly reply: FakeReply} | {readonly gate: PromiseWithResolvers<void>; readonly started: () => void}

function lifecycle(run: Run, phase: 'running' | 'completed' | 'failed' | 'aborted', error: string | null): ChatEvent {
  const now = Date.now()
  return runLifecycleEvent.create({
    runId: run.id,
    phase,
    startedAt: run.startedAt,
    finishedAt: phase === 'running' ? null : now,
    serverNow: now,
    error,
  })
}

const CHARS_PER_TOKEN = 4

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

function toolCallEvents(reply: Extract<FakeReply, {kind: 'toolCall'}>, messageId: string): ChatEvent[] {
  return [
    {type: ChatEventType.TOOL_CALL_START, toolCallId: reply.id, toolCallName: reply.name, parentMessageId: messageId},
    {type: ChatEventType.TOOL_CALL_ARGS, toolCallId: reply.id, delta: JSON.stringify(reply.input ?? {})},
    {type: ChatEventType.TOOL_CALL_END, toolCallId: reply.id},
  ]
}

function toolResultEvent(reply: Extract<FakeReply, {kind: 'toolCall'}>, result: unknown, messageId: string): ChatEvent {
  const content = toolResult(result)
  if (!reply.failed) return {type: ChatEventType.TOOL_CALL_RESULT, messageId, toolCallId: reply.id, content}
  return {
    type: ChatEventType.TOOL_CALL_RESULT,
    messageId,
    toolCallId: reply.id,
    content,
    metadata: {tanstack: {state: 'output-error'}},
  }
}

const NOT_APPROVED = 'the call was not approved'

const INTERRUPTED = 'Tool execution interrupted'

const STOPPED_METADATA = {tanstack: {stopReason: 'aborted'}}

function interruptedEvent(toolCallId: string, messageId: string): ChatEvent {
  return {
    type: ChatEventType.TOOL_CALL_RESULT,
    messageId,
    toolCallId,
    content: JSON.stringify({error: INTERRUPTED}),
    metadata: {tanstack: {state: 'output-error'}},
  }
}

function savedToDisk(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function deniedEvent(toolCallId: string, messageId: string, metadata: Record<string, unknown> = {}): ChatEvent {
  return {
    type: ChatEventType.TOOL_CALL_RESULT,
    messageId,
    toolCallId,
    content: JSON.stringify({error: NOT_APPROVED}),
    metadata: {...metadata, tanstack: {state: 'output-error', toolResultOutcome: 'denied'}},
  }
}

type Unanswered = {
  readonly kind: 'denied' | 'interrupted'
  readonly id: string
  readonly name: string
  readonly input: unknown
}

type Played = FakeReply | Unanswered

function unansweredResult(reply: Unanswered): ChatMessage['parts'][number] {
  if (reply.kind === 'denied')
    return {
      type: 'tool-result',
      toolCallId: reply.id,
      content: JSON.stringify({error: NOT_APPROVED}),
      state: 'error',
      outcome: 'denied',
    }
  return {type: 'tool-result', toolCallId: reply.id, content: INTERRUPTED, state: 'error', error: INTERRUPTED}
}

function assistantParts(replies: readonly Played[]): ChatMessage['parts'] {
  return replies.flatMap((reply): ChatMessage['parts'] => {
    if (reply.kind === 'text') return [{type: 'text', content: reply.text}]
    if (reply.kind === 'denied' || reply.kind === 'interrupted')
      return [
        {
          type: 'tool-call',
          id: reply.id,
          name: reply.name,
          arguments: JSON.stringify(reply.input ?? {}),
          state: 'input-complete',
        },
        unansweredResult(reply),
      ]
    if (reply.kind !== 'toolCall') return []
    return [
      {
        type: 'tool-call',
        id: reply.id,
        name: reply.name,
        arguments: JSON.stringify(reply.input ?? {}),
        state: 'input-complete',
        output: reply.result,
      },
      {
        type: 'tool-result',
        toolCallId: reply.id,
        content: toolResult(reply.result),
        state: reply.failed ? 'error' : 'complete',
      },
    ]
  })
}

function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), {once: true}))
}

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

type Turn = {readonly run: Run; readonly messageId: string; readonly played: Played[]}

type AskedCall = {
  readonly toolCallId: string
  readonly toolName: string
  readonly input: unknown
  readonly runId: string | null
}

function outsideText(text: string, isError = false): FakeOutsideReply {
  return isError ? {content: [{type: 'text', text}], isError} : {content: [{type: 'text', text}]}
}

function unknownTool(name: string): FakeOutsideReply {
  return outsideText(`Unknown tool: ${name}`, true)
}

function noOutsideSession(): never {
  throw new Error('an outside call needs the session it runs in: engine.outside({session})')
}

function createChat(options: {
  sessions: Map<string, SessionMeta>
  history: Map<string, ChatMessage[]>
  touch: () => void
  now: () => number
  tools: FakeEngineOptions['tools']
  tokensPerSecond: number | undefined
}) {
  const script: Held[] = []
  const runs = new Map<string, Run>()
  const sent: FakeSend[] = []
  const pending: Pending[] = []
  const harnesses = new Map<string, string>()
  const pushes = new Map<string, Channel<ChatEvent>>()
  const sessionPush = (sessionId: string): Channel<ChatEvent> => {
    const found = pushes.get(sessionId) ?? channel<ChatEvent>()
    pushes.set(sessionId, found)
    return found
  }
  const setRunning = (sessionId: string, running: boolean): void => {
    const meta = options.sessions.get(sessionId)
    if (meta === undefined) return
    const at = options.now()
    options.sessions.set(sessionId, {...meta, running, updatedAt: at, lastRunAt: at})
    options.touch()
  }
  const record = (run: Run, event: ChatEvent): void => {
    run.events.push(event)
    wake(run)
  }
  const recordSend = (sessionId: string, messages: readonly unknown[]): ChatMessage[] => {
    const turn = readSentTurn(messages)
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
        title: request.title ?? call.toolName,
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
  const next = async (): Promise<FakeReply> => {
    const held = script.shift()
    if (held === undefined) throw new Error('the fake engine has no reply left: script one with engine.reply(...)')
    if ('reply' in held) return held.reply
    held.started()
    await held.gate.promise
    return next()
  }
  const streamText = async (run: Run, text: string, messageId: string): Promise<void> => {
    record(run, {type: ChatEventType.TEXT_MESSAGE_START, messageId, role: 'assistant'})
    for (const delta of textChunks(text, options.tokensPerSecond)) {
      if (options.tokensPerSecond !== undefined) await pause(1000 / options.tokensPerSecond, run.stopped.signal)
      if (run.stopped.signal.aborted) return
      record(run, {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId, delta})
    }
    record(run, {type: ChatEventType.TEXT_MESSAGE_END, messageId})
  }
  const finish = (
    turn: Turn,
    phase: 'completed' | 'failed' | 'aborted',
    last: ChatEvent | undefined,
    error: string | null,
  ): true => {
    const {run, messageId} = turn
    record(run, lifecycle(run, phase, error))
    if (last !== undefined) record(run, last)
    const history = options.history.get(run.sessionId) ?? []
    const message: ChatMessage = {id: messageId, role: 'assistant', parts: assistantParts(turn.played)}
    options.history.set(run.sessionId, [
      ...history,
      phase === 'aborted' ? {...message, metadata: STOPPED_METADATA} : message,
    ])
    const harnessId = options.sessions.get(run.sessionId)?.harnessKind
    if (harnessId !== undefined) harnesses.set(messageId, harnessId)
    run.done = true
    wake(run)
    setRunning(run.sessionId, false)
    return true
  }
  const stopTurn = async (turn: Turn, unanswered?: Extract<FakeReply, {kind: 'toolCall'}>): Promise<true> => {
    await savedToDisk()
    if (unanswered !== undefined) {
      turn.played.push({kind: 'interrupted', id: unanswered.id, name: unanswered.name, input: unanswered.input})
      record(turn.run, interruptedEvent(unanswered.id, turn.messageId))
    }
    return finish(turn, 'aborted', undefined, null)
  }
  const hang = async (turn: Turn): Promise<true> => {
    await aborted(turn.run.stopped.signal)
    return stopTurn(turn)
  }
  const fail = (turn: Turn, reply: Extract<FakeReply, {kind: 'failAfter'}>): true => {
    const error: ChatEvent =
      reply.code === undefined
        ? {type: ChatEventType.RUN_ERROR, message: reply.message}
        : {type: ChatEventType.RUN_ERROR, message: reply.message, code: reply.code}
    return finish(turn, 'failed', error, reply.message)
  }
  const say = async (turn: Turn, reply: Extract<FakeReply, {kind: 'text'}>): Promise<true> => {
    const {run} = turn
    await streamText(run, reply.text, turn.messageId)
    if (run.stopped.signal.aborted) return stopTurn(turn)
    turn.played.push(reply)
    return finish(
      turn,
      'completed',
      {type: ChatEventType.RUN_FINISHED, threadId: run.sessionId, runId: run.id, finishReason: 'stop'},
      null,
    )
  }
  const callTool = async (turn: Turn, reply: Extract<FakeReply, {kind: 'toolCall'}>): Promise<boolean> => {
    const {run, messageId} = turn
    toolCallEvents(reply, messageId).forEach((event) => record(run, event))
    const asked = options.tools?.[reply.name]?.ask
    if (asked !== undefined) {
      const call = {toolCallId: reply.id, toolName: reply.name, input: reply.input, runId: run.id}
      const decision = await ask(run.sessionId, call, asked, run.stopped.signal)
      if (run.stopped.signal.aborted) return stopTurn(turn, reply)
      if (decision === 'reject') {
        turn.played.push({kind: 'denied', id: reply.id, name: reply.name, input: reply.input})
        record(run, deniedEvent(reply.id, messageId))
        return false
      }
    }
    const settled = isLater(reply.result) ? reply.result() : reply.result
    const result: unknown = await Promise.race([settled, aborted(run.stopped.signal)])
    if (run.stopped.signal.aborted) return stopTurn(turn, reply)
    turn.played.push({...reply, result})
    record(run, toolResultEvent(reply, result, messageId))
    return false
  }
  const playReply = (turn: Turn, reply: FakeReply): Promisable<boolean> => {
    if (reply.kind === 'hang') return hang(turn)
    if (reply.kind === 'failAfter') return fail(turn, reply)
    if (reply.kind === 'text') return say(turn, reply)
    return callTool(turn, reply)
  }
  const play = async (run: Run): Promise<void> => {
    const turn: Turn = {run, messageId: `msg_${crypto.randomUUID()}`, played: []}
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
  const saveOutside = (sessionId: string, message: ChatMessage): void => {
    const history = options.history.get(sessionId) ?? []
    const index = history.findIndex((saved) => saved.id === message.id)
    options.history.set(sessionId, index < 0 ? [...history, message] : history.with(index, message))
  }
  const outsideCall = async (agent: FakeOutsideAgent, name: string, input: unknown): Promise<FakeOutsideReply> => {
    const tool = options.tools?.[name]
    if (tool === undefined) return unknownTool(name)
    const sessionId = agent.session ?? noOutsideSession()
    const callId = `call_${crypto.randomUUID().replaceAll('-', '')}`
    const childId = `${callId}_${name}`
    const messageId = outsideCallMessageId(callId)
    const marker = {conciv: {origin: 'hub' as const, client: agent.client ?? null, run: callId}}
    const push = sessionPush(sessionId)
    const parts: ChatMessage['parts'] = []
    const save = (): void => saveOutside(sessionId, {id: messageId, role: 'assistant', parts: [...parts]})
    const start = Date.now()
    const begin = (toolCallId: string, toolName: string, args: unknown, parent?: string): void => {
      const metadata = {...marker, time: {start}, ...(parent === undefined ? {} : {parentToolCallId: parent})}
      push.push({
        type: ChatEventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: toolName,
        parentMessageId: messageId,
        metadata,
      })
      push.push({type: ChatEventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(args)})
      push.push({type: ChatEventType.TOOL_CALL_END, toolCallId, metadata: marker})
      parts.push({
        type: 'tool-call',
        id: toolCallId,
        name: toolName,
        arguments: JSON.stringify(args),
        input: args,
        state: 'input-complete',
        metadata,
      })
      save()
    }
    const end = (toolCallId: string, value: unknown, denied: boolean): void => {
      const time = {start, end: Date.now()}
      const content = JSON.stringify(value)
      push.push(
        denied
          ? deniedEvent(toolCallId, messageId, {...marker, time})
          : {type: ChatEventType.TOOL_CALL_RESULT, messageId, toolCallId, content, metadata: {...marker, time}},
      )
      parts.push(
        denied
          ? {type: 'tool-result', toolCallId, content, state: 'error', outcome: 'denied'}
          : {type: 'tool-result', toolCallId, content, state: 'complete'},
      )
      save()
    }
    push.push({type: ChatEventType.RUN_STARTED, runId: `mirror-${callId}`, threadId: sessionId})
    begin(callId, 'execute_typescript', {typescriptCode: `return await external_${name}(${JSON.stringify(input)})`})
    begin(childId, name, input, callId)
    const decision =
      tool.ask === undefined
        ? 'once'
        : await ask(
            sessionId,
            {toolCallId: childId, toolName: name, input, runId: null},
            tool.ask,
            new AbortController().signal,
          )
    const finished = (): void =>
      push.push({
        type: ChatEventType.RUN_FINISHED,
        runId: `mirror-${callId}`,
        threadId: sessionId,
        finishReason: 'stop',
      })
    if (decision === 'reject') {
      end(childId, {error: NOT_APPROVED}, true)
      end(callId, {success: false, error: {message: NOT_APPROVED}}, true)
      finished()
      return outsideText(NOT_APPROVED, true)
    }
    const value: unknown = (await tool.run?.(input)) ?? {}
    end(childId, value, false)
    end(callId, {success: true, result: value}, false)
    finished()
    return outsideText(JSON.stringify(value))
  }
  const synthetic = (sessionId: string, notice: FakeSynthetic): void => {
    const history = options.history.get(sessionId) ?? []
    const message: ChatMessage = {
      id: `msg_${crypto.randomUUID()}`,
      role: 'user',
      parts: [{type: 'text', content: notice.text}],
      metadata: {conciv: {synthetic: {description: notice.description}}},
    }
    options.history.set(sessionId, [...history, message])
    const run: Run = {
      id: `run_${crypto.randomUUID()}`,
      sessionId,
      startedAt: Date.now(),
      events: [],
      waiting: new Set(),
      stopped: new AbortController(),
      done: false,
    }
    runs.set(run.id, run)
    void play(run)
    sessionPush(sessionId).push(sessionRunEvent.create({runId: run.id}))
  }
  return {
    synthetic,
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
      send: async (
        {sessionId, runId, messages}: {sessionId: string; runId: string; messages: unknown[]},
        call: Call,
      ) => {
        const turn = recordSend(sessionId, messages)
        const history = options.history.get(sessionId) ?? []
        const ids = new Set(history.map((message) => message.id))
        options.history.set(sessionId, [...history, ...turn.filter((message) => !ids.has(message.id))])
        const run: Run = {
          id: runId,
          sessionId,
          startedAt: Date.now(),
          events: [],
          waiting: new Set(),
          stopped: new AbortController(),
          done: false,
        }
        runs.set(runId, run)
        const live = follow(run, call.signal)
        void play(run)
        return live
      },
      join: ({runId}: {runId: string}, call: Call) => {
        const run = runs.get(runId)
        if (run === undefined) return noEvents()
        return follow(run, call.signal)
      },
      hydrate: ({sessionId}: {sessionId: string}) => {
        const active = [...runs.values()].find((run) => run.sessionId === sessionId && !run.done)
        const messages = options.history.get(sessionId) ?? []
        return {
          messages,
          messageHarness: Object.fromEntries(
            messages.flatMap((message) => {
              const harnessId = harnesses.get(message.id)
              return harnessId === undefined ? [] : [[message.id, harnessId]]
            }),
          ),
          activeRun: active === undefined ? null : {runId: active.id},
          lastRun: null,
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
    },
  }
}

function createSettings(initial: FakeEngineOptions['settings']) {
  const snapshots = new Map<string, SettingsSnapshot>()
  const changes = channel<{key: string; snapshot: SettingsSnapshot}>()
  const settingsKey = (input: {scope: string; namespace: string}): string => `${input.scope}:${input.namespace}`
  const read = (input: {scope: string; namespace: string}): SettingsSnapshot => {
    const key = settingsKey(input)
    const found = snapshots.get(key) ?? {generation: 'fake', version: 0, value: {...initial?.[key]}}
    snapshots.set(key, found)
    return found
  }
  const write = (input: {scope: string; namespace: string}, value: Record<string, unknown>): SettingsSnapshot => {
    const snapshot = {generation: 'fake', version: read(input).version + 1, value}
    snapshots.set(settingsKey(input), snapshot)
    changes.push({key: settingsKey(input), snapshot})
    return snapshot
  }
  return {
    all: (input: {scope: 'global' | 'project'; namespace: string}) => read(input),
    set: (input: {scope: 'global' | 'project'; namespace: string; key: string; value: unknown}) =>
      write(input, {...read(input).value, [input.key]: input.value}),
    delete: (input: {scope: 'global' | 'project'; namespace: string; key: string}) => {
      const {[input.key]: _removed, ...kept} = read(input).value
      return write(input, kept)
    },
    changes: async function* (input: {scope: 'global' | 'project'; namespace: string}, call: Call) {
      yield read(input)
      for await (const change of changes.read(call.signal)) if (change.key === settingsKey(input)) yield change.snapshot
    },
  }
}

function sessionNotFound(): never {
  throw new ORPCError('NOT_FOUND', {message: 'session not found'})
}

type Publish = (type: string, data: Record<string, unknown>) => void

function createSessions(initial: readonly FakeSession[], publish: Publish) {
  const sessions = new Map<string, SessionMeta>()
  const history = new Map<string, ChatMessage[]>()
  const markers: MarkerRow[] = []
  const changes = channel<{version: number}>()
  const version = {current: 0}
  const clock = {last: 0}
  const now = (): number => {
    clock.last = Math.max(Date.now(), clock.last + 1)
    return clock.last
  }
  initial.forEach((session, index) => {
    sessions.set(session.id, sessionMeta(session, initial.length - index))
    history.set(session.id, [...(session.messages ?? [])])
  })
  const touch = (): void => {
    version.current += 1
    changes.push({version: version.current})
  }
  const found = (sessionId: string): SessionMeta => sessions.get(sessionId) ?? sessionNotFound()
  const update = (sessionId: string, patch: Partial<SessionMeta>): SessionMeta => {
    const next = {...found(sessionId), ...patch}
    sessions.set(sessionId, next)
    touch()
    return next
  }
  const create = (id: SessionId = makeSessionId()): {sessionId: SessionId; session: SessionMeta} => {
    const meta = sessionMeta({id}, now())
    sessions.set(meta.id, meta)
    history.set(meta.id, [])
    markers.push({id: `mrk_${crypto.randomUUID()}`, sessionId: meta.id, afterMessageId: null, kind: 'new'})
    touch()
    return {sessionId: meta.id, session: meta}
  }
  const listed = (includeHidden: boolean | undefined): SessionMeta[] =>
    [...sessions.values()]
      .filter((session) => includeHidden === true || !session.hidden)
      .toSorted((left, right) => right.updatedAt - left.updatedAt)
  return {
    sessions,
    history,
    touch,
    now,
    markers: ({sessionId}: {sessionId: string}) => markers.filter((marker) => marker.sessionId === sessionId),
    handlers: {
      list: (input: {includeHidden?: boolean | undefined}) => ({sessions: listed(input.includeHidden), next: null}),
      search: (input: {term: string}) => ({
        sessions: listed(false)
          .filter((session) => session.title.toLowerCase().includes(input.term.toLowerCase()))
          .map((session) => ({...session, excerpt: null, matched: [], cwd: null, resume: null, preview: null})),
        next: null,
      }),
      changes: async function* (_input: unknown, call: Call) {
        yield {version: version.current}
        yield* changes.read(call.signal)
      },
      get: ({sessionId}: {sessionId: string}) => found(sessionId),
      preview: (input: {sessionId: string} | {nativeId: string}) => ({
        messages: 'sessionId' in input ? (history.get(input.sessionId) ?? []) : [],
        earlier: null,
      }),
      create: () => create(),
      resolve: ({id}: {id?: string | undefined}) => {
        const known = id === undefined ? listed(false)[0] : sessions.get(id)
        if (known?.hidden === true) return sessionNotFound()
        if (known !== undefined) return {sessionId: known.id}
        if (id === undefined) return {sessionId: create().sessionId}
        if (!isSessionId(id)) return sessionNotFound()
        return {sessionId: create(id).sessionId}
      },
      rename: ({sessionId, title}: {sessionId: string; title: string}) => {
        const renamed = update(sessionId, {title, updatedAt: now()}).title
        publish('session.renamed', {sessionID: sessionId, title: renamed})
        return {title: renamed}
      },
      delete: ({sessionId}: {sessionId: string}) => {
        update(sessionId, {hidden: true, updatedAt: now()})
        publish('session.deleted', {sessionID: sessionId})
        return {ok: true as const}
      },
      model: ({sessionId, model}: {sessionId: string; model: string}) => ({
        model: update(sessionId, {model}).model ?? model,
      }),
      effort: ({sessionId, effort}: {sessionId: string; effort: SessionMeta['effort']}) => ({
        effort: update(sessionId, {effort}).effort,
      }),
      switchHarness: ({
        sessionId,
        harnessId,
        model,
      }: {
        sessionId: string
        harnessId: string
        model?: string | undefined
      }) => {
        update(sessionId, model === undefined ? {harnessKind: harnessId} : {harnessKind: harnessId, model})
        return {harnessId}
      },
    },
  }
}

function makeSessionId(): SessionId {
  const id = `ses_${crypto.randomUUID().replaceAll('-', '')}`
  if (!isSessionId(id)) throw new Error(`the fake engine made a session id the schema refuses: ${id}`)
  return id
}

function pluginCall(plugins: FakeEngineOptions['plugins'], unanswered: string[], emit: FakePluginCall['emit']) {
  return ({rpcId, method, input}: {rpcId: string; method: string; input?: unknown}, call: Call): unknown => {
    const handler = plugins?.[rpcId]?.[method]
    if (handler === undefined) return notImplemented(`plugin.call ${rpcId}.${method}`, unanswered)
    return handler(input, {emit, signal: call.signal})
  }
}

function isLater(result: unknown): result is () => unknown {
  return typeof result === 'function'
}

function makeLoginCode(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)
    .padStart(6, '0')
    .slice(-6)
}

const MAX_CODE_FAILURES = 5

function issueCode(access: Access): string {
  const code = makeLoginCode()
  access.code = code
  access.failures = 0
  return code
}

function unauthorizedCall(): never {
  throw new ORPCError('UNAUTHORIZED', {message: 'this browser is not authorized'})
}

function refusedTrust(error: unknown): boolean {
  return error instanceof ORPCError && error.status === 401
}

type Access = {
  required: string | undefined
  code: string | undefined
  failures: number
  readonly links: Set<AbortController>
  readonly connections: Set<FakeConnection>
  up: PromiseWithResolvers<void> | undefined
}

type FakeConnection = {
  readonly connection: EngineConnection
  readonly revoke: () => void
  readonly reachable: (reachable: boolean) => void
}

function accepts(access: Access, token: string | undefined): boolean {
  return access.required === undefined || token === access.required
}

function fakeConnection(
  router: AnyRouter,
  access: Access,
  version: () => string | null,
  options: FakeConnectOptions,
): FakeConnection {
  const state: {current: ConnectionState} = {current: {...createConnectionState(options.token), socket: 'open'}}
  const trustListeners = new Set<TrustListener>()
  const reachabilityListeners = new Set<ReachabilityListener>()
  const dispatch = (event: ConnectionEvent): void => {
    const next = transitionConnection(state.current, event)
    state.current = {...next.state, socket: 'open'}
    for (const effect of next.effects) {
      if (effect.type !== 'publish') continue
      const signal = effect.signal
      if (signal.type === 'status') trustListeners.forEach((listener) => listener(signal.status, signal.previous))
      else reachabilityListeners.forEach((listener) => listener(signal.reachable))
    }
  }
  const invoke = async (path: readonly string[], input: unknown, signal: AbortSignal | undefined): Promise<unknown> => {
    const procedure = lookup(router, path)
    if (!isProcedure(procedure)) throw new ORPCError('NOT_FOUND', {message: `no procedure at ${path.join('.')}`})
    await access.up?.promise
    const sent = state.current.token
    if (path[0] !== 'auth' && !accepts(access, sent)) {
      dispatch({type: 'unauthorized', token: sent})
      unauthorizedCall()
    }
    const lifetime = new AbortController()
    access.links.add(lifetime)
    const ended = signal === undefined ? lifetime.signal : AbortSignal.any([signal, lifetime.signal])
    ended.addEventListener('abort', () => access.links.delete(lifetime), {once: true})
    try {
      const result: unknown = await callProcedure(procedure, input, {signal: ended})
      if (!isAsyncIterable(result)) access.links.delete(lifetime)
      return result
    } catch (error) {
      access.links.delete(lifetime)
      if (refusedTrust(error)) dispatch({type: 'unauthorized', token: sent})
      throw error
    }
  }
  const link: ClientLink<RpcClientContext> = {
    call: (path, input, callOptions) => invoke(path, input, callOptions.signal),
  }
  const auth = createORPCClient<RpcClient>(link).auth
  const trustWithToken = async (token: string): Promise<boolean> => {
    const {trusted} = await auth.trust({token})
    dispatch(trusted ? {type: 'trusted', token} : {type: 'trust-refused', token})
    return trusted
  }
  const sourced = async (): Promise<string | undefined> =>
    options.tokenSource === undefined ? undefined : options.tokenSource().catch(() => undefined)
  const requestTrust = async (storedOnly: boolean): Promise<boolean> => {
    if (state.current.trust === 'trusted') return true
    const held = state.current.token ?? ''
    if (options.tokenSource === undefined) return trustWithToken(held)
    const {trusted} = await auth.trust({token: held})
    if (trusted) return trustWithToken(held)
    if (storedOnly) return false
    const token = await sourced()
    if (token === undefined) return trustWithToken(held)
    return trustWithToken(token)
  }
  const trust: EngineTrust = {
    isTrusted: () => state.current.trust === 'trusted',
    status: () => state.current.trust,
    subscribe: (listener) => {
      trustListeners.add(listener)
      return () => trustListeners.delete(listener)
    },
    requestTrust: (requested = {}) => requestTrust(requested.storedOnly ?? false),
    requestTrustWithToken: trustWithToken,
    requestTrustWithCode: async (code) => {
      const result = await auth.exchange({code})
      if ('token' in result) dispatch({type: 'trusted', token: result.token})
      return result
    },
    requestAuthCode: async (requested = {}) => {
      await auth.requestCode({reissue: requested.reissue ?? false})
    },
  }
  return {
    connection: {
      link,
      trust,
      reset: () => undefined,
      subscribeReachability: (listener) => {
        reachabilityListeners.add(listener)
        return () => reachabilityListeners.delete(listener)
      },
      version: async () => version(),
    },
    revoke: () => dispatch({type: 'socket-closed', attempt: state.current.attempt, code: REVOKED_SOCKET_CLOSE_CODE}),
    reachable: (reachable) => reachabilityListeners.forEach((listener) => listener(reachable)),
  }
}

function isAsyncIterable(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

function endLinks(access: Access): void {
  const links = [...access.links]
  access.links.clear()
  links.forEach((lifetime) => lifetime.abort())
}

export function createFakeEngine(options: FakeEngineOptions = {}): FakeEngine {
  const directory = options.directory ?? '/workspace'
  const location = {directory}
  const unanswered: string[] = []
  const events = channel<{
    id: string
    type: string
    created: number
    data: Record<string, unknown>
    location: {directory: string}
  }>()
  const publish: Publish = (type, data) =>
    events.push({id: crypto.randomUUID(), type, created: Date.now(), data, location})
  const store = createSessions(options.sessions ?? [], publish)
  const chat = createChat({
    sessions: store.sessions,
    history: store.history,
    touch: store.touch,
    now: store.now,
    tools: options.tools,
    tokensPerSecond: options.tokensPerSecond,
  })
  const settings = createSettings(options.settings)
  const drafts = new Map<string, DraftRow>()
  const models = options.models ?? DEFAULT_MODELS
  const required = options.loggedIn === false ? (options.token ?? crypto.randomUUID()) : options.token
  const access: Access = {
    required,
    code: undefined,
    failures: 0,
    links: new Set(),
    connections: new Set(),
    up: undefined,
  }
  const reading: {engine: FakeEngineReading; version: string | null} = {
    engine: {stale: false, changed: [], tracked: [], bootedAt: 0, fingerprint: 'fake'},
    version: manifest.version,
  }
  const emit: FakePluginCall['emit'] = publish
  const issuedToken = (): string => {
    access.required ??= crypto.randomUUID()
    return access.required
  }
  const builtins: FakeEngineHandlers = {
    auth: {
      trust: ({token}) => ({trusted: accepts(access, token)}),
      requestCode: ({reissue}) => {
        if (reissue === true || access.code === undefined) issueCode(access)
        return {expiresAt: Date.now() + 60_000}
      },
      exchange: ({code}) => {
        if (access.code === undefined) return {refused: 'expired' as const}
        if (code === access.code) {
          access.code = undefined
          return {token: issuedToken()}
        }
        access.failures += 1
        if (access.failures >= MAX_CODE_FAILURES) access.code = undefined
        return {refused: 'mismatch' as const}
      },
    },
    sessions: store.handlers,
    settings,
    drafts: {
      get: ({sessionId}) => drafts.get(sessionId) ?? null,
      set: (row) => {
        drafts.set(row.sessionId, row)
        return {ok: true}
      },
    },
    markers: {list: store.markers},
    chat: chat.handlers,
    registry: {catalog: () => []},
    meta: {
      models: () => models,
      harnesses: () => ({
        harnesses: [
          {
            ...models.harness,
            models: models.models,
            defaultModel: models.defaultModel,
            modelsFailed: false,
            login: models.login,
          },
        ],
        defaultHarness: models.harness.id,
      }),
      commands: () => ({commands: []}),
      tools: () => ({tools: []}),
      project: () => ({name: null, root: directory, branch: null, instructions: null}),
      engine: () => ({...reading.engine, changed: [...reading.engine.changed], tracked: [...reading.engine.tracked]}),
      hubAgents: async function* (_input, call) {
        yield {installs: [], connections: []}
        if (call.signal !== undefined) await aborted(call.signal)
      },
    },
    skill: {list: () => ({location, data: []})},
    agent: {list: () => ({location, data: []})},
    fs: {find: () => ({location, data: []})},
    plugin: {call: pluginCall(options.plugins, unanswered, emit), list: () => ({location, data: []})},
    event: {
      subscribe: async function* (_input, call) {
        yield {id: crypto.randomUUID(), type: 'server.connected', data: {}}
        yield* events.read(call.signal)
      },
    },
  }
  const router = buildRouter(contract, [], [withSendRecorded(options.handlers, chat.recordSend), builtins], unanswered)
  const connect = (connectOptions: FakeConnectOptions = {}): EngineConnection => {
    const made = fakeConnection(router, access, () => reading.version, connectOptions)
    access.connections.add(made)
    return made.connection
  }
  const connection = connect({token: options.loggedIn === false ? undefined : (required ?? '')})
  const drop = (): void => {
    access.up ??= Promise.withResolvers<void>()
    access.connections.forEach((made) => made.reachable(false))
    endLinks(access)
  }
  const recover = (): void => {
    const down = access.up
    access.up = undefined
    down?.resolve()
    access.connections.forEach((made) => made.reachable(true))
  }
  return {
    apiBase: `http://engine-${crypto.randomUUID()}.fake.test`,
    directory,
    connection,
    connect,
    reply: (...replies) => chat.reply(replies),
    gate: () => chat.gate(),
    outside: (agent = {}) => chat.outside(agent),
    synthetic: (sessionId, notice) => chat.synthetic(sessionId, notice),
    emit,
    drop,
    recover,
    reconnect: () => {
      drop()
      recover()
    },
    stale: (engine) => {
      reading.engine = engine
    },
    version: (version) => {
      reading.version = version
    },
    loginCode: () => {
      return access.code ?? issueCode(access)
    },
    revokeBrowsers: () => {
      access.required = crypto.randomUUID()
      access.connections.forEach((made) => made.revoke())
      endLinks(access)
    },
    sent: () => chat.sent(),
    drafts: () => [...drafts.values()],
    unanswered: () => [...unanswered],
    dispose: () => {
      events.end()
      endLinks(access)
      access.connections.clear()
    },
  }
}
