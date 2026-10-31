import {z} from 'zod'
import {
  chat,
  chatParamsFromRequestBody,
  defineChatMiddleware,
  EventType,
  memoryStream,
  requestRunCancel,
  resolveResumeRunId,
  resumeServerSentEventsResponse,
  resumeWebSocketStream,
  RUN_CANCEL_REASON,
  toServerSentEventsResponse,
  toWebSocketStream,
  type DebugConfig,
  type MetadataStore,
  type RunRecord,
  type RunStore,
  type StreamDurability,
  type TokenUsage,
  type WebSocketLike,
} from '@tanstack/ai'
import {defineLock, InMemoryLockStore, withLocks} from '@tanstack/ai/locks'
import type {IsolateDriver} from '@tanstack/ai-code-mode'
import {defineAIPersistence, reconstructChat, withPersistence, type MessageStore} from '@tanstack/ai-persistence'
import {
  APPROVAL_REQUESTED_EVENT,
  approvalId,
  defineSandbox,
  defineSandboxPolicy,
  withSandbox,
} from '@tanstack/ai-sandbox'
import {localProcessSandbox} from '@tanstack/ai-sandbox-local-process'
import {makeTextAdapter, type TextAdapter} from '../adapters/adapters.js'
import {runLifecycleEvent, type ChatEvent, type RunLifecycle, type RunPhase} from '@conciv/protocol/chat-event-types'
import type {ChatMessage, ModelMessage} from '@conciv/protocol/chat-message-types'
import type {ChatTool} from '@conciv/protocol/chat-tool-types'
import {childCards} from './child-cards.js'
import {codeModeTools, loadIsolateDriver, secretRefusalOf} from './code-mode.js'
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

export type CommandRules = {allow: readonly string[]; ask: readonly string[]; deny: readonly string[]}

export type Turn = {threadId: string; runId: string; kind: 'chat' | 'compact'}

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
}

export type ChatServerConfig = {
  stores: ChatStores
  sandbox: {dir: string; journalDir: string; commands: CommandRules}
  hooks: TurnHooks
  codeModeResult: (value: unknown) => unknown
  firstOutputTimeoutMs: number
  log: (message: string) => void
}

export type SocketSink = {send: (data: string) => void; close: (code?: number, reason?: string) => void}

export type ChatSocket = {open: (sink: SocketSink) => void; message: (data: unknown) => void; close: () => void}

export type ChatThread = {messages: ChatMessage[]; activeRun: {runId: string} | null; lastRun: RunLifecycle | null}

export type CodeDiscovery = {description: string; run: (toolNames: string[]) => Promise<unknown>}

export type CodeRunner = {
  systemPrompt: string
  run: (code: string, emit: CustomEventSink) => Promise<unknown>
  discover: CodeDiscovery | null
  asking: ChatTool[]
}

export type CustomEventSink = (name: string, value: Record<string, unknown>) => void

export type ChatServer = {
  socket: (request: Request) => ChatSocket
  events: (request: Request) => Promise<Response>
  resume: (request: Request) => Response | null
  drive: (turn: Turn, messages: ModelMessage[]) => Promise<void>
  stop: (threadId: string, runIds?: readonly string[]) => Promise<void>
  endRuns: (threadId: string) => Promise<void>
  hydrate: (threadId: string) => Promise<ChatThread>
  codeRunner: (codeMode: readonly ChatTool[], asking: readonly ChatTool[], approvals: Approvals) => CodeRunner | null
}

const LIVE_BATCH = 1

const FROM_START = '-1'

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

async function* noStream(): AsyncGenerator<ChatEvent> {}

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

type SocketHandler = (event: {data: unknown}) => void

function socketLike(sink: SocketSink, handlers: {message: SocketHandler[]; close: (() => void)[]}): WebSocketLike {
  function addEventListener(type: 'message', handler: (event: {data: unknown}) => void): void
  function addEventListener(type: 'close' | 'error', handler: () => void): void
  function addEventListener(type: 'message' | 'close' | 'error', handler: (event: {data: unknown}) => void): void {
    if (type === 'message') handlers.message.push(handler)
    if (type === 'close') handlers.close.push(() => handler({data: null}))
  }
  return {send: (data) => sink.send(data), close: (code, reason) => sink.close(code, reason), addEventListener}
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
  ending: PromiseWithResolvers<ChatEvent>
  settled: PromiseWithResolvers<void>
}

type RunMessages = {full: ModelMessage[]}

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
    policy: defineSandboxPolicy({
      default: 'ask',
      commands: {
        allow: [...config.sandbox.commands.allow],
        ask: [...config.sandbox.commands.ask],
        deny: [...config.sandbox.commands.deny],
      },
    }),
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
    const settle = async (): Promise<void> => {
      live.delete(turn.runId)
      const lifecycle = await recordLifecycle(turn.runId)
      if (lifecycle !== null) await hooks.end(turn, lifecycle)
      entry.settled.resolve()
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
        const shaped = await plan.chunk(chunk)
        if (chunk.type === EventType.RUN_STARTED) {
          const lifecycle = await recordLifecycle(turn.runId)
          return lifecycle === null ? shaped : [...shaped, lifecycleChunk(lifecycle)]
        }
        const phase = terminalPhaseOf(chunk)
        if (phase === null) return shaped
        const error = chunk.type === EventType.RUN_ERROR ? chunk.message : null
        failure.message = error
        return [await terminalChunk(turn.runId, phase, error), ...shaped]
      },
      onUsage: (_ctx, usage) => hooks.usage(turn, usage),
      onFinish: settle,
      onError: settle,
      onAbort: async () => {
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

  const linkedController = (signal: AbortSignal): AbortController => {
    const controller = new AbortController()
    signal.addEventListener('abort', () => controller.abort(signal.reason), {once: true, signal: controller.signal})
    return controller
  }

  const seenRun = (runId: string): boolean => live.has(runId) || stores.runs.known(runId)

  const serveSocket = (socket: WebSocketLike, request: Request): void => {
    const resumed = memoryStream(request)
    if (resolveResumeRunId(request) !== null && resumed.resumeFrom() !== null) {
      resumeWebSocketStream(socket, {adapter: resumed, debug})
      return
    }
    const durabilities = new WeakMap<Request, StreamDurability>()
    toWebSocketStream(socket, request, {
      debug,
      durability: (ctx) => {
        const offset = seenRun(ctx.runId) ? {offset: FROM_START} : {}
        const adapter = memoryStream({runId: ctx.runId, ...offset})
        durabilities.set(ctx.request, adapter)
        return adapter
      },
      onRun: (ctx) => {
        const durability = durabilities.get(ctx.request)
        if (durability === undefined) throw new Error(`run ${ctx.runId} reached onRun without its durability log`)
        if (durability.resumeFrom() !== null) return noStream()
        return run(
          {threadId: ctx.threadId, runId: ctx.runId, kind: 'chat'},
          ctx.messages,
          durability,
          linkedController(ctx.signal),
        )
      },
      batch: LIVE_BATCH,
    })
  }

  const parsedParams = async (request: Request) => {
    try {
      return await chatParamsFromRequestBody(await request.json())
    } catch (error) {
      config.log(`[ai] refused a chat request: ${String(error)}`)
      return null
    }
  }

  return {
    socket: (request) => {
      const handlers: {message: SocketHandler[]; close: (() => void)[]} = {message: [], close: []}
      return {
        open: (sink) => serveSocket(socketLike(sink, handlers), request),
        message: (data) => {
          for (const handler of handlers.message) handler({data})
        },
        close: () => {
          for (const handler of handlers.close) handler()
        },
      }
    },
    events: async (request) => {
      const params = await parsedParams(request)
      if (params === null) return Response.json({message: 'the request is not a valid chat run'}, {status: 400})
      if (seenRun(params.runId)) {
        return resumeServerSentEventsResponse({adapter: memoryStream({runId: params.runId, offset: FROM_START})})
      }
      const durability = memoryStream({runId: params.runId})
      const controller = new AbortController()
      const stream = run(
        {threadId: params.threadId, runId: params.runId, kind: 'chat'},
        params.messages,
        durability,
        controller,
      )
      return toServerSentEventsResponse(stream, {
        abortController: controller,
        durability: {adapter: durability, batch: LIVE_BATCH},
        debug,
      })
    },
    resume: (request) => {
      if (resolveResumeRunId(request) === null) return null
      const durability = memoryStream(request)
      if (durability.resumeFrom() === null) return null
      return resumeServerSentEventsResponse({adapter: durability})
    },
    drive: async (turn, messages) => {
      const durability = memoryStream({runId: turn.runId})
      const controller = new AbortController()
      const response = toServerSentEventsResponse(run(turn, messages, durability, controller), {
        abortController: controller,
        durability: {adapter: durability, batch: LIVE_BATCH},
        debug,
      })
      await response.text()
    },
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
    hydrate: async (threadId) => {
      const response = await reconstructChat(
        persistence,
        new Request(`http://conciv.local/chat?threadId=${encodeURIComponent(threadId)}`),
      )
      const thread = ReconstructedSchema.parse(await response.json())
      const latest = (await stores.runs.listByThread(threadId)).at(-1)
      return {...thread, lastRun: latest === undefined ? null : lifecycleOf(latest)}
    },
    codeRunner: (codeMode, asking, approvals) => {
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
        asking: gatedTools(asking, () => approvals),
      }
    },
  }
}
