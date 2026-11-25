import {z} from 'zod'
import {
  chat,
  convertMessagesToModelMessages,
  defineChatMiddleware,
  EventType,
  isToolResultOutcome,
  requestRunCancel,
  RUN_CANCEL_REASON,
  StreamProcessor,
  uiMessageToModelMessages,
  untilFinishReason,
  withTanstackMetadata,
  type ChatMiddleware,
  type DebugConfig,
  type MetadataStore,
  type RunRecord,
  type RunStore,
  type TokenUsage,
  type ToolCall,
  type ToolResultOutcome,
} from '@tanstack/ai'
import {defineLock, InMemoryLockStore, withLocks} from '@tanstack/ai/locks'
import {otelMiddleware, type OtelSpanInfo} from '@tanstack/ai/middlewares/otel'
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
import {SessionMessage} from '@conciv/protocol/schema/session-message'
import {makeTextAdapter, type TextAdapter} from '@conciv/harness/adapters'
import {
  isRunPhaseTerminal,
  runLifecycleEvent,
  type ChatEvent,
  type RunLifecycle,
  type RunPhase,
  ChatEventType,
} from '@conciv/types/chat-event-types'
import {type ChatMessage, type ModelMessage, CompactionMetadataSchema} from '@conciv/types/chat-message-types'
import type {ChatTool} from '@conciv/types/chat-tool-types'
import {askingToolProvisioner, type AskPermission} from './image-tool-results.js'
import {childCards, withoutHiddenCalls} from './child-cards.js'
import {codeModeTools, readSecretRefusal, stoppedWith, tracedDriver} from './code-mode.js'
import type {CodeDriver} from './quickjs-thread.js'
import {createDelivery, endsTheRun, readTerminalPhase, type ChatDelivery, type Turn} from './delivery.js'
import {guardedAdapter} from './run-guard.js'
import {GROUP_EXIT_TIMEOUT_MS, localSandbox} from '@conciv/harness/local-sandbox'
import {answeredAdapter, answeredMetadata, hookedRequest, type RequestHook} from './model-request.js'
import {formatLoggedError} from './logged-error.js'
import {cloneDeepWith, isPlainObject, takeWhile} from 'es-toolkit'
import {inSpan, streamInSpan, type SpanAttributes, type Tracer} from './spans.js'

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

type RecordedCall = {
  metadata: Record<string, unknown> | undefined
  failed: boolean
  outcome?: ToolResultOutcome
  startedAt?: number
}

type Recorded = Map<string, RecordedCall>

const FailedResultSchema = z.union([
  z.looseObject({state: z.literal('output-error')}),
  z.looseObject({metadata: z.looseObject({tanstack: z.looseObject({state: z.literal('output-error')})})}),
])

const MetadataSchema = z.record(z.string(), z.unknown()).catch({})

const OutcomeSchema = z.looseObject({
  metadata: z.looseObject({
    tanstack: z.looseObject({toolResultOutcome: z.custom<ToolResultOutcome>(isToolResultOutcome)}),
  }),
})

function readOutcome(chunk: unknown): ToolResultOutcome | undefined {
  return OutcomeSchema.safeParse(chunk).data?.metadata.tanstack.toolResultOutcome
}

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
        outcome: readOutcome(chunk),
        startedAt: call?.startedAt,
      })
      restore(ctx)
      return [{...chunk, metadata: {...chunk.metadata, time}}]
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
  if (message.toolCallId === undefined) return message
  const call = recorded.get(message.toolCallId)
  const outcome = call?.outcome
  const marked = outcome === undefined ? message : withTanstackMetadata(message, {toolResultOutcome: outcome})
  if (marked.error !== undefined || call?.failed !== true || typeof marked.content !== 'string') return marked
  return {...marked, error: marked.content}
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
  tracer: Tracer | undefined
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

function turnAttributes(turn: Turn): SpanAttributes {
  return {'conciv.session.id': turn.threadId, 'conciv.run.id': turn.runId, 'conciv.turn.kind': turn.kind}
}

function chatAttributes(info: OtelSpanInfo): SpanAttributes {
  if (info.kind === 'generation') return {}
  return {
    'conciv.session.id': info.ctx.threadId ?? '',
    'conciv.run.id': info.ctx.runId ?? '',
    'conciv.harness.id': info.ctx.provider,
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
    const turn: Turn = {threadId: record.threadId, runId: record.runId, kind: 'chat', delivered: []}
    await hooks.end(turn, buildLifecycle({...record, status: 'aborted', finishedAt: now}))
  }
}

type LiveRun = {
  threadId: string
  controller: AbortController
  ending: AbortController
  settled: PromiseWithResolvers<void>
  stopping: boolean
  interrupted: ModelMessage[]
}

type RunMessages = {full: ModelMessage[]}

function isSubagentChunk(chunk: ChatEvent): boolean {
  return 'subagentRunId' in chunk && chunk.subagentRunId !== undefined
}

function followRun(processor: StreamProcessor, chunk: ChatEvent): void {
  if (isSubagentChunk(chunk) || chunk.type === EventType.MESSAGES_SNAPSHOT) return
  processor.processChunk(chunk)
}

const PART_ENDS: readonly string[] = [
  EventType.TEXT_MESSAGE_END,
  EventType.TOOL_CALL_END,
  EventType.TOOL_CALL_RESULT,
  EventType.REASONING_MESSAGE_END,
]

function countParts(processor: StreamProcessor): number {
  return processor.getMessages().reduce((count, message) => count + message.parts.length, 0)
}

function withParentMessage(chunk: ChatEvent, messageId: string | null): ChatEvent {
  if (chunk.type !== EventType.TOOL_CALL_START || isSubagentChunk(chunk)) return chunk
  if (chunk.parentMessageId || messageId === null) return chunk
  return {...chunk, parentMessageId: messageId}
}

function savedBefore(processor: StreamProcessor): (stored: readonly ModelMessage[]) => ReadonlySet<string> {
  const own = new Set(processor.getMessages().map((message) => message.id))
  return (stored) =>
    new Set(
      stored
        .filter((message) => message.role === 'assistant' && (message.id === undefined || !own.has(message.id)))
        .flatMap((message) => (message.toolCalls ?? []).map((call) => call.id)),
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

const INTERRUPTED = 'Tool execution interrupted'

async function saveStoppedTurn(
  messages: MessageStore,
  threadId: string,
  processor: StreamProcessor,
): Promise<ModelMessage[]> {
  const stopped = (message: ModelMessage) => withTanstackMetadata(message, {stopReason: 'aborted'})
  const written: {results: ModelMessage[]} = {results: []}
  await saveShown(
    messages,
    threadId,
    processor,
    stopped,
    [stopped({role: 'assistant', content: null, id: SessionMessage.Id.create()})],
    (thread) => {
      const latest = lastToolResults(thread)
      written.results = interruptedResults(latest)
      return [...latest, ...written.results]
    },
  )
  return written.results
}

function interruptedChunks(results: readonly ModelMessage[]): ChatEvent[] {
  return results.flatMap((result) =>
    result.toolCallId === undefined
      ? []
      : [
          {
            type: ChatEventType.TOOL_CALL_RESULT,
            messageId: SessionMessage.Id.create(),
            toolCallId: result.toolCallId,
            content: JSON.stringify({error: INTERRUPTED}),
            metadata: {tanstack: {state: 'output-error'}},
          },
        ],
  )
}

function interruptedResults(thread: readonly ModelMessage[]): ModelMessage[] {
  const answered = new Set(thread.flatMap((message) => (message.role === 'tool' ? [message.toolCallId] : [])))
  return thread.flatMap((message) =>
    (message.toolCalls ?? [])
      .filter((call) => !answered.has(call.id))
      .map((call) => ({role: 'tool', toolCallId: call.id, content: INTERRUPTED, error: INTERRUPTED})),
  )
}

function lastToolResults(thread: ModelMessage[]): ModelMessage[] {
  return thread.filter(
    (message, index) =>
      message.role !== 'tool' ||
      thread.findLastIndex((later) => later.role === 'tool' && later.toolCallId === message.toolCallId) === index,
  )
}

async function saveShown(
  messages: MessageStore,
  threadId: string,
  processor: StreamProcessor,
  finish: (message: ModelMessage) => ModelMessage,
  unshown: readonly ModelMessage[],
  seal: (thread: ModelMessage[]) => ModelMessage[],
  alreadySaved: (stored: readonly ModelMessage[]) => ReadonlySet<string> = savedBefore(processor),
): Promise<void> {
  const stored = await messages.loadThread(threadId)
  const saved = alreadySaved(stored)
  const shown = processor
    .getMessages()
    .filter((message) => message.role === 'assistant')
    .map((message) => unsavedParts(message, saved))
    .filter((message) => message.parts.length > 0)
    .flatMap(uiMessageToModelMessages)
    .map(finish)
  const saving = shown.length > 0 ? shown : unshown
  if (saving.length === 0) return
  const replaced = new Set(saving.flatMap((message) => (message.id === undefined ? [] : [message.id])))
  const kept = stored.filter((message) => message.id === undefined || !replaced.has(message.id))
  await messages.saveThread(threadId, seal([...kept, ...saving]))
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
  turn: Turn,
  stream: AsyncIterable<ChatEvent>,
  recorded: () => Promise<RunLifecycle | null>,
  interrupted: () => readonly ModelMessage[],
): AsyncGenerator<ChatEvent> {
  const seen = {ended: false}
  for await (const chunk of stream) {
    seen.ended ||= endsTheRun(chunk)
    yield chunk
  }
  if (seen.ended) return
  yield* interruptedChunks(interrupted())
  const lifecycle = await recorded()
  if (lifecycle === null || !isRunPhaseTerminal(lifecycle.phase)) return
  yield runLifecycleEvent.create(lifecycle)
  if (lifecycle.phase !== 'completed') return
  yield {
    type: EventType.RUN_FINISHED,
    threadId: turn.threadId,
    runId: turn.runId,
    finishReason: 'stop',
    timestamp: Date.now(),
  }
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
  const savingShown = <Value>(threadId: string, work: () => Promise<Value>): Promise<Value> =>
    processLocks.withLock(`conciv-shown:${threadId}`, work)
  const live = new Map<string, LiveRun>()
  const debug = silentCategories({
    debug: () => undefined,
    info: () => undefined,
    warn: (message) => config.log(`[ai] ${message}`),
    error: (message, meta) => config.log(formatLoggedError(message, meta?.error)),
  })
  const sandbox = defineSandbox({
    id: 'conciv',
    provider: localSandbox(config.sandbox),
    policy: defineSandboxPolicy({default: 'ask'}),
    fileEvents: false,
    lifecycle: {reuse: 'thread', destroyOnComplete: false},
  })
  const driver = config.driver
  const tracer = config.tracer
  await inSpan(tracer, 'ChatServer.sweepAbandonedRuns', {}, () => sweepAbandonedRuns(stores.runs, hooks))

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

  const filterLiveRuns = (threadId: string): [string, LiveRun][] =>
    [...live.entries()].filter(([, entry]) => entry.threadId === threadId)

  const olderLiveRuns = (threadId: string, runId: string): [string, LiveRun][] =>
    takeWhile([...live.entries()], ([liveRunId]) => liveRunId !== runId).filter(
      ([, entry]) => entry.threadId === threadId,
    )

  const endRuns = async (threadId: string, runs: [string, LiveRun][]): Promise<void> => {
    const cancels = await Promise.allSettled(
      runs.map(async ([runId, entry]) => {
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
    const interrupted = endRuns(threadId, running).finally(() => {
      for (const [, entry] of running) entry.controller.abort(RUN_CANCEL_REASON)
    })
    const ending = running.map(([, entry]) => entry.settled.promise)
    const [cancelled] = await Promise.allSettled([interrupted, Promise.all(ending)])
    if (cancelled.status === 'rejected') throw cancelled.reason
  }

  const endOlderRuns = async (turn: Turn, entry: LiveRun): Promise<void> => {
    if (entry.ending.signal.aborted) return
    await endRuns(turn.threadId, olderLiveRuns(turn.threadId, turn.runId))
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
    const shown = new StreamProcessor()
    const saveSoFar = (finish: (message: ModelMessage) => ModelMessage = (message) => message): Promise<void> =>
      savingShown(turn.threadId, () =>
        saveShown(stores.messages, turn.threadId, shown, finish, [], lastToolResults),
      ).catch((error: unknown) => {
        config.log(`[ai] saving the reply so far of run ${turn.runId} failed: ${String(error)}`)
      })
    const settle = async (): Promise<void> => {
      try {
        await inSpan(tracer, 'ChatServer.settle', turnAttributes(turn), async () => {
          const lifecycle = await recordLifecycle(turn.runId)
          if (lifecycle !== null) await hooks.end(turn, lifecycle)
        })
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
          const request = await inSpan(tracer, 'ChatServer.requestContext', turnAttributes(turn), () =>
            hookedRequest(
              (draft, signal) => untilAborted(plan.context(draft, signal), signal),
              {
                system: [...prepared.system, ...(next.preface === null ? [] : [next.preface])],
                messages: [...prepared.provider, ...withoutHiddenCalls(current.messages).slice(prepared.sent)],
                options: requestOptions(plan.modelOptions),
                tools: next.tools,
              },
              entry.controller.signal,
            ),
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
        return inSpan(tracer, 'ChatServer.prepareContext', turnAttributes(turn), async () => {
          await plan.setup()
          const next = await offered()
          prepared.system = await plan.systemPrompts()
          const systemPrompts = [
            ...prepared.system,
            ...(next.preface === null ? [] : [next.preface]),
            ...current.systemPrompts,
          ]
          const expanded = await plan.expand(withoutHiddenCalls(current.messages))
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
        })
      },
      onChunk: async (ctx, raw) => {
        const chunk = withParentMessage(raw, ctx.currentMessageId)
        const parts = countParts(shown)
        followRun(shown, chunk)
        if (PART_ENDS.includes(chunk.type) || countParts(shown) !== parts) await saveSoFar()
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
      onError: async () => {
        await saveSoFar((message) => withTanstackMetadata(message, {stopReason: 'error'}))
        await settle()
      },
      onAbort: async () => {
        entry.interrupted = await inSpan(tracer, 'ChatServer.saveStoppedTurn', turnAttributes(turn), () =>
          savingShown(turn.threadId, () => saveStoppedTurn(stores.messages, turn.threadId, shown)),
        ).catch((error: unknown) => {
          config.log(`[ai] saving the stopped turn of run ${turn.runId} failed: ${String(error)}`)
          return []
        })
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
      interrupted: [],
    }
    live.set(turn.runId, entry)
    return streamInSpan(tracer, 'ChatServer.turn', turnAttributes(turn), () =>
      admitted(turn, messages, controller, entry),
    )
  }

  async function* admitted(
    turn: Turn,
    messages: Array<ChatMessage | ModelMessage>,
    controller: AbortController,
    entry: LiveRun,
  ): AsyncGenerator<ChatEvent> {
    const plan = await inSpan(tracer, 'ChatServer.plan', turnAttributes(turn), () =>
      planned(hooks, turn, controller.signal),
    )
    const prompted = await inSpan(tracer, 'ChatServer.admit', turnAttributes(turn), () => hooks.admit(turn))
      .then(() =>
        inSpan(tracer, 'ChatServer.prompt', turnAttributes(turn), () =>
          promptedMessages(turn.threadId, messages, plan, controller.signal),
        ),
      )
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
    const coding = driver === null ? null : stoppedWith(tracedDriver(driver, tracer), controller.signal, config.log)
    const offered = async (): Promise<OfferedTools> => {
      const tools = await plan.tools()
      const coded =
        coding === null
          ? null
          : codeModeTools(coding, tools.codeMode, tools.search, config.codeModeResult, debug, tracer)
      return {
        tools: [...(coded?.tools ?? []), ...tools.direct],
        preface: coded?.preface ?? null,
      }
    }
    const seconds = (ms: number) => Math.round(ms / 1000)
    const failed = (message: string) => entry.ending.abort({type: EventType.RUN_ERROR, message, timestamp: Date.now()})
    const view: RunMessages = {full: []}
    const tracing: ChatMiddleware[] =
      tracer === undefined ? [] : [otelMiddleware({tracer, attributeEnricher: chatAttributes})]
    const stream = chat({
      adapter: guardedAdapter(answeredAdapter(plan.adapter), {
        ended: entry.ending.signal,
        stopped: controller.signal,
        startMs: config.startTimeoutMs,
        firstOutputMs: config.firstOutputTimeoutMs,
        closeMs: config.sandbox.groupExitTimeoutMs ?? GROUP_EXIT_TIMEOUT_MS,
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
      agentLoopStrategy: untilFinishReason(['length']),
      modelOptions: plan.modelOptions,
      abortController: controller,
      debug,
      middleware: [
        defineChatMiddleware({
          name: 'conciv-steer',
          setup: () => endOlderRuns(turn, entry),
        }),
        defineChatMiddleware({
          name: 'conciv-image-tools',
          provides: [ToolBridgeProvisionerCapability],
          setup: (ctx) => provideToolBridgeProvisioner(ctx, askingToolProvisioner(config.askPermission, tracer)),
        }),
        withPersistence(persistence),
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
          setup: (ctx) =>
            inSpan(tracer, 'ChatServer.recordRun', turnAttributes(turn), async () => {
              await stores.runs.createOrResume({runId: turn.runId, threadId: turn.threadId, startedAt: Date.now()})
              await getPendingTurn(ctx, {optional: true})?.snapshot()
            }),
        }),
        withSandbox(sandbox, {locks}),
        toolHistory(),
        concivTurn(turn, plan, view, entry, offered),
        ...tracing,
      ],
    })
    return endedWithItsRecord(
      turn,
      stream,
      () => recordLifecycle(turn.runId),
      () => entry.interrupted,
    )
  }

  return {
    ...createDelivery({
      run,
      seenRun: async (runId) => live.has(runId) || (await stores.runs.known(runId)),
      debug,
      log: config.log,
    }),
    stop: (threadId, runIds) =>
      inSpan(tracer, 'ChatServer.stop', {'conciv.session.id': threadId}, () => stopRuns(threadId, runIds)),
    endRuns: (threadId) =>
      inSpan(tracer, 'ChatServer.endRuns', {'conciv.session.id': threadId}, () => endThreadRuns(threadId)),
    endAllRuns: () => inSpan(tracer, 'ChatServer.endAllRuns', {}, endAllRuns),
    driving: (threadId) => filterLiveRuns(threadId).length > 0,
    settled: async (threadId) => {
      await Promise.all(filterLiveRuns(threadId).map(([, entry]) => entry.settled.promise))
    },
    hydrate: (threadId, window = {}) =>
      inSpan(tracer, 'ChatServer.hydrate', {'conciv.session.id': threadId}, () => hydrateThread(threadId, window)),
    record: (threadId, chunks) =>
      inSpan(tracer, 'ChatServer.record', {'conciv.session.id': threadId, 'conciv.chunk.count': chunks.length}, () =>
        recordChunks(threadId, chunks),
      ),
    codeRunner: (codeMode, search) => {
      if (driver === null) return null
      const coded = codeModeTools(tracedDriver(driver, tracer), codeMode, search, (value) => value, debug, tracer)
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

  async function stopRuns(threadId: string, runIds: readonly string[] | undefined): Promise<boolean> {
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
  }

  async function endAllRuns(): Promise<void> {
    const threadIds = new Set([...live.values()].map((entry) => entry.threadId))
    const ended = await Promise.allSettled([...threadIds].map(endThreadRuns))
    const disposed = await Promise.allSettled([
      driver === null ? undefined : inSpan(tracer, 'CodeMode.closePool', {}, () => driver.dispose()),
    ])
    throwRejected([...ended, ...disposed], 'conciv: ending the live runs failed')
  }

  async function hydrateThread(threadId: string, window: ChatThreadWindow): Promise<ChatThread> {
    const stopping = filterLiveRuns(threadId).filter(([, entry]) => entry.controller.signal.aborted)
    await Promise.all(stopping.map(([, entry]) => entry.settled.promise))
    await savingShown(threadId, async () => undefined)
    const response = await reconstructChat(persistence, new Request(threadUrl(threadId, window)))
    const thread = ReconstructedSchema.parse(await response.json())
    const latest = (await stores.runs.listByThread(threadId)).at(-1)
    return {...thread, lastRun: latest === undefined ? null : buildLifecycle(latest)}
  }

  async function recordChunks(threadId: string, chunks: readonly ChatEvent[]): Promise<void> {
    const processor = new StreamProcessor()
    for (const chunk of chunks) followRun(processor, chunk)
    await Promise.all(filterLiveRuns(threadId).map(([, entry]) => entry.settled.promise))
    await savingShown(threadId, () =>
      saveShown(
        stores.messages,
        threadId,
        processor,
        (message) => message,
        [],
        lastToolResults,
        () => new Set<string>(),
      ),
    )
  }
}
