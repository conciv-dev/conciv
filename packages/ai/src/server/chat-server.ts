import {z} from 'zod'
import {
  chat,
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
} from '@tanstack/ai'
import {defineLock, InMemoryLockStore, withLocks} from '@tanstack/ai/locks'
import {getPendingTurn} from '@tanstack/ai/adapter-internals'
import {defineAIPersistence, reconstructChat, withPersistence, type MessageStore} from '@tanstack/ai-persistence'
import {
  APPROVAL_REQUESTED_EVENT,
  approvalId,
  defineSandbox,
  defineSandboxPolicy,
  provideToolBridgeProvisioner,
  ToolBridgeProvisionerCapability,
  withSandbox,
} from '@tanstack/ai-sandbox'
import {makeTextAdapter, type TextAdapter} from '../adapters/adapters.js'
import {
  isRunPhaseTerminal,
  runLifecycleEvent,
  type ChatEvent,
  type RunLifecycle,
  type RunPhase,
} from '@conciv/protocol/chat-event-types'
import type {ChatMessage, ModelMessage} from '@conciv/protocol/chat-message-types'
import type {ChatTool} from '@conciv/protocol/chat-tool-types'
import {imageToolProvisioner} from './image-tool-results.js'
import {childCards} from './child-cards.js'
import {compactionStamp} from './compaction-stamp.js'
import {codeModeTools, loadIsolateDriver, secretRefusalOf, stoppedWith} from './code-mode.js'
import {createDelivery, endsTheRun, terminalPhaseOf, type ChatDelivery, type Turn} from './delivery.js'
import {guardedAdapter} from './run-guard.js'
import {localSandbox} from './local-sandbox.js'
import {toolHistory} from './tool-history.js'

export type ChatStores = {
  messages: MessageStore
  runs: RunStore &
    Required<Pick<RunStore, 'listByThread' | 'listReclaimable'>> & {
      listRunning: () => Promise<RunRecord[]>
      known: (runId: string) => boolean
    }
  metadata: MetadataStore
}

export type Approvals = ReadonlyMap<string, boolean>

export type TurnPlan = {
  adapter: TextAdapter
  modelOptions?: Record<string, unknown>
  systemPrompts: readonly string[]
  codeMode: readonly ChatTool[]
  asking: readonly ChatTool[]
  direct: readonly ChatTool[]
  setup: () => Promise<Approvals>
  expand: (messages: ModelMessage[]) => Promise<ModelMessage[]>
  providerMessages: (messages: ModelMessage[]) => Promise<ModelMessage[]>
  chunk: (chunk: ChatEvent) => Promise<ChatEvent[]>
}

export type TurnHooks = {
  plan: (turn: Turn) => TurnPlan
  usage: (turn: Turn, usage: TokenUsage) => Promise<void>
  end: (turn: Turn, run: RunLifecycle) => Promise<void>
  started: (turn: Turn) => void
}

export type ChatServerConfig = {
  stores: ChatStores
  sandbox: {dir: string}
  hooks: TurnHooks
  codeModeResult: (value: unknown) => unknown
  firstOutputTimeoutMs: number
  log: (message: string) => void
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
  stop: (threadId: string, runIds?: readonly string[]) => Promise<void>
  endRuns: (threadId: string) => Promise<void>
  endAllRuns: () => Promise<void>
  settled: (threadId: string) => Promise<void>
  driving: (threadId: string) => boolean
  hydrate: (threadId: string, window?: ChatThreadWindow) => Promise<ChatThread>
  record: (threadId: string, chunks: readonly ChatEvent[]) => Promise<void>
  codeRunner: (codeMode: readonly ChatTool[]) => CodeRunner | null
}

const PHASE_BY_STATUS: Record<RunRecord['status'], RunPhase> = {
  running: 'running',
  interrupted: 'running',
  completed: 'completed',
  failed: 'failed',
  aborted: 'aborted',
}

function lifecycleOf(record: RunRecord): RunLifecycle {
  const stopping = record.status === 'running' && record.cancelRequested === true
  return {
    runId: record.runId,
    phase: stopping ? 'stopping' : PHASE_BY_STATUS[record.status],
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
    systemPrompts: [],
    codeMode: [],
    asking: [],
    direct: [],
    setup: async () => new Map(),
    expand: async (messages) => messages,
    providerMessages: async (messages) => messages,
    chunk: async (chunk) => [chunk],
  }
}

function planned(hooks: TurnHooks, turn: Turn): TurnPlan {
  try {
    return hooks.plan(turn)
  } catch (error) {
    return failedPlan(error)
  }
}

function withLastUser(messages: ModelMessage[], user: ModelMessage | undefined): ModelMessage[] {
  const index = messages.findLastIndex((message) => message.role === 'user')
  if (index === -1 || user === undefined) return messages
  return [...messages.slice(0, index), user, ...messages.slice(index + 1)]
}

export function toolApprovalId(name: string): string {
  return approvalId({provider: 'conciv', kind: 'tool', target: name})
}

export function approvalNeeded(name: string): Error {
  return new Error(
    `Tool "${name}" needs the user's approval. The request is shown to the user; retry once they approve it.`,
  )
}

export function approvalDenied(name: string): Error {
  return new Error(`The user denied running tool "${name}". Do not retry it; continue without it.`)
}

function gatedTools(tools: readonly ChatTool[], approvals: () => Approvals): ChatTool[] {
  return tools.map((tool) => {
    const execute = tool.execute
    if (!execute) return tool
    const id = toolApprovalId(tool.name)
    return {
      ...tool,
      execute: async (args: unknown, context?: {emitCustomEvent?: CustomEventSink}) => {
        const granted = approvals().get(id)
        if (granted === true) return execute(args, context)
        if (granted === false) throw approvalDenied(tool.name)
        context?.emitCustomEvent?.(APPROVAL_REQUESTED_EVENT, {approvalId: id, title: tool.name, input: args})
        throw approvalNeeded(tool.name)
      },
    }
  })
}

function discoveryOf(tool: ChatTool | null): CodeDiscovery | null {
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
    await hooks.end(turn, lifecycleOf({...record, status: 'aborted', finishedAt: now}))
  }
}

type LiveRun = {
  threadId: string
  controller: AbortController
  ending: AbortController
  settled: PromiseWithResolvers<void>
}

type RunMessages = {full: ModelMessage[]}

function isSubagentChunk(chunk: ChatEvent): boolean {
  return 'subagentRunId' in chunk && chunk.subagentRunId !== undefined
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
    provider: localSandbox({dir: config.sandbox.dir}),
    policy: defineSandboxPolicy({default: 'ask'}),
    fileEvents: false,
    lifecycle: {reuse: 'thread', destroyOnComplete: false},
  })
  const driver = await loadIsolateDriver(config.log)
  await sweepAbandonedRuns(stores.runs, hooks)

  const lifecycleChunk = (lifecycle: RunLifecycle): ChatEvent => runLifecycleEvent.create(lifecycle)

  const recordLifecycle = async (runId: string): Promise<RunLifecycle | null> => {
    const record = await stores.runs.get(runId)
    return record === null ? null : lifecycleOf(record)
  }

  const terminalChunk = async (runId: string, phase: RunPhase, error: string | null): Promise<ChatEvent> => {
    const record = await stores.runs.get(runId)
    const now = Date.now()
    return lifecycleChunk({
      runId,
      phase: phase === 'completed' && record?.cancelRequested === true ? 'aborted' : phase,
      startedAt: record?.startedAt ?? now,
      finishedAt: now,
      serverNow: now,
      error,
    })
  }

  const liveRunsOf = (threadId: string, except?: string): [string, LiveRun][] =>
    [...live.entries()].filter(([runId, entry]) => entry.threadId === threadId && runId !== except)

  const endRuns = async (threadId: string, except?: string): Promise<void> => {
    const cancels = await Promise.allSettled(
      liveRunsOf(threadId, except).map(async ([runId, entry]) => {
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
    const running = liveRunsOf(threadId)
    const interrupted = endRuns(threadId).finally(() => {
      for (const [, entry] of running) entry.controller.abort(RUN_CANCEL_REASON)
    })
    const ending = running.map(([, entry]) => entry.settled.promise)
    const [cancelled] = await Promise.allSettled([interrupted, Promise.all(ending)])
    if (cancelled.status === 'rejected') throw cancelled.reason
  }

  function concivTurn(turn: Turn, plan: TurnPlan, granted: {approvals: Approvals}, view: RunMessages, entry: LiveRun) {
    const failure: {message: string | null} = {message: null}
    const prepared: {sent: number; provider: ModelMessage[]} = {sent: 0, provider: []}
    const shown = new StreamProcessor({})
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
          return {
            messages: [...ctx.messages],
            providerMessages: [...prepared.provider, ...current.messages.slice(prepared.sent)],
          }
        }
        if (ctx.phase !== 'init') return
        granted.approvals = await plan.setup()
        const expanded = await plan.expand(current.messages)
        prepared.sent = expanded.length
        prepared.provider = await plan.providerMessages(expanded)
        return {
          messages: withLastUser(
            view.full,
            expanded.findLast((message) => message.role === 'user'),
          ),
          providerMessages: prepared.provider,
          resumeToolState: {
            ...current.resumeToolState,
            approvals: new Map([...(current.resumeToolState?.approvals ?? []), ...granted.approvals]),
          },
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
        const phase = terminalPhaseOf(chunk)
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

  function run(turn: Turn, messages: Array<ChatMessage | ModelMessage>, controller: AbortController) {
    const entry: LiveRun = {
      threadId: turn.threadId,
      controller,
      ending: new AbortController(),
      settled: Promise.withResolvers(),
    }
    live.set(turn.runId, entry)
    const plan = planned(hooks, turn)
    const granted: {approvals: Approvals} = {approvals: new Map()}
    const approvals = (): Approvals => granted.approvals
    const coded =
      driver === null
        ? null
        : codeModeTools(stoppedWith(driver, controller.signal, config.log), plan.codeMode, config.codeModeResult, debug)
    const seconds = Math.round(config.firstOutputTimeoutMs / 1000)
    const view: RunMessages = {full: []}
    const stream = chat({
      adapter: guardedAdapter(plan.adapter, {
        ended: entry.ending.signal,
        stopped: controller.signal,
        firstOutputMs: config.firstOutputTimeoutMs,
        onSilence: () =>
          entry.ending.abort({
            type: EventType.RUN_ERROR,
            message: `the agent produced no output within ${seconds}s`,
            timestamp: Date.now(),
          }),
        stop: () => controller.abort(RUN_CANCEL_REASON),
        log: config.log,
      }),
      messages,
      threadId: turn.threadId,
      runId: turn.runId,
      systemPrompts: [...plan.systemPrompts, ...(coded === null ? [] : [coded.systemPrompt])],
      tools: [...(coded?.tools ?? []), ...gatedTools(plan.asking, approvals), ...plan.direct],
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
          setup: (ctx) => provideToolBridgeProvisioner(ctx, imageToolProvisioner),
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
        concivTurn(turn, plan, granted, view, entry),
      ],
    })
    return endedWithItsRecord(stream, () => recordLifecycle(turn.runId))
  }

  return {
    ...createDelivery({
      run,
      seenRun: (runId) => live.has(runId) || stores.runs.known(runId),
      debug,
      log: config.log,
    }),
    stop: async (threadId, runIds) => {
      const active = await stores.runs.findActiveRun(threadId)
      if (active === null) return
      if (runIds !== undefined && !runIds.includes(active.runId)) return
      await requestRunCancel(stores.runs, active.runId)
      live.get(active.runId)?.controller.abort(RUN_CANCEL_REASON)
    },
    endRuns: endThreadRuns,
    endAllRuns: async () => {
      const threadIds = new Set([...live.values()].map((entry) => entry.threadId))
      const ended = await Promise.allSettled([...threadIds].map(endThreadRuns))
      const disposed = await Promise.allSettled([driver?.dispose()])
      throwRejected([...ended, ...disposed], 'conciv: ending the live runs failed')
    },
    driving: (threadId) => liveRunsOf(threadId).length > 0,
    settled: async (threadId) => {
      await Promise.all(liveRunsOf(threadId).map(([, entry]) => entry.settled.promise))
    },
    hydrate: async (threadId, window = {}) => {
      const stopping = liveRunsOf(threadId).filter(([, entry]) => entry.controller.signal.aborted)
      await Promise.all(stopping.map(([, entry]) => entry.settled.promise))
      await savingShown(threadId, async () => undefined)
      const response = await reconstructChat(persistence, new Request(threadUrl(threadId, window)))
      const thread = ReconstructedSchema.parse(await response.json())
      const latest = (await stores.runs.listByThread(threadId)).at(-1)
      return {...thread, lastRun: latest === undefined ? null : lifecycleOf(latest)}
    },
    record: async (threadId, chunks) => {
      const processor = new StreamProcessor({})
      for (const chunk of chunks) followRun(processor, chunk)
      await Promise.all(liveRunsOf(threadId).map(([, entry]) => entry.settled.promise))
      await savingShown(threadId, () => saveShown(stores.messages, threadId, processor, (message) => message))
    },
    codeRunner: (codeMode) => {
      if (driver === null) return null
      const coded = codeModeTools(driver, codeMode, (value) => value, debug)
      if (coded === null) return null
      const execute = coded.execute.execute
      if (!execute) return null
      return {
        run: async (code, emit, signal) => {
          const result: unknown = await execute({typescriptCode: code}, {emitCustomEvent: emit, abortSignal: signal})
          const refusal = secretRefusalOf(result)
          if (refusal !== null) throw new Error(refusal)
          return result
        },
        discover: discoveryOf(coded.discover),
      }
    },
  }
}
