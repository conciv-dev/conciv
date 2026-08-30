import {
  fetchServerSentEvents,
  webSocket,
  type ResumableConnectConnectionAdapter,
  type SubscribeConnectionAdapter,
} from '@tanstack/ai-client'
import type {ModelMessage, StreamChunk, UIMessage} from '@tanstack/ai'
import {CHAT_SSE_PATH, CHAT_WS_PATH} from '@conciv/protocol/chat-types'
import {runLifecycleOf, type RunLifecycle} from '@conciv/protocol/run-types'
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
  onHydrated?: () => void
}

export type ChatConnection = SubscribeConnectionAdapter & {
  joinRun: (runId: string, abortSignal?: AbortSignal) => AsyncIterable<StreamChunk>
  hydrate: (threadId: string) => Promise<ChatHydration>
  transport: () => ChatTransport | null
  refresh: () => Promise<ChatHydration>
}

type PushSource = () => {events: (abortSignal?: AbortSignal) => AsyncIterable<StreamChunk>; dispose: () => void}

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
type JoinRun = (runId: string, abortSignal?: AbortSignal) => AsyncIterable<StreamChunk>

function overSocket(apiBase: string): Selected {
  const adapter = webSocket(chatSocketUrl(apiBase))
  return {transport: 'websocket', adapter, joinRun: (runId, signal) => adapter.joinRun(runId, signal)}
}

function subscribeOver(adapter: ResumableConnectConnectionAdapter): SubscribeConnectionAdapter {
  const listeners = new Set<WritableStreamDefaultWriter<StreamChunk>>()
  return {
    subscribe: (abortSignal) => {
      const relay = new TransformStream<StreamChunk, StreamChunk>()
      const writer = relay.writable.getWriter()
      listeners.add(writer)
      const stop = (): void => {
        listeners.delete(writer)
        void writer.close().catch(() => undefined)
      }
      abortSignal?.addEventListener('abort', stop, {once: true})
      return readingValues(relay.readable)
    },
    send: async (messages, data, abortSignal, runContext) => {
      for await (const chunk of adapter.connect(messages, data, abortSignal, runContext)) {
        for (const writer of listeners) void writer.write(chunk).catch(() => undefined)
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

async function select(apiBase: string, options: ChatConnectionOptions): Promise<Selected> {
  const preference = options.transport ?? 'auto'
  if (preference === 'fetch') return overEvents(apiBase)
  if (preference === 'websocket') return overSocket(apiBase)
  const opened = await socketOpens(chatSocketUrl(apiBase), options.probeTimeoutMs ?? PROBE_TIMEOUT_MS)
  return opened ? overSocket(apiBase) : overEvents(apiBase)
}

async function pumpInto<T>(source: AsyncIterable<T>, emit: (value: T) => void): Promise<void> {
  for await (const value of source) emit(value)
}

function merged<T>(sources: readonly AsyncIterable<T>[], abortSignal: AbortSignal | undefined): AsyncGenerator<T> {
  return relayedValues<T>((emit) => {
    for (const source of sources) void pumpInto(source, emit).catch(() => undefined)
    return () => undefined
  }, abortSignal)
}

async function* watching(
  selected: Promise<Selected>,
  push: PushSource,
  onLifecycle: ((lifecycle: RunLifecycle) => void) | undefined,
  abortSignal: AbortSignal | undefined,
): AsyncGenerator<StreamChunk> {
  const chosen = await selected
  const channel = push()
  try {
    yield* relayLifecycle(
      merged([chosen.adapter.subscribe(abortSignal), channel.events(abortSignal)], abortSignal),
      onLifecycle,
    )
  } finally {
    channel.dispose()
  }
}

async function* relayLifecycle(
  source: AsyncIterable<StreamChunk>,
  onLifecycle: ((lifecycle: RunLifecycle) => void) | undefined,
): AsyncGenerator<StreamChunk> {
  for await (const chunk of source) {
    if (onLifecycle) {
      const lifecycle = runLifecycleOf(chunk)
      if (lifecycle) onLifecycle(lifecycle)
    }
    yield chunk
  }
}

async function* joining(
  selected: Promise<Selected>,
  runId: string,
  abortSignal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  yield* (await selected).joinRun(runId, abortSignal)
}

export function chatConnection(
  rpc: RpcClient,
  apiBase: string,
  sessionId: string,
  options: ChatConnectionOptions = {},
): ChatConnection {
  const push: PushSource = () => acquirePushChannel({apiBase, sessionId})
  const chosen = {transport: null as ChatTransport | null}
  const selected = select(apiBase, options).then((choice) => {
    chosen.transport = choice.transport
    options.onTransport?.(choice.transport)
    return choice
  })
  const hydrate = async (threadId: string): Promise<ChatHydration> => {
    const hydration = await rpc.chat.hydrate({sessionId: threadId})
    options.onHydrated?.()
    return hydration
  }
  return {
    subscribe: (abortSignal) => watching(selected, push, options.onLifecycle, abortSignal),
    send: async (messages: Array<UIMessage> | Array<ModelMessage>, data, abortSignal, runContext) => {
      await (await selected).adapter.send(messages, data, abortSignal, runContext)
    },
    joinRun: (runId, abortSignal) => joining(selected, runId, abortSignal),
    hydrate,
    transport: () => chosen.transport,
    refresh: () => hydrate(sessionId),
  }
}
