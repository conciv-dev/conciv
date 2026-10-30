import {randomUUID} from 'node:crypto'
import {
  chat,
  chatParamsFromRequestBody,
  defineChatMiddleware,
  EventType,
  generateMessageId,
  memoryStream,
  requestRunCancel,
  resolveResumeRunId,
  resumeServerSentEventsResponse,
  resumeWebSocketStream,
  RUN_ACCEPTED_EVENT,
  RUN_CANCEL_REASON,
  StreamProcessor,
  toServerSentEventsResponse,
  toWebSocketStream,
  withTanstackMetadata,
  type ChatMiddleware,
  type DebugConfig as LibraryDebugConfig,
  type Logger as LibraryLogger,
  type RunRecord as LibraryRunRecord,
  type RunStatus as LibraryRunStatus,
  type RunStore as LibraryRunStore,
  type StreamDurability as LibraryStreamDurability,
  type WebSocketLike as LibraryWebSocketLike,
} from '@tanstack/ai'
import {InMemoryLockStore} from '@tanstack/ai/locks'
import {
  createCodeMode,
  generateTypeStubs,
  toolsToBindings,
  type CodeModeToolConfig,
  type CreateCodeModeResult,
  type IsolateDriver as LibraryIsolateDriver,
  type ToolBinding as LibraryToolBinding,
} from '@tanstack/ai-code-mode'
import type {MessageStore as LibraryMessageStore, MetadataStore as LibraryMetadataStore} from '@tanstack/ai-persistence'
import {
  defineSandbox,
  defineSandboxPolicy,
  evaluateCommand,
  nodeHttpBridgeProvisioner,
  provideToolBridgeProvisioner,
  ToolBridgeProvisionerCapability,
  withSandbox,
  type PolicyDecision,
  type ProvisionedBridge as LibraryProvisionedBridge,
  type SandboxDefinition as LibrarySandboxDefinition,
  type SandboxPolicy,
  type ToolBridgeProvisioner as LibraryToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import {localProcessSandbox} from '@tanstack/ai-sandbox-local-process'
import type {TextAdapter} from '../adapters/adapters.js'
import type {ChatCustomEvent, ChatEvent} from '../events/events.js'
import type {ChatMessage, ContentPart, ModelMessage} from '../messages/messages.js'
import type {ChatTool} from '../tools/tools.js'

export type RunRecord = LibraryRunRecord

export type RunStatus = LibraryRunStatus

export type RunStore = LibraryRunStore

export type RunPatch = Parameters<RunStore['update']>[1]

export type StreamDurability = LibraryStreamDurability

export type SandboxDefinition = LibrarySandboxDefinition

export type CommandDecision = PolicyDecision

export type CommandPolicy = SandboxPolicy

export type ToolProvisioner = LibraryToolBridgeProvisioner

export type ProvisionedTools = LibraryProvisionedBridge

export type WebSocketLike = LibraryWebSocketLike

export type DebugConfig = LibraryDebugConfig

export type Logger = LibraryLogger

export type MessageStore = LibraryMessageStore

export type MetadataStore = LibraryMetadataStore

export type IsolateDriver = LibraryIsolateDriver

export type ToolBinding = LibraryToolBinding

export type CodeModeConfig = CodeModeToolConfig

export type CodeModeTools = CreateCodeModeResult

export type TurnMiddleware = ChatMiddleware

export type TurnDurability = {adapter: StreamDurability; journal: string; detachOnDisconnect: boolean}

export type TurnRun = {runs: RunStore; durability: TurnDurability}

export type TurnOptions = {
  adapter: TextAdapter
  messages: Array<ChatMessage | ModelMessage>
  threadId: string
  sandbox: SandboxDefinition
  middleware: TurnMiddleware[]
  systemPrompts?: string[]
  runId?: string
  tools?: ChatTool[]
  modelOptions?: Record<string, unknown>
  run?: TurnRun
  abortController?: AbortController
  debug?: DebugConfig
}

export function runTurn(options: TurnOptions): AsyncIterable<ChatEvent> {
  return chat({
    adapter: options.adapter,
    messages: options.messages,
    systemPrompts: options.systemPrompts,
    threadId: options.threadId,
    runId: options.runId,
    tools: options.tools,
    lazyToolsConfig: {includeDescription: 'first-sentence'},
    modelOptions: options.modelOptions,
    middleware: [withSandbox(options.sandbox, options.run), ...options.middleware],
    abortController: options.abortController,
    debug: options.debug,
  })
}

export type ToolRefusal = (toolName: string, input: unknown, toolUseId: string) => Promise<string | null>

function permissionRequestFields(request: {tool_name?: string; input?: unknown}): {
  toolName: string
  input: unknown
  toolUseId: string
} {
  const record: Record<string, unknown> = {...request}
  return {
    toolName: typeof record.tool_name === 'string' ? record.tool_name : 'tool',
    input: record.input,
    toolUseId: typeof record.tool_use_id === 'string' ? record.tool_use_id : randomUUID(),
  }
}

function refusingTools(tools: ChatTool[], refusal: ToolRefusal): ChatTool[] {
  return tools.map((tool) => {
    const execute = tool.execute
    if (!execute) return tool
    return {
      ...tool,
      execute: async (args: unknown, context: unknown) => {
        const refused = await refusal(tool.name, args, randomUUID())
        if (refused !== null) throw new Error(refused)
        return execute(args, context)
      },
    }
  })
}

export function toolGateProvisioner(refusal: ToolRefusal): ToolProvisioner {
  return {
    provision: (tools, options) =>
      nodeHttpBridgeProvisioner.provision(refusingTools(tools, refusal), {
        ...options,
        permission: options.permission
          ? {
              ...options.permission,
              resolve: async (request) => {
                const {toolName, input, toolUseId} = permissionRequestFields(request)
                const refused = await refusal(toolName, input, toolUseId)
                return refused === null
                  ? {behavior: 'allow', updatedInput: input ?? {}}
                  : {behavior: 'deny', message: 'Denied by user'}
              },
            }
          : undefined,
      }),
  }
}

export function toolGateMiddleware(name: string, provisioner: ToolProvisioner): TurnMiddleware {
  return defineChatMiddleware({
    name,
    provides: [ToolBridgeProvisionerCapability],
    setup(ctx) {
      provideToolBridgeProvisioner(ctx, provisioner)
    },
  })
}

export function defineCommandPolicy(rules: {
  default: CommandDecision
  ask: readonly string[]
  allow: readonly string[]
}): CommandPolicy {
  return defineSandboxPolicy({default: rules.default, commands: {ask: [...rules.ask], allow: [...rules.allow]}})
}

export function decideCommand(command: string, policy: CommandPolicy): CommandDecision {
  return evaluateCommand(command, policy)
}

export function defineLocalSandbox(options: {id: string; dir: string}): SandboxDefinition {
  return defineSandbox({
    id: options.id,
    provider: localProcessSandbox({dir: options.dir}),
    policy: defineSandboxPolicy({default: 'ask'}),
    fileEvents: false,
    lifecycle: {reuse: 'thread', destroyOnComplete: false},
  })
}

export function withRunMetadata(event: ChatCustomEvent, run: {threadId: string; runId: string}): ChatEvent {
  return withTanstackMetadata(event, run)
}

export function newMessageId(): string {
  return generateMessageId()
}

export function runAcceptedEvent(): ChatEvent {
  return {type: EventType.CUSTOM, name: RUN_ACCEPTED_EVENT, value: {}, timestamp: Date.now()}
}

export function abortRun(controller: AbortController): void {
  controller.abort(RUN_CANCEL_REASON)
}

export function requestCancel(runs: RunStore, runId: string): Promise<void> {
  return requestRunCancel(runs, runId)
}

export function memoryDurability(
  runId: string,
  offset: string | null,
  options: {firstChunkDeadlineMs: number},
): StreamDurability {
  return memoryStream({runId, offset}, options)
}

export type KeyedLocks = {
  serialize: <T>(key: string, section: () => Promise<T>) => Promise<T>
}

export function createKeyedLocks(): KeyedLocks {
  const locks = new InMemoryLockStore()
  return {serialize: (key, section) => locks.withLock(key, section)}
}

export type AsyncQueue<T> = AsyncIterable<T> & {push: (value: T) => void; end: () => void}

type QueueWaiter<T> = (result: IteratorResult<T>) => void

export function createAsyncQueue<T>(): AsyncQueue<T> {
  const values: {value: T}[] = []
  const waiters: QueueWaiter<T>[] = []
  const state = {ended: false}
  const next = (): Promise<IteratorResult<T>> => {
    const queued = values.shift()
    if (queued) return Promise.resolve({value: queued.value, done: false})
    if (state.ended) return Promise.resolve({value: undefined, done: true})
    return new Promise((resolve) => {
      waiters.push(resolve)
    })
  }
  return {
    push: (value) => {
      if (state.ended) return
      const waiter = waiters.shift()
      if (waiter) {
        waiter({value, done: false})
        return
      }
      values.push({value})
    },
    end: () => {
      if (state.ended) return
      state.ended = true
      for (const waiter of waiters.splice(0)) waiter({value: undefined, done: true})
    },
    [Symbol.asyncIterator]: () => ({next}),
  }
}

export type MessageFold = {
  fold: (event: ChatEvent) => void
  addUserMessage: (content: string | ContentPart[], id?: string) => void
  messages: () => ChatMessage[]
}

export function createMessageFold(onMessagesChange?: (messages: ChatMessage[]) => void): MessageFold {
  const processor = new StreamProcessor(onMessagesChange === undefined ? {} : {events: {onMessagesChange}})
  return {
    fold: (event) => processor.processChunk(event),
    addUserMessage: (content, id) => {
      processor.addUserMessage(content, id)
    },
    messages: () => processor.getMessages(),
  }
}

export type TurnRequest = {
  threadId: string
  runId: string
  messages: Array<ChatMessage | ModelMessage>
  signal: AbortSignal
}

export type TurnStream = (request: TurnRequest) => AsyncIterable<ChatEvent>

export type TurnDelivery = {
  onTurn: TurnStream
  durability: (runId: string) => StreamDurability
  durabilityAt: (runId: string, offset: string) => StreamDurability
  batch: number
}

function nonEmpty(value: string | null): string | null {
  return value === null || value.length === 0 ? null : value
}

function resumeOffsetOf(request: Request): string | null {
  return nonEmpty(request.headers.get('last-event-id')) ?? nonEmpty(new URL(request.url).searchParams.get('offset'))
}

export function serveTurnSocket(socket: WebSocketLike, request: Request, delivery: TurnDelivery): void {
  const offset = resumeOffsetOf(request)
  const runId = resolveResumeRunId(request)
  if (offset !== null && runId !== null) {
    resumeWebSocketStream(socket, {adapter: delivery.durabilityAt(runId, offset)})
    return
  }
  toWebSocketStream(socket, request, {
    onRun: (ctx) => delivery.onTurn(ctx),
    durability: (ctx) => delivery.durability(ctx.runId),
    batch: delivery.batch,
  })
}

export async function serveTurnEvents(body: unknown, delivery: TurnDelivery): Promise<Response> {
  const params = await chatParamsFromRequestBody(body)
  const abortController = new AbortController()
  const stream = delivery.onTurn({...params, signal: abortController.signal})
  return toServerSentEventsResponse(stream, {
    abortController,
    durability: {adapter: delivery.durability(params.runId), batch: delivery.batch},
  })
}

export function resumeTurnEvents(request: Request, delivery: TurnDelivery): Response | null {
  const offset = resumeOffsetOf(request)
  const runId = resolveResumeRunId(request)
  if (offset === null || runId === null) return null
  return resumeServerSentEventsResponse({adapter: delivery.durabilityAt(runId, offset)})
}

export function createCodeModeTools(config: CodeModeConfig): CodeModeTools {
  return createCodeMode(config)
}

export function codeModeBindings(tools: CodeModeConfig['tools'], prefix: string): Record<string, ToolBinding> {
  return toolsToBindings(tools, prefix)
}

export function codeModeTypeStubs(bindings: Record<string, ToolBinding>): string {
  return generateTypeStubs(bindings)
}

export type IsolateLimits = {timeoutMs: number; memoryLimitMb: number; maxStackBytes: number}

export type DriverCandidate = {name: string; create: () => Promise<IsolateDriver | null>}

export function isolateDriverCandidates(limits: IsolateLimits): DriverCandidate[] {
  return [
    {
      name: '@tanstack/ai-isolate-node',
      create: async () => {
        const loaded = await import('@tanstack/ai-isolate-node')
        if (!loaded.probeIsolatedVm().compatible) return null
        return loaded.createNodeIsolateDriver({timeout: limits.timeoutMs})
      },
    },
    {
      name: '@tanstack/ai-isolate-quickjs',
      create: async () => {
        const loaded = await import('@tanstack/ai-isolate-quickjs')
        return loaded.createQuickJSIsolateDriver({
          timeout: limits.timeoutMs,
          memoryLimit: limits.memoryLimitMb,
          maxStackSize: limits.maxStackBytes,
        })
      },
    },
  ]
}
