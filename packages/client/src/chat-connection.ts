import {AsyncQueue} from '@tanstack/ai-acp'
import {
  fetchServerSentEvents,
  webSocket,
  type ConnectConnectionAdapter,
  type SubscribeConnectionAdapter,
} from '@tanstack/ai-client'
import type {ModelMessage, StreamChunk, UIMessage} from '@tanstack/ai'
import {CHAT_SSE_PATH, CHAT_WS_PATH} from '@conciv/protocol/chat-types'
import {runLifecycleOf, type RunLifecycle} from '@conciv/protocol/run-types'
import type {ChatHydration, RpcClient} from '@conciv/contract'

export type ChatTransport = 'websocket' | 'sse'

export type ChatConnectionOptions = {
  transport?: ChatTransport | 'auto'
  probeTimeoutMs?: number
  onLifecycle?: (lifecycle: RunLifecycle) => void
  onTransport?: (transport: ChatTransport) => void
}

export type ChatConnection = SubscribeConnectionAdapter & {
  joinRun: (runId: string, abortSignal?: AbortSignal) => AsyncIterable<StreamChunk>
  hydrate: (threadId: string) => Promise<ChatHydration>
  transport: () => ChatTransport | null
  refresh: () => Promise<ChatHydration>
}

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

function subscribeOver(adapter: ConnectConnectionAdapter): SubscribeConnectionAdapter {
  const listeners = new Set<AsyncQueue<StreamChunk>>()
  return {
    subscribe: (abortSignal) => {
      const queue = new AsyncQueue<StreamChunk>()
      listeners.add(queue)
      const stop = (): void => {
        listeners.delete(queue)
        queue.end()
      }
      abortSignal?.addEventListener('abort', stop, {once: true})
      return queue
    },
    send: async (messages, data, abortSignal, runContext) => {
      for await (const chunk of adapter.connect(messages, data, abortSignal, runContext)) {
        for (const queue of listeners) queue.push(chunk)
      }
    },
  }
}

type Selected = {transport: ChatTransport; adapter: SubscribeConnectionAdapter; joinRun: JoinRun}
type JoinRun = (runId: string, abortSignal?: AbortSignal) => AsyncIterable<StreamChunk>

function overSocket(apiBase: string): Selected {
  const adapter = webSocket(chatSocketUrl(apiBase))
  return {transport: 'websocket', adapter, joinRun: (runId, signal) => adapter.joinRun(runId, signal)}
}

function overEvents(apiBase: string): Selected {
  const adapter = fetchServerSentEvents(chatEventsUrl(apiBase))
  return {transport: 'sse', adapter: subscribeOver(adapter), joinRun: (runId, signal) => adapter.joinRun(runId, signal)}
}

async function select(apiBase: string, options: ChatConnectionOptions): Promise<Selected> {
  const preference = options.transport ?? 'auto'
  if (preference === 'sse') return overEvents(apiBase)
  if (preference === 'websocket') return overSocket(apiBase)
  const opened = await socketOpens(chatSocketUrl(apiBase), options.probeTimeoutMs ?? PROBE_TIMEOUT_MS)
  return opened ? overSocket(apiBase) : overEvents(apiBase)
}

async function* watching(
  selected: Promise<Selected>,
  onLifecycle: ((lifecycle: RunLifecycle) => void) | undefined,
  abortSignal: AbortSignal | undefined,
): AsyncGenerator<StreamChunk> {
  const chosen = await selected
  for await (const chunk of chosen.adapter.subscribe(abortSignal)) {
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
  const chosen = {transport: null as ChatTransport | null}
  const selected = select(apiBase, options).then((choice) => {
    chosen.transport = choice.transport
    options.onTransport?.(choice.transport)
    return choice
  })
  const hydrate = (threadId: string): Promise<ChatHydration> => rpc.chat.hydrate({sessionId: threadId})
  return {
    subscribe: (abortSignal) => watching(selected, options.onLifecycle, abortSignal),
    send: async (messages: Array<UIMessage> | Array<ModelMessage>, data, abortSignal, runContext) => {
      await (await selected).adapter.send(messages, data, abortSignal, runContext)
    },
    joinRun: (runId, abortSignal) => joining(selected, runId, abortSignal),
    hydrate,
    transport: () => chosen.transport,
    refresh: () => hydrate(sessionId),
  }
}
