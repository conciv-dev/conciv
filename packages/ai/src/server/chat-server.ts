import {z} from 'zod'
import {
  chat,
  defineChatMiddleware,
  EventType,
  requestRunCancel,
  RUN_CANCEL_REASON,
  type DebugConfig,
  type MetadataStore,
  type RunRecord,
  type RunStore,
  type StreamDurability,
  type TokenUsage,
} from '@tanstack/ai'
import {defineLock, InMemoryLockStore, withLocks} from '@tanstack/ai/locks'
import type {IsolateDriver} from '@tanstack/ai-code-mode'
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
import {localProcessSandbox} from '@tanstack/ai-sandbox-local-process'
import {makeTextAdapter, type TextAdapter} from '../adapters/adapters.js'
import {runLifecycleEvent, type ChatEvent, type RunLifecycle, type RunPhase} from '@conciv/protocol/chat-event-types'
import type {ChatMessage, ModelMessage} from '@conciv/protocol/chat-message-types'
import type {ChatTool} from '@conciv/protocol/chat-tool-types'
import {imageToolProvisioner} from './image-tool-results.js'
import {childCards} from './child-cards.js'
import {codeModeTools, loadIsolateDriver, secretRefusalOf} from './code-mode.js'
import {createDelivery, type ChatDelivery, type Turn} from './delivery.js'
import {guardedAdapter} from './run-guard.js'

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
  sandbox: {dir: string; journalDir: string}
  hooks: TurnHooks
  codeModeResult: (value: unknown) => unknown
  firstOutputTimeoutMs: number
  log: (message: string) => void
}

export type ChatThread = {messages: ChatMessage[]; activeRun: {runId: string} | null; lastRun: RunLifecycle | null}

export type CodeDiscovery = {description: string; run: (toolNames: string[]) => Promise<unknown>}

export type CodeRunner = {
  systemPrompt: string
  run: (code: string, emit: CustomEventSink) => Promise<unknown>
  discover: CodeDiscovery | null
}

export type CustomEventSink = (name: string, value: Record<string, unknown>) => void

export type ChatServer = ChatDelivery & {
  stop: (threadId: string, runIds?: readonly string[]) => Promise<void>
  endRuns: (threadId: string) => Promise<void>
  settled: (threadId: string) => Promise<void>
  hydrate: (threadId: string) => Promise<ChatThread>
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

function terminalPhaseOf(chunk: ChatEvent): RunPhase | null {
  if (chunk.type === EventType.RUN_ERROR) return 'failed'
  if (chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls') return 'completed'
  return null
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

function gatedTools(tools: readonly ChatTool[], approvals: () => Approvals): ChatTool[] {
  return tools.map((tool) => {
    const execute = tool.execute
    if (!execute) return tool
    const id = toolApprovalId(tool.name)
    return {
      ...tool,
      execute: async (args: unknown, context?: {emitCustomEvent?: CustomEventSink}) => {
        if (approvals().get(id) === true) return execute(args, context)
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
})

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
  ending: PromiseWithResolvers<ChatEvent>
  settled: PromiseWithResolvers<void>
}

type RunMessages = {full: ModelMessage[]}

type StreamedText = {messageId: string; text: string}

function isSubagentChunk(chunk: ChatEvent): boolean {
  return 'subagentRunId' in chunk && chunk.subagentRunId !== undefined
}

function followText(streamed: StreamedText, chunk: ChatEvent): void {
  if (isSubagentChunk(chunk)) return
  if (chunk.type === EventType.TEXT_MESSAGE_START) {
    streamed.messageId = chunk.messageId
    streamed.text = ''
  }
  if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) streamed.text += chunk.delta
}

async function flushStreamedText(messages: MessageStore, threadId: string, streamed: StreamedText): Promise<void> {
  if (streamed.messageId === '' || streamed.text === '') return
  const stored = await messages.loadThread(threadId)
  const index = stored.findLastIndex((message) => message.role === 'assistant' && message.id === streamed.messageId)
  const saved = stored[index]
  if (saved === undefined || saved.content === streamed.text) return
  await messages.saveThread(threadId, stored.with(index, {...saved, content: streamed.text}))
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

export async function createChatServer(config: ChatServerConfig): Promise<ChatServer> {
  const {stores, hooks} = config
  const persistence = defineAIPersistence({stores})
  const processLocks = new InMemoryLockStore()
  const locks = defineLock({withLock: (key, work) => processLocks.withLock(key, work)})
  const live = new Map<string, LiveRun>()
  const debug = silentCategories({
    debug: () => undefined,
    info: () => undefined,
    warn: (message) => config.log(`[ai] ${message}`),
    error: (message, meta) => config.log(`[ai] ${message}: ${String(meta?.error)}`),
  })
  const sandbox = defineSandbox({
    id: 'conciv',
    provider: localProcessSandbox({dir: config.sandbox.dir}),
    policy: defineSandboxPolicy({default: 'ask'}),
    fileEvents: false,
    lifecycle: {reuse: 'thread', destroyOnComplete: false},
  })
  const driver: IsolateDriver | null = await loadIsolateDriver(config.log)
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
    for (const [runId, entry] of liveRunsOf(threadId, except)) {
      await requestRunCancel(stores.runs, runId)
      entry.ending.resolve({
        type: EventType.RUN_FINISHED,
        threadId,
        runId,
        finishReason: 'stop',
        timestamp: Date.now(),
      })
    }
  }

  function concivTurn(turn: Turn, plan: TurnPlan, granted: {approvals: Approvals}, view: RunMessages, entry: LiveRun) {
    const failure: {message: string | null} = {message: null}
    const prepared: {sent: number; provider: ModelMessage[]} = {sent: 0, provider: []}
    const streamed: StreamedText = {messageId: '', text: ''}
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
        followText(streamed, chunk)
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
      onStart: () => hooks.started(turn),
      onUsage: (_ctx, usage) => hooks.usage(turn, usage),
      onFinish: () => settle(),
      onError: () => settle(),
      onAbort: async () => {
        await flushStreamedText(stores.messages, turn.threadId, streamed).catch((error: unknown) =>
          config.log(`[ai] saving the stopped text of run ${turn.runId} failed: ${String(error)}`),
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

  function run(
    turn: Turn,
    messages: Array<ChatMessage | ModelMessage>,
    durability: StreamDurability,
    controller: AbortController,
  ) {
    const entry: LiveRun = {
      threadId: turn.threadId,
      controller,
      ending: Promise.withResolvers(),
      settled: Promise.withResolvers(),
    }
    live.set(turn.runId, entry)
    const plan = planned(hooks, turn)
    const granted: {approvals: Approvals} = {approvals: new Map()}
    const approvals = (): Approvals => granted.approvals
    const coded = driver === null ? null : codeModeTools(driver, plan.codeMode, config.codeModeResult, debug)
    const seconds = Math.round(config.firstOutputTimeoutMs / 1000)
    const view: RunMessages = {full: []}
    return chat({
      adapter: guardedAdapter(plan.adapter, {
        ended: entry.ending.promise,
        firstOutputMs: config.firstOutputTimeoutMs,
        onSilence: () =>
          entry.ending.resolve({
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
      tools: [...(coded?.tools ?? []), ...gatedTools(plan.asking, approvals)],
      lazyToolsConfig: {includeDescription: 'first-sentence'},
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
        withSandbox(sandbox, {
          runs: stores.runs,
          locks,
          durability: {adapter: durability, journal: config.sandbox.journalDir, detachOnDisconnect: true},
        }),
        concivTurn(turn, plan, granted, view, entry),
      ],
    })
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
    endRuns: async (threadId) => {
      const ending = liveRunsOf(threadId).map(([, entry]) => entry.settled.promise)
      await endRuns(threadId)
      await Promise.all(ending)
    },
    settled: async (threadId) => {
      await Promise.all(liveRunsOf(threadId).map(([, entry]) => entry.settled.promise))
    },
    hydrate: async (threadId) => {
      const stopping = liveRunsOf(threadId).filter(([, entry]) => entry.controller.signal.aborted)
      await Promise.all(stopping.map(([, entry]) => entry.settled.promise))
      const response = await reconstructChat(
        persistence,
        new Request(`http://conciv.local/chat?threadId=${encodeURIComponent(threadId)}`),
      )
      const thread = ReconstructedSchema.parse(await response.json())
      const latest = (await stores.runs.listByThread(threadId)).at(-1)
      return {...thread, lastRun: latest === undefined ? null : lifecycleOf(latest)}
    },
    codeRunner: (codeMode) => {
      if (driver === null) return null
      const coded = codeModeTools(driver, codeMode, (value) => value, debug)
      if (coded === null) return null
      const execute = coded.execute.execute
      if (!execute) return null
      return {
        systemPrompt: coded.systemPrompt,
        run: async (code, emit) => {
          const result: unknown = await execute({typescriptCode: code}, {emitCustomEvent: emit})
          const refusal = secretRefusalOf(result)
          if (refusal !== null) throw new Error(refusal)
          return result
        },
        discover: discoveryOf(coded.discover),
      }
    },
  }
}
