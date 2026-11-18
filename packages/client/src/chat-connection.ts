import {rpcStream, type ConnectConnectionAdapter, type SubscribeConnectionAdapter} from '@conciv/ai/client'
import {type ModelMessage, type ChatMessage} from '@conciv/protocol/chat-message-types'
import {
  type ChatEvent,
  ChatEventType,
  idleFailedEvent,
  runLifecycleEvent,
  sessionRunEvent,
  type RunLifecycle,
  readApprovalAsk,
  readApprovalSettled,
  type ApprovalAsk,
} from '@conciv/protocol/chat-event-types'
import {CHAT_HISTORY_PAGE_SIZE} from '@conciv/protocol/chat-types'
import {type ChatHistoryWindow, type ChatHydration, type RpcClient} from '@conciv/contract'
import {readingValues, relayedValues} from './stream-relay.js'

export type ChatConnectionOptions = {
  onLifecycle?: (lifecycle: RunLifecycle) => void
  onHydrated?: (hydration: ChatHydration) => void
  onApprovalAsk?: (ask: ApprovalAsk) => void
  onApprovalSettled?: (approvalId: string) => void
  onRunError?: () => void
  joinsRun?: (runId: string) => Promise<boolean>
}

export type ChatConnection = SubscribeConnectionAdapter & {
  joinRun: (runId: string, abortSignal?: AbortSignal) => AsyncIterable<ChatEvent>
  hydrate: (threadId: string, window?: ChatHistoryWindow) => Promise<ChatHydration>
  refresh: (before?: string) => Promise<ChatHydration>
  close: () => void
}

type SessionEvents = (abortSignal: AbortSignal) => AsyncIterable<ChatEvent>

type JoinRun = (runId: string, abortSignal?: AbortSignal) => AsyncIterable<ChatEvent>

type Turns = {adapter: SubscribeConnectionAdapter; joinRun: JoinRun}

function within(lifetime: AbortSignal, abortSignal: AbortSignal | undefined): AbortSignal {
  return abortSignal === undefined ? lifetime : AbortSignal.any([lifetime, abortSignal])
}

async function* streamed(
  opened: (signal: AbortSignal) => Promise<AsyncIterable<ChatEvent>>,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  try {
    yield* await opened(signal)
  } catch (error) {
    if (!signal.aborted) throw error
  }
}

function overRpc(rpc: RpcClient, sessionId: string, lifetime: AbortSignal): Turns {
  const joinRun: JoinRun = (runId, abortSignal) =>
    streamed((signal) => rpc.chat.join({runId}, {signal}), within(lifetime, abortSignal))
  const turns = rpcStream(
    (_messages, _data, abortSignal, input) =>
      streamed(
        (signal) => rpc.chat.send({sessionId, runId: input.runId, messages: input.messages}, {signal}),
        within(lifetime, abortSignal),
      ),
    {joinRun},
  )
  return {adapter: subscribeOver(turns), joinRun}
}

function subscribeOver(adapter: ConnectConnectionAdapter): SubscribeConnectionAdapter {
  const listeners = new Set<(chunk: ChatEvent) => void>()
  return {
    subscribe: (abortSignal) =>
      relayedValues<ChatEvent>((emit) => {
        listeners.add(emit)
        return () => listeners.delete(emit)
      }, abortSignal),
    send: async (messages, data, abortSignal, runContext) => {
      for await (const chunk of adapter.connect(messages, data, abortSignal, runContext)) {
        for (const emit of listeners) emit(chunk)
      }
    },
  }
}

type Source<T> = (abortSignal: AbortSignal) => AsyncIterable<T>

async function pumpInto<T>(
  source: AsyncIterable<T>,
  controller: ReadableStreamDefaultController<T>,
  scope: AbortSignal,
): Promise<void> {
  for await (const value of source) {
    if (scope.aborted) return
    controller.enqueue(value)
  }
}

function merged<T>(sources: readonly Source<T>[], abortSignal: AbortSignal | undefined): AsyncGenerator<T> {
  const scope = new AbortController()
  const lifetime = AbortSignal.any(abortSignal ? [abortSignal, scope.signal] : [scope.signal])
  const readable = new ReadableStream<T>({
    start: async (controller) => {
      try {
        await Promise.all(sources.map((source) => pumpInto(source(lifetime), controller, lifetime)))
      } finally {
        scope.abort()
      }
      controller.close()
    },
    cancel: () => scope.abort(),
  })
  return readingValues(readable)
}

async function* announcedRuns(
  turns: Turns,
  events: SessionEvents,
  options: ChatConnectionOptions,
  scope: AbortSignal,
  threadId: string,
): AsyncGenerator<ChatEvent> {
  for await (const chunk of events(scope)) {
    if (scope.aborted) return
    const announced = sessionRunEvent.parse(chunk)
    if (announced === null || !(await options.joinsRun?.(announced.runId))) continue
    yield* finishedOnItsLifecycle(turns.joinRun(announced.runId, scope), threadId, announced.runId)
  }
}

async function* finishedOnItsLifecycle(
  joined: AsyncIterable<ChatEvent>,
  threadId: string,
  runId: string,
): AsyncGenerator<ChatEvent> {
  for await (const chunk of joined) {
    yield chunk
    const lifecycle = runLifecycleEvent.parse(chunk)
    if (lifecycle?.runId !== runId || lifecycle.phase !== 'aborted') continue
    yield {type: ChatEventType.RUN_FINISHED, threadId, runId, finishReason: 'stop', timestamp: Date.now()}
    return
  }
}

function watching(
  turns: Turns,
  events: SessionEvents,
  options: ChatConnectionOptions,
  abortSignal: AbortSignal | undefined,
  threadId: string,
): AsyncGenerator<ChatEvent> {
  const sources: Source<ChatEvent>[] = [
    (scope) => turns.adapter.subscribe(scope),
    events,
    (scope) => announcedRuns(turns, events, options, scope, threadId),
  ]
  return noticing(merged(sources, abortSignal), options)
}

function notice(chunk: ChatEvent, options: ChatConnectionOptions): void {
  const lifecycle = runLifecycleEvent.parse(chunk)
  if (lifecycle) options.onLifecycle?.(lifecycle)
  const ask = readApprovalAsk(chunk)
  if (ask) options.onApprovalAsk?.(ask)
  const settled = readApprovalSettled(chunk)
  if (settled) options.onApprovalSettled?.(settled)
  if (chunk.type === ChatEventType.RUN_ERROR || idleFailedEvent.parse(chunk) !== null) options.onRunError?.()
}

async function* noticing(source: AsyncIterable<ChatEvent>, options: ChatConnectionOptions): AsyncGenerator<ChatEvent> {
  for await (const chunk of source) {
    notice(chunk, options)
    yield chunk
  }
}

function lastTurn<Message extends {role: string}>(messages: Message[]): Message[] {
  return messages.slice(
    Math.max(
      messages.findLastIndex((message) => message.role === 'user'),
      0,
    ),
  )
}

export function chatConnection(rpc: RpcClient, sessionId: string, options: ChatConnectionOptions = {}): ChatConnection {
  const lifetime = new AbortController()
  const turns = overRpc(rpc, sessionId, lifetime.signal)
  const events: SessionEvents = (abortSignal) =>
    streamed((signal) => rpc.chat.events({sessionId}, {signal}), within(lifetime.signal, abortSignal))
  const hydrate = async (threadId: string, window: ChatHistoryWindow = {}): Promise<ChatHydration> => {
    const hydration = await rpc.chat.hydrate({...window, sessionId: threadId})
    options.onHydrated?.(hydration)
    return hydration
  }
  return {
    subscribe: (abortSignal) => watching(turns, events, options, abortSignal, sessionId),
    send: async (messages: Array<ChatMessage> | Array<ModelMessage>, data, abortSignal, runContext) => {
      const {adapter} = turns
      if (messages.every((message) => 'parts' in message)) {
        await adapter.send(lastTurn(messages), data, abortSignal, runContext)
        return
      }
      await adapter.send(messages, data, abortSignal, runContext)
    },
    joinRun: (runId, abortSignal) =>
      noticing(finishedOnItsLifecycle(turns.joinRun(runId, abortSignal), sessionId, runId), options),
    hydrate,
    refresh: (before) =>
      hydrate(
        sessionId,
        before === undefined ? {limit: CHAT_HISTORY_PAGE_SIZE} : {limit: CHAT_HISTORY_PAGE_SIZE, before},
      ),
    close: () => lifetime.abort(),
  }
}
