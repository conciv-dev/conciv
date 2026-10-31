import {
  fetchServerSentEvents,
  webSocket,
  type ResumableConnectConnectionAdapter,
  type SubscribeConnectionAdapter,
} from '@conciv/ai/client'
import {type ModelMessage, type ChatMessage} from '@conciv/protocol/chat-message-types'
import {
  type ChatEvent,
  ChatEventType,
  runLifecycleEvent,
  sessionRunEvent,
  type RunLifecycle,
  approvalAskOf,
  type ApprovalAsk,
} from '@conciv/protocol/chat-event-types'
import {CHAT_SSE_PATH, CHAT_WS_PATH} from '@conciv/protocol/chat-types'
import type {ChatHydration, RpcClient} from '@conciv/contract'
import {acquirePushChannel} from './push-channel.js'
import {readingValues, relayedValues} from './stream-relay.js'

export type ChatTransport = 'websocket' | 'fetch'

export type ChatTransportPreference = 'auto' | ChatTransport

export type ChatConnectionOptions = {
  transport?: ChatTransportPreference
  probeTimeoutMs?: number
  onLifecycle?: (lifecycle: RunLifecycle) => void
  onTransport?: (transport: ChatTransport) => void
  onHydrated?: (hydration: ChatHydration) => void
  onApprovalAsk?: (ask: ApprovalAsk) => void
  onRunError?: () => void
  joinsRun?: (runId: string) => Promise<boolean>
}

export type ChatConnection = SubscribeConnectionAdapter & {
  joinRun: (runId: string, abortSignal?: AbortSignal) => AsyncIterable<ChatEvent>
  hydrate: (threadId: string) => Promise<ChatHydration>
  transport: () => ChatTransport | null
  refresh: () => Promise<ChatHydration>
  close: () => void
}

type PushEvents = {events: (abortSignal?: AbortSignal) => AsyncIterable<ChatEvent>; dispose: () => void}

type PushSource = () => PushEvents

const PROBE_TIMEOUT_MS = 2_000

function absoluteUrl(apiBase: string, path: string): string {
  const origin = typeof window === 'undefined' ? 'http://127.0.0.1' : window.location.href
  return new URL(`${apiBase}${path}`, origin).toString()
}

export function chatSocketUrl(apiBase: string): string {
  const url = new URL(absoluteUrl(apiBase, CHAT_WS_PATH))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function chatEventsUrl(apiBase: string): string {
  return absoluteUrl(apiBase, CHAT_SSE_PATH)
}

export function socketOpens(url: string, timeoutMs: number): Promise<boolean> {
  if (typeof WebSocket === 'undefined') return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    const socket = new WebSocket(url)
    const settle = (opened: boolean): void => {
      clearTimeout(timer)
      socket.onopen = null
      socket.onerror = null
      socket.onclose = null
      if (socket.readyState <= 1) socket.close()
      resolve(opened)
    }
    const timer = setTimeout(() => settle(false), timeoutMs)
    socket.onopen = () => settle(true)
    socket.onerror = () => settle(false)
    socket.onclose = () => settle(false)
  })
}

type Selected = {transport: ChatTransport; adapter: SubscribeConnectionAdapter; joinRun: JoinRun}
type JoinRun = (runId: string, abortSignal?: AbortSignal) => AsyncIterable<ChatEvent>

function trackingWebSocketImpl(live: Set<WebSocket>): typeof WebSocket {
  return new Proxy(WebSocket, {
    construct: (target, args) => {
      const socket: WebSocket = Reflect.construct(target, args)
      live.add(socket)
      socket.addEventListener('close', () => live.delete(socket), {once: true})
      return socket
    },
  })
}

function overSocket(apiBase: string, live: Set<WebSocket>): Selected {
  const adapter = webSocket(chatSocketUrl(apiBase), {WebSocketImpl: trackingWebSocketImpl(live)})
  return {transport: 'websocket', adapter, joinRun: (runId, signal) => adapter.joinRun(runId, signal)}
}

function subscribeOver(adapter: ResumableConnectConnectionAdapter): SubscribeConnectionAdapter {
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

function overEvents(apiBase: string): Selected {
  const adapter = fetchServerSentEvents(chatEventsUrl(apiBase))
  return {
    transport: 'fetch',
    adapter: subscribeOver(adapter),
    joinRun: (runId, signal) => adapter.joinRun(runId, signal),
  }
}

async function select(apiBase: string, options: ChatConnectionOptions, live: Set<WebSocket>): Promise<Selected> {
  const preference = options.transport ?? 'auto'
  if (preference === 'fetch') return overEvents(apiBase)
  if (preference === 'websocket') return overSocket(apiBase, live)
  const opened = await socketOpens(chatSocketUrl(apiBase), options.probeTimeoutMs ?? PROBE_TIMEOUT_MS)
  return opened ? overSocket(apiBase, live) : overEvents(apiBase)
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
  })
  return readingValues(readable)
}

async function* announcedRuns(
  chosen: Selected,
  channel: PushEvents,
  options: ChatConnectionOptions,
  scope: AbortSignal,
): AsyncGenerator<ChatEvent> {
  for await (const chunk of channel.events(scope)) {
    const announced = sessionRunEvent.parse(chunk)
    if (announced === null || !(await options.joinsRun?.(announced.runId))) continue
    yield* chosen.joinRun(announced.runId, scope)
  }
}

async function* watching(
  selected: Promise<Selected>,
  push: PushSource,
  options: ChatConnectionOptions,
  abortSignal: AbortSignal | undefined,
): AsyncGenerator<ChatEvent> {
  const chosen = await selected
  const channel = push()
  try {
    const sources: Source<ChatEvent>[] = [
      (scope) => chosen.adapter.subscribe(scope),
      (scope) => channel.events(scope),
      (scope) => announcedRuns(chosen, channel, options, scope),
    ]
    yield* noticing(merged(sources, abortSignal), options)
  } finally {
    channel.dispose()
  }
}

function notice(chunk: ChatEvent, options: ChatConnectionOptions): void {
  const lifecycle = runLifecycleEvent.parse(chunk)
  if (lifecycle) options.onLifecycle?.(lifecycle)
  const ask = approvalAskOf(chunk)
  if (ask) options.onApprovalAsk?.(ask)
  if (chunk.type === ChatEventType.RUN_ERROR) options.onRunError?.()
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

async function* joining(
  selected: Promise<Selected>,
  runId: string,
  abortSignal?: AbortSignal,
): AsyncGenerator<ChatEvent> {
  yield* (await selected).joinRun(runId, abortSignal)
}

export function chatConnection(
  rpc: RpcClient,
  apiBase: string,
  sessionId: string,
  options: ChatConnectionOptions = {},
): ChatConnection {
  const push: PushSource = () => acquirePushChannel({apiBase, sessionId})
  const live = new Set<WebSocket>()
  const chosen: {transport: ChatTransport | null} = {transport: null}
  const selected = select(apiBase, options, live).then((choice) => {
    chosen.transport = choice.transport
    options.onTransport?.(choice.transport)
    return choice
  })
  const hydrate = async (threadId: string): Promise<ChatHydration> => {
    const hydration = await rpc.chat.hydrate({sessionId: threadId})
    options.onHydrated?.(hydration)
    return hydration
  }
  return {
    subscribe: (abortSignal) => watching(selected, push, options, abortSignal),
    send: async (messages: Array<ChatMessage> | Array<ModelMessage>, data, abortSignal, runContext) => {
      const {adapter} = await selected
      if (messages.every((message) => 'parts' in message)) {
        await adapter.send(lastTurn(messages), data, abortSignal, runContext)
        return
      }
      await adapter.send(messages, data, abortSignal, runContext)
    },
    joinRun: (runId, abortSignal) => noticing(joining(selected, runId, abortSignal), options),
    hydrate,
    transport: () => chosen.transport,
    refresh: () => hydrate(sessionId),
    close: () => {
      for (const socket of live) socket.close()
      live.clear()
    },
  }
}
