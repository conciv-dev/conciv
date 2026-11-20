import {z} from 'zod'
import {
  chat,
  convertMessagesToModelMessages,
  defineChatMiddleware,
  EventType,
  requestRunCancel,
  RUN_CANCEL_REASON,
  StreamProcessor,
  uiMessageToModelMessages,
  withTanstackMetadata,
  type DebugConfig,
  type MetadataStore,
  type RunRecord,
  type RunStore,
  type TokenUsage,
  type ToolCall,
} from '@tanstack/ai'
import {defineLock, InMemoryLockStore, withLocks} from '@tanstack/ai/locks'
import {getPendingTurn} from '@tanstack/ai/adapter-internals'
import {defineAIPersistence, reconstructChat, withPersistence, type MessageStore} from '@tanstack/ai-persistence'
import {
  defineSandbox,
  defineSandboxPolicy,
  provideToolBridgeProvisioner,
  ToolBridgeProvisionerCapability,
  withSandbox,
  isSandboxToolCall,
} from '@tanstack/ai-sandbox'
import {makeTextAdapter, type TextAdapter} from '../adapters/adapters.js'
import {
  isRunPhaseTerminal,
  runLifecycleEvent,
  timedMessages,
  type ChatEvent,
  type RunLifecycle,
  type RunPhase,
  ChatEventType,
  toolTimeEvent,
} from '@conciv/protocol/chat-event-types'
import {type ChatMessage, type ModelMessage, CompactionMetadataSchema} from '@conciv/protocol/chat-message-types'
import type {ChatTool} from '@conciv/protocol/chat-tool-types'
import {askingToolProvisioner, type AskPermission} from './image-tool-results.js'
import {childCards, withoutChildCalls} from './child-cards.js'
import {codeModeTools, readSecretRefusal, stoppedWith} from './code-mode.js'
import type {CodeDriver} from './quickjs-thread.js'
import {createDelivery, endsTheRun, readTerminalPhase, type ChatDelivery, type Turn} from './delivery.js'
import {guardedAdapter} from './run-guard.js'
import {localSandbox} from './local-sandbox.js'
import {answeredAdapter, answeredMetadata, hookedRequest, type RequestHook} from './model-request.js'
import {cloneDeepWith, isPlainObject} from 'es-toolkit'

const COMPACTION: z.infer<typeof CompactionMetadataSchema> = {conciv: {compaction: true}}

const RunTagSchema = z.object({tanstack: z.object({run: z.object({id: z.string()})})})

const ConcivBagSchema = z.object({conciv: z.record(z.string(), z.unknown())})

function compactionStamp(messages: MessageStore) {
  return defineChatMiddleware({
    name: 'conciv-compaction-stamp',
    onChunk: (_ctx, chunk) => {
      if (
        chunk.type !== ChatEventType.TEXT_MESSAGE_START &&
        chunk.type !== ChatEventType.REASONING_MESSAGE_START &&
        chunk.type !== ChatEventType.RUN_FINISHED
      ) {
        return undefined
      }
      return {...chunk, metadata: stamped(chunk.metadata)}
    },
    onFinish: async (ctx) => {
      const stored = await messages.loadThread(ctx.threadId)
      if (!stored.some((message) => ranIn(message, ctx.runId))) return
      await messages.saveThread(
        ctx.threadId,
        stored.map((message) =>
          ranIn(message, ctx.runId) ? {...message, metadata: stamped(message.metadata)} : message,
        ),
      )
    },
  })
}

function stamped(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  const bag = ConcivBagSchema.safeParse(metadata)
  const conciv = bag.success ? bag.data.conciv : {}
  return {...metadata, conciv: {...conciv, ...COMPACTION.conciv}}
}

function ranIn(message: ModelMessage, runId: string): boolean {
  const tag = RunTagSchema.safeParse(message.metadata)
  return message.role === 'assistant' && tag.success && tag.data.tanstack.run.id === runId
}

type RecordedCall = {metadata: Record<string, unknown> | undefined; failed: boolean; startedAt?: number}

type Recorded = Map<string, RecordedCall>

const FailedResultSchema = z.union([
  z.looseObject({state: z.literal('output-error')}),
  z.looseObject({metadata: z.looseObject({tanstack: z.looseObject({state: z.literal('output-error')})})}),
])

const MetadataSchema = z.record(z.string(), z.unknown()).catch({})

function toolHistory() {
  const recorded: Recorded = new Map()
  const restore = (ctx: {messages: ReadonlyArray<ModelMessage>}) => {
    ctx.messages = ctx.messages.map((message) => restored(message, recorded))
  }
  return defineChatMiddleware({
    name: 'conciv-tool-history',
    onChunk: (ctx, chunk) => {
      if (chunk.type === ChatEventType.TOOL_CALL_START) {
        const startedAt = Date.now()
        const metadata = {...MetadataSchema.parse(chunk.metadata), time: {start: startedAt}}
        recorded.set(chunk.toolCallId, {metadata, failed: false, startedAt})
        return [{...chunk, metadata}]
      }
      if (chunk.type === ChatEventType.TOOL_CALL_END) {
        restore(ctx)
        return
      }
      if (chunk.type !== ChatEventType.TOOL_CALL_RESULT) return
      const call = recorded.get(chunk.toolCallId)
      const end = Date.now()
      const time = call?.startedAt === undefined ? {end} : {start: call.startedAt, end}
      recorded.set(chunk.toolCallId, {
        metadata: {...call?.metadata, time},
        failed: FailedResultSchema.safeParse(chunk).success,
        startedAt: call?.startedAt,
      })
      restore(ctx)
      return [chunk, toolTimeEvent.create({toolCallId: chunk.toolCallId, time})]
    },
    onIteration: restore,
  })
}

function restored(message: ModelMessage, recorded: Recorded): ModelMessage {
  if (message.role === 'tool') return restoredResult(message, recorded)
  const calls = message.toolCalls ?? []
  const [first] = calls
  if (first === undefined) return message
  const toolCalls = calls.map((call) => withRecordedMetadata(call, recorded))
  if (!calls.every(isSandboxToolCall)) return {...message, toolCalls}
  return {...message, id: message.id ?? `${first.id}-call`, toolCalls}
}

function restoredResult(message: ModelMessage, recorded: Recorded): ModelMessage {
  if (message.error !== undefined || message.toolCallId === undefined) return message
  if (recorded.get(message.toolCallId)?.failed !== true || typeof message.content !== 'string') return message
  return {...message, error: message.content}
}

function withRecordedMetadata(call: ToolCall, recorded: Recorded): ToolCall {
  const metadata = recorded.get(call.id)?.metadata
  if (metadata === undefined) return call
  return {...call, metadata: {...MetadataSchema.parse(call.metadata), ...metadata}}
}

function requestOptions(options: Record<string, unknown> | undefined): Record<string, unknown> {
  return cloneDeepWith(options ?? {}, (value) => (Array.isArray(value) || isPlainObject(value) ? undefined : value))
}

export type ChatStores = {
  messages: MessageStore & {loadMessage: (threadId: string, messageId: string) => Promise<ModelMessage | null>}
  runs: RunStore &
    Required<Pick<RunStore, 'listByThread' | 'listReclaimable'>> & {
      listRunning: () => Promise<RunRecord[]>
      known: (runId: string) => Promise<boolean>
    }
  metadata: MetadataStore
}

export type TurnTools = {
  codeMode: readonly ChatTool[]
  search: ((input: unknown) => Promise<unknown>) | null
  direct: readonly ChatTool[]
}

export type TurnPlan = {
  adapter: TextAdapter
  modelOptions?: Record<string, unknown>
  systemPrompts: () => Promise<readonly string[]>
  context: RequestHook
  tools: () => Promise<TurnTools>
  setup: () => Promise<void>
  prompt: (message: ModelMessage, signal: AbortSignal) => Promise<ModelMessage>
  expand: (messages: ModelMessage[]) => Promise<ModelMessage[]>
  providerMessages: (messages: ModelMessage[]) => Promise<ModelMessage[]>
  chunk: (chunk: ChatEvent) => Promise<ChatEvent[]>
}

export type TurnHooks = {
  admit: (turn: Turn) => Promise<void>
  plan: (turn: Turn, signal: AbortSignal) => Promise<TurnPlan>
  usage: (turn: Turn, usage: TokenUsage) => Promise<void>
  end: (turn: Turn, run: RunLifecycle) => Promise<void>
  started: (turn: Turn) => void
}

export type ChatServerConfig = {
  stores: ChatStores
  sandbox: {dir: string; groupExitTimeoutMs?: number}
  hooks: TurnHooks
  codeModeResult: (value: unknown) => unknown
  startTimeoutMs: number
  firstOutputTimeoutMs: number
  log: (message: string) => void
  driver: CodeDriver | null
  askPermission: AskPermission
}

const ThreadPageSchema = z.discriminatedUnion('truncated', [
  z.object({truncated: z.literal(false)}),
  z.object({truncated: z.literal(true), cursor: z.string()}),
])

type ChatThreadWindow = {limit?: number; before?: string}

export type ChatThread = {
  messages: ChatMessage[]
  activeRun: {runId: string} | null
  lastRun: RunLifecycle | null
  page?: z.infer<typeof ThreadPageSchema>
}

export type CodeDiscovery = {description: string; run: (toolNames: string[]) => Promise<unknown>}

export type CodeRunner = {
  run: (code: string, emit: CustomEventSink, signal?: AbortSignal) => Promise<unknown>
  discover: CodeDiscovery | null
}

export type CustomEventSink = (name: string, value: Record<string, unknown>) => void

export type ChatServer = ChatDelivery & {
  stop: (threadId: string, runIds?: readonly string[]) => Promise<boolean>
  endRuns: (threadId: string) => Promise<void>
  endAllRuns: () => Promise<void>
  settled: (threadId: string) => Promise<void>
  driving: (threadId: string) => boolean
  hydrate: (threadId: string, window?: ChatThreadWindow) => Promise<ChatThread>
  record: (threadId: string, chunks: readonly ChatEvent[]) => Promise<void>
  codeRunner: (
    codeMode: readonly ChatTool[],
    search: ((input: unknown) => Promise<unknown>) | null,
  ) => CodeRunner | null
}

const PHASE_BY_STATUS: Record<RunRecord['status'], RunPhase> = {
  running: 'running',
  interrupted: 'running',
  completed: 'completed',
  failed: 'failed',
  aborted: 'aborted',
}

function endedPhase(phase: RunPhase, cancelRequested: boolean | undefined): RunPhase {
  return phase === 'completed' && cancelRequested === true ? 'aborted' : phase
}

function buildLifecycle(record: RunRecord): RunLifecycle {
  const stopping = record.status === 'running' && record.cancelRequested === true
  return {
    runId: record.runId,
    phase: stopping ? 'stopping' : endedPhase(PHASE_BY_STATUS[record.status], record.cancelRequested),
    startedAt: record.startedAt,
    finishedAt: record.finishedAt ?? null,
    serverNow: Date.now(),
    error: record.error?.message ?? null,
  }
}

function failedPlan(error: unknown): TurnPlan {
  const message = error instanceof Error ? error.message : String(error)
  return {
    adapter: makeTextAdapter('failed-launch', async function* () {
      yield {type: EventType.RUN_ERROR, message, timestamp: Date.now()}
    }),
    systemPrompts: async () => [],
    context: async (request) => request,
    tools: async () => ({codeMode: [], search: null, direct: []}),
    setup: async () => undefined,
    prompt: async (user) => user,
    expand: async (messages) => messages,
    providerMessages: async (messages) => messages,
    chunk: async (chunk) => [chunk],
  }
}

async function planned(hooks: TurnHooks, turn: Turn, signal: AbortSignal): Promise<TurnPlan> {
  try {
    return await hooks.plan(turn, signal)
  } catch (error) {
    return failedPlan(error)
  }
}

function withLastUser(messages: ModelMessage[], user: ModelMessage | undefined): ModelMessage[] {
  const index = messages.findLastIndex((message) => message.role === 'user')
  if (index === -1 || user === undefined) return messages
  return [...messages.slice(0, index), user, ...messages.slice(index + 1)]
}

export function approvalDenied(name: string): Error {
  return new Error(`The user denied running tool "${name}". Do not retry it; continue without it.`)
}

type OfferedTools = {tools: ChatTool[]; preface: string | null}

function buildDiscovery(tool: ChatTool | null): CodeDiscovery | null {
  const execute = tool?.execute
  if (tool === null || !execute) return null
  return {description: tool.description, run: (toolNames) => Promise.resolve(execute({toolNames}))}
}

const ReconstructedSchema = z.object({
  messages: z.array(z.custom<ChatMessage>((value) => typeof value === 'object' && value !== null)),
  activeRun: z.object({runId: z.string()}).nullable(),
  page: ThreadPageSchema.optional(),
})

function threadUrl(threadId: string, window: ChatThreadWindow): URL {
  const url = new URL('http://conciv.local/chat')
  url.searchParams.set('threadId', threadId)
  if (window.limit !== undefined) url.searchParams.set('limit', String(window.limit))
  if (window.before !== undefined) url.searchParams.set('before', window.before)
  return url
}

async function sweepAbandonedRuns(runs: ChatStores['runs'], hooks: TurnHooks): Promise<void> {
  const now = Date.now()
  for (const record of await runs.listRunning()) {
    await runs.update(record.runId, {status: 'aborted', finishedAt: now})
    const turn: Turn = {threadId: record.threadId, runId: record.runId, kind: 'chat'}
    await hooks.end(turn, buildLifecycle({...record, status: 'aborted', finishedAt: now}))
  }
}

type LiveRun = {
  threadId: string
  controller: AbortController
  ending: AbortController
  settled: PromiseWithResolvers<void>
  stopping: boolean
}

type RunMessages = {full: ModelMessage[]}

function isSubagentChunk(chunk: ChatEvent): boolean {
  return 'subagentRunId' in chunk && chunk.subagentRunId !== undefined
}

function timedProcessor(): StreamProcessor {
  const processor: StreamProcessor = new StreamProcessor({
    events: {
      onCustomEvent: (name, value) => {
        const timed = timedMessages(processor.getMessages(), name, value)
        if (timed !== null) processor.setMessages(timed)
      },
    },
  })
  return processor
}

function followRun(processor: StreamProcessor, chunk: ChatEvent): void {
  if (isSubagentChunk(chunk) || chunk.type === EventType.MESSAGES_SNAPSHOT) return
  processor.processChunk(chunk)
}

function storedToolCallIds(stored: readonly ModelMessage[]): Set<string> {
  return new Set(
    stored.flatMap((message) => [
      ...(message.toolCalls ?? []).map((call) => call.id),
      ...(message.toolCallId === undefined ? [] : [message.toolCallId]),
    ]),
  )
}

function unsavedParts(message: ChatMessage, saved: ReadonlySet<string>): ChatMessage {
  return {
    ...message,
    parts: message.parts.filter((part) => {
      if (part.type === 'tool-call') return !saved.has(part.id)
      if (part.type === 'tool-result') return !saved.has(part.toolCallId)
      return true
    }),
  }
}

async function saveStoppedTurn(messages: MessageStore, threadId: string, processor: StreamProcessor): Promise<void> {
  await saveShown(messages, threadId, processor, (message) => withTanstackMetadata(message, {stopReason: 'aborted'}))
}

async function saveShown(
  messages: MessageStore,
  threadId: string,
  processor: StreamProcessor,
  finish: (message: ModelMessage) => ModelMessage,
): Promise<void> {
  const stored = await messages.loadThread(threadId)
  const saved = storedToolCallIds(stored)
  const shown = processor
    .getMessages()
    .filter((message) => message.role === 'assistant')
    .map((message) => unsavedParts(message, saved))
    .filter((message) => message.parts.length > 0)
    .flatMap(uiMessageToModelMessages)
    .map(finish)
  if (shown.length === 0) return
  const replaced = new Set(shown.flatMap((message) => (message.id === undefined ? [] : [message.id])))
  const kept = stored.filter((message) => message.id === undefined || !replaced.has(message.id))
  await messages.saveThread(threadId, [...kept, ...shown])
}

function untilAborted<Value>(work: Promise<Value>, signal: AbortSignal): Promise<Value> {
  const aborted = Promise.withResolvers<never>()
  const abort = () => aborted.reject(signal.reason)
  if (signal.aborted) abort()
  signal.addEventListener('abort', abort, {once: true})
  return Promise.race([work, aborted.promise]).finally(() => signal.removeEventListener('abort', abort))
}

function silentCategories(logger: DebugConfig['logger']): DebugConfig {
  return {
    logger,
    errors: true,
    provider: false,
    output: false,
    middleware: false,
    tools: false,
    agentLoop: false,
    config: false,
    request: false,
    sandbox: false,
  }
}

async function* endedWithItsRecord(
  stream: AsyncIterable<ChatEvent>,
  recorded: () => Promise<RunLifecycle | null>,
): AsyncGenerator<ChatEvent> {
  const seen = {ended: false}
  for await (const chunk of stream) {
    seen.ended ||= endsTheRun(chunk)
    yield chunk
  }
  if (seen.ended) return
  const lifecycle = await recorded()
  if (lifecycle === null || !isRunPhaseTerminal(lifecycle.phase)) return
  yield runLifecycleEvent.create(lifecycle)
}

function throwRejected(outcomes: readonly PromiseSettledResult<unknown>[], message: string): void {
  const failures = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []))
  if (failures.length > 0) throw new AggregateError(failures, message)
}

export async function createChatServer(config: ChatServerConfig): Promise<ChatServer> {
  const {stores, hooks} = config
  const persistence = defineAIPersistence({stores})
  const processLocks = new InMemoryLockStore()
  const locks = defineLock({withLock: (key, work) => processLocks.withLock(key, work)})
  const savingShown = (threadId: string, work: () => Promise<void>): Promise<void> =>
    processLocks.withLock(`conciv-shown:${threadId}`, work)
  const live = new Map<string, LiveRun>()
  const debug = silentCategories({
    debug: () => undefined,
    info: () => undefined,
    warn: (message) => config.log(`[ai] ${message}`),
    error: (message, meta) => config.log(`[ai] ${message}: ${String(meta?.error)}`),
  })
  const sandbox = defineSandbox({
    id: 'conciv',
    provider: localSandbox(config.sandbox),
    policy: defineSandboxPolicy({default: 'ask'}),
    fileEvents: false,
    lifecycle: {reuse: 'thread', destroyOnComplete: false},
  })
  const driver = config.driver
  await sweepAbandonedRuns(stores.runs, hooks)

  const lifecycleChunk = (lifecycle: RunLifecycle): ChatEvent => runLifecycleEvent.create(lifecycle)

  const recordLifecycle = async (runId: string): Promise<RunLifecycle | null> => {
    const record = await stores.runs.get(runId)
    return record === null ? null : buildLifecycle(record)
  }

  const terminalChunk = async (runId: string, phase: RunPhase, error: string | null): Promise<ChatEvent> => {
    const record = await stores.runs.get(runId)
    const now = Date.now()
    return lifecycleChunk({
      runId,
      phase: endedPhase(phase, record?.cancelRequested),
      startedAt: record?.startedAt ?? now,
      finishedAt: now,
      serverNow: now,
      error,
    })
  }

  const filterLiveRuns = (threadId: string, except?: string): [string, LiveRun][] =>
    [...live.entries()].filter(([runId, entry]) => entry.threadId === threadId && runId !== except)

  const endRuns = async (threadId: string, except?: string): Promise<void> => {
    const cancels = await Promise.allSettled(
      filterLiveRuns(threadId, except).map(async ([runId, entry]) => {
        entry.stopping = true
        try {
          await requestRunCancel(stores.runs, runId)
        } finally {
          entry.ending.abort({
            type: EventType.RUN_FINISHED,
            threadId,
            runId,
            finishReason: 'stop',
            timestamp: Date.now(),
          })
        }
      }),
    )
    throwRejected(cancels, `conciv: cancelling the runs of thread ${threadId} failed`)
  }

  const endThreadRuns = async (threadId: string): Promise<void> => {
    const running = filterLiveRuns(threadId)
    const interrupted = endRuns(threadId).finally(() => {
      for (const [, entry] of running) entry.controller.abort(RUN_CANCEL_REASON)
    })
    const ending = running.map(([, entry]) => entry.settled.promise)
    const [cancelled] = await Promise.allSettled([interrupted, Promise.all(ending)])
    if (cancelled.status === 'rejected') throw cancelled.reason
  }

  const stopPreparing = (threadId: string, runIds: readonly string[] | undefined): boolean => {
    const preparing = filterLiveRuns(threadId).filter(([runId]) => runIds === undefined || runIds.includes(runId))
    for (const [, entry] of preparing) entry.controller.abort(RUN_CANCEL_REASON)
    return preparing.length > 0
  }

  function concivTurn(
    turn: Turn,
    plan: TurnPlan,
    view: RunMessages,
    entry: LiveRun,
    offered: () => Promise<OfferedTools>,
  ) {
    const failure: {message: string | null} = {message: null}
    const prepared: {sent: number; provider: ModelMessage[]; system: readonly string[]} = {
      sent: 0,
      provider: [],
      system: [],
    }
    const shown = timedProcessor()
    const settle = async (): Promise<void> => {
      try {
        const lifecycle = await recordLifecycle(turn.runId)
        if (lifecycle !== null) await hooks.end(turn, lifecycle)
      } catch (error) {
        config.log(`[ai] ending run ${turn.runId} failed: ${String(error)}`)
      } finally {
        live.delete(turn.runId)
        entry.settled.resolve()
      }
    }
    return defineChatMiddleware({
      name: 'conciv-turn',
      onConfig: async (ctx, current) => {
        if (ctx.phase === 'beforeModel') {
          const next = await offered()
          const request = await hookedRequest(
            (draft, signal) => untilAborted(plan.context(draft, signal), signal),
            {
              system: [...prepared.system, ...(next.preface === null ? [] : [next.preface])],
              messages: [...prepared.provider, ...withoutChildCalls(current.messages).slice(prepared.sent)],
              options: requestOptions(plan.modelOptions),
              tools: next.tools,
            },
            entry.controller.signal,
          )
          return {
            messages: [...ctx.messages],
            providerMessages: request.messages,
            systemPrompts: request.system,
            tools: request.tools,
            modelOptions: request.options,
            metadata: answeredMetadata(current.metadata, request.result),
          }
        }
        if (ctx.phase !== 'init') return
        await plan.setup()
        const next = await offered()
        prepared.system = await plan.systemPrompts()
        const systemPrompts = [
          ...prepared.system,
          ...(next.preface === null ? [] : [next.preface]),
          ...current.systemPrompts,
        ]
        const expanded = await plan.expand(withoutChildCalls(current.messages))
        prepared.sent = expanded.length
        prepared.provider = await plan.providerMessages(expanded)
        return {
          messages: withLastUser(
            view.full,
            expanded.findLast((message) => message.role === 'user'),
          ),
          providerMessages: prepared.provider,
          systemPrompts,
          tools: next.tools,
        }
      },
      onChunk: async (_ctx, chunk) => {
        followRun(shown, chunk)
        const shaped = await plan.chunk(chunk)
        if (chunk.type === EventType.RUN_STARTED) {
          const lifecycle = await recordLifecycle(turn.runId)
          if (lifecycle === null) return shaped
          return [...shaped, lifecycleChunk(lifecycle)]
        }
        const phase = readTerminalPhase(chunk)
        if (phase === null) return shaped
        const error = chunk.type === EventType.RUN_ERROR ? chunk.message : null
        failure.message = error
        return [await terminalChunk(turn.runId, phase, error), ...shaped]
      },
      onStart: () => {
        if (!entry.controller.signal.aborted) hooks.started(turn)
      },
      onUsage: (_ctx, usage) => hooks.usage(turn, usage),
      onFinish: () => settle(),
      onError: () => settle(),
      onAbort: async () => {
        await savingShown(turn.threadId, () => saveStoppedTurn(stores.messages, turn.threadId, shown)).catch(
          (error: unknown) => config.log(`[ai] saving the stopped turn of run ${turn.runId} failed: ${String(error)}`),
        )
        if (failure.message !== null) {
          await stores.runs.update(turn.runId, {
            status: 'failed',
            finishedAt: Date.now(),
            error: {message: failure.message},
          })
        }
        await settle()
      },
    })
  }

  const promptedMessages = async (
    threadId: string,
    messages: Array<ChatMessage | ModelMessage>,
    plan: TurnPlan,
    signal: AbortSignal,
  ): Promise<Array<ChatMessage | ModelMessage>> => {
    const index = messages.findLastIndex((message) => message.role === 'user')
    const lastUser = messages[index]
    if (lastUser?.id === undefined) return messages
    const messageId = lastUser.id
    const stored = await stores.messages.loadMessage(threadId, messageId)
    if (stored !== null) return messages.with(index, stored)
    const [converted] = convertMessagesToModelMessages([lastUser])
    if (converted === undefined) return messages
    const prompted = await untilAborted(plan.prompt(converted, signal), signal)
    if (prompted === converted) return messages
    return messages.with(index, prompted)
  }

  function run(turn: Turn, messages: Array<ChatMessage | ModelMessage>, controller: AbortController) {
    const entry: LiveRun = {
      threadId: turn.threadId,
      controller,
      ending: new AbortController(),
      settled: Promise.withResolvers(),
      stopping: false,
    }
    live.set(turn.runId, entry)
    return admitted(turn, messages, controller, entry)
  }

  async function* admitted(
    turn: Turn,
    messages: Array<ChatMessage | ModelMessage>,
    controller: AbortController,
    entry: LiveRun,
  ): AsyncGenerator<ChatEvent> {
    const plan = await planned(hooks, turn, controller.signal)
    const prompted = await hooks
      .admit(turn)
      .then(() => promptedMessages(turn.threadId, messages, plan, controller.signal))
      .catch((error: unknown) => {
        live.delete(turn.runId)
        entry.settled.resolve()
        throw error
      })
    yield* started(turn, prompted, controller, entry, plan)
  }

  function started(
    turn: Turn,
    messages: Array<ChatMessage | ModelMessage>,
    controller: AbortController,
    entry: LiveRun,
    plan: TurnPlan,
  ) {
    const coding = driver === null ? null : stoppedWith(driver, controller.signal, config.log)
    const offered = async (): Promise<OfferedTools> => {
      const tools = await plan.tools()
      const coded =
        coding === null ? null : codeModeTools(coding, tools.codeMode, tools.search, config.codeModeResult, debug)
      return {
        tools: [...(coded?.tools ?? []), ...tools.direct],
        preface: coded?.preface ?? null,
      }
    }
    const seconds = (ms: number) => Math.round(ms / 1000)
    const failed = (message: string) => entry.ending.abort({type: EventType.RUN_ERROR, message, timestamp: Date.now()})
    const view: RunMessages = {full: []}
    const stream = chat({
      adapter: guardedAdapter(answeredAdapter(plan.adapter), {
        ended: entry.ending.signal,
        stopped: controller.signal,
        startMs: config.startTimeoutMs,
        firstOutputMs: config.firstOutputTimeoutMs,
        onNotStarted: () => failed(`the agent did not start within ${seconds(config.startTimeoutMs)}s`),
        onSilence: () => failed(`the agent produced no output within ${seconds(config.firstOutputTimeoutMs)}s`),
        stop: () => controller.abort(RUN_CANCEL_REASON),
        log: config.log,
      }),
      messages,
      threadId: turn.threadId,
      runId: turn.runId,
      tools: [],
      lazyToolsConfig: {includeDescription: 'first-sentence'},
      retry: {maxRetries: 2},
      modelOptions: plan.modelOptions,
      abortController: controller,
      debug,
      middleware: [
        defineChatMiddleware({
          name: 'conciv-steer',
          setup: () => endRuns(turn.threadId, turn.runId),
        }),
        defineChatMiddleware({
          name: 'conciv-image-tools',
          provides: [ToolBridgeProvisionerCapability],
          setup: (ctx) => provideToolBridgeProvisioner(ctx, askingToolProvisioner(config.askPermission)),
        }),
        withPersistence(persistence, {snapshotStreaming: true}),
        withLocks(locks),
        defineChatMiddleware({
          name: 'conciv-thread-view',
          onConfig: (_ctx, current) => {
            view.full = current.messages
          },
        }),
        childCards(config.codeModeResult),
        ...(turn.kind === 'compact' ? [compactionStamp(stores.messages)] : []),
        defineChatMiddleware({
          name: 'conciv-run-record',
          setup: async (ctx) => {
            await stores.runs.createOrResume({runId: turn.runId, threadId: turn.threadId, startedAt: Date.now()})
            await getPendingTurn(ctx, {optional: true})?.snapshot()
          },
        }),
        withSandbox(sandbox, {locks}),
        toolHistory(),
        concivTurn(turn, plan, view, entry, offered),
      ],
    })
    return endedWithItsRecord(stream, () => recordLifecycle(turn.runId))
  }

  return {
    ...createDelivery({
      run,
      seenRun: async (runId) => live.has(runId) || (await stores.runs.known(runId)),
      debug,
      log: config.log,
    }),
    stop: async (threadId, runIds) => {
      const active = await stores.runs.findActiveRun(threadId)
      if (active === null) return stopPreparing(threadId, runIds)
      if (runIds !== undefined && !runIds.includes(active.runId)) return false
      if (active.cancelRequested === true) return false
      const entry = live.get(active.runId)
      if (entry?.stopping === true) return false
      if (entry !== undefined) entry.stopping = true
      try {
        await requestRunCancel(stores.runs, active.runId)
      } finally {
        entry?.controller.abort(RUN_CANCEL_REASON)
      }
      return true
    },
    endRuns: endThreadRuns,
    endAllRuns: async () => {
      const threadIds = new Set([...live.values()].map((entry) => entry.threadId))
      const ended = await Promise.allSettled([...threadIds].map(endThreadRuns))
      const disposed = await Promise.allSettled([driver?.dispose()])
      throwRejected([...ended, ...disposed], 'conciv: ending the live runs failed')
    },
    driving: (threadId) => filterLiveRuns(threadId).length > 0,
    settled: async (threadId) => {
      await Promise.all(filterLiveRuns(threadId).map(([, entry]) => entry.settled.promise))
    },
    hydrate: async (threadId, window = {}) => {
      const stopping = filterLiveRuns(threadId).filter(([, entry]) => entry.controller.signal.aborted)
      await Promise.all(stopping.map(([, entry]) => entry.settled.promise))
      await savingShown(threadId, async () => undefined)
      const response = await reconstructChat(persistence, new Request(threadUrl(threadId, window)))
      const thread = ReconstructedSchema.parse(await response.json())
      const latest = (await stores.runs.listByThread(threadId)).at(-1)
      return {...thread, lastRun: latest === undefined ? null : buildLifecycle(latest)}
    },
    record: async (threadId, chunks) => {
      const processor = timedProcessor()
      for (const chunk of chunks) followRun(processor, chunk)
      await Promise.all(filterLiveRuns(threadId).map(([, entry]) => entry.settled.promise))
      await savingShown(threadId, () => saveShown(stores.messages, threadId, processor, (message) => message))
    },
    codeRunner: (codeMode, search) => {
      if (driver === null) return null
      const coded = codeModeTools(driver, codeMode, search, (value) => value, debug)
      if (coded === null) return null
      const execute = coded.execute.execute
      if (!execute) return null
      return {
        run: async (code, emit, signal) => {
          const result: unknown = await execute({typescriptCode: code}, {emitCustomEvent: emit, abortSignal: signal})
          const refusal = readSecretRefusal(result)
          if (refusal !== null) throw new Error(refusal)
          return result
        },
        discover: buildDiscovery(coded.discover),
      }
    },
  }
}
