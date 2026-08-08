import {DynamicLink, ORPCError, type ClientLink} from '@orpc/client'
import {RPCLink as FetchRpcLink} from '@orpc/client/fetch'
import {RPCLink as WebsocketRpcLink, type LinkWebsocketClientOptions} from '@orpc/client/websocket'
import {ClientRetryPlugin, type ClientRetryPluginContext} from '@orpc/client/plugins'
import ReconnectingWebSocket from 'partysocket/ws'

export type RpcClientContext = ClientRetryPluginContext

export type RpcTransport = 'websocket' | 'fetch'

export type RpcTransportPreference = 'auto' | RpcTransport

export const RPC_WS_PATH = '/rpc-ws'

const PROBE_TIMEOUT_MS = 3000
const MIN_RECONNECT_DELAY_MS = 250
const MAX_RECONNECT_DELAY_MS = 1000
const MIN_UPTIME_MS = 1000
const CONNECTION_TIMEOUT_MS = 2000
const CONNECTION_LOSS_RETRIES = 12
const CONNECTION_LOSS_RETRY_DELAY_MS = 250

const SOCKET_OPEN = 1
const SOCKET_CONNECTING = 0
const SOCKET_CLOSED = 3

export type BrowserRpcConnection = {
  link: ClientLink<RpcClientContext>
  transport: () => RpcTransport | null
  close: () => void
}

type Registry = Map<string, BrowserRpcConnection>

declare global {
  // eslint-disable-next-line no-var
  var __concivBrowserRpcRegistryV1: Registry | undefined
}

function registry(): Registry {
  globalThis.__concivBrowserRpcRegistryV1 ??= new Map()
  return globalThis.__concivBrowserRpcRegistryV1
}

function normalizeApiBase(apiBase: string): string {
  const url = new URL(apiBase === '' ? '/' : apiBase, typeof location === 'undefined' ? undefined : location.href)
  const path = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname
  return `${url.origin}${path}`
}

function websocketUrl(apiBase: string): string {
  const url = new URL(`${apiBase}${RPC_WS_PATH}`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function retryPlugin(alive: () => boolean): ClientRetryPlugin<RpcClientContext> {
  return new ClientRetryPlugin<RpcClientContext>({
    default: {
      retry: CONNECTION_LOSS_RETRIES,
      retryDelay: CONNECTION_LOSS_RETRY_DELAY_MS,
      shouldRetry: (options) => alive() && !(options.error instanceof ORPCError),
    },
  })
}

function fetchLink(apiBase: string, alive: () => boolean): ClientLink<RpcClientContext> {
  return new FetchRpcLink<RpcClientContext>({url: `${apiBase}/rpc`, plugins: [retryPlugin(alive)]})
}

type SocketDelegate = LinkWebsocketClientOptions['websocket']

const CLOSED_CONNECTION_MESSAGE = 'conciv rpc connection is closed'

function isPeerRequestFrame(data: string | ArrayBufferLike | Blob | ArrayBufferView): boolean {
  if (typeof data !== 'string') return true
  const frame: unknown = JSON.parse(data)
  if (typeof frame !== 'object' || frame === null) return true
  return !('t' in frame)
}

function disposeSocket(socket: ReconnectingWebSocket): void {
  let dispatched = false
  const observeClose = (): void => {
    dispatched = true
  }
  socket.addEventListener('close', observeClose)
  socket.close()
  socket.removeEventListener('close', observeClose)
  if (!dispatched) socket.dispatchEvent(new Event('close'))
}

function socketDelegate(socket: ReconnectingWebSocket, alive: () => boolean): SocketDelegate {
  return {
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      socket.addEventListener(type, listener, options)
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) {
      socket.removeEventListener(type, listener, options)
    },
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (!alive()) {
        if (isPeerRequestFrame(data)) throw new Error(CLOSED_CONNECTION_MESSAGE)
        return
      }
      if (typeof data === 'string' || data instanceof Blob || data instanceof ArrayBuffer) {
        socket.send(data)
        return
      }
      if (!ArrayBuffer.isView(data)) return
      const copy = new Uint8Array(data.byteLength)
      copy.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
      socket.send(copy)
    },
    get readyState() {
      if (!alive()) return SOCKET_OPEN
      if (socket.readyState === SOCKET_OPEN) return SOCKET_OPEN
      return socket.shouldReconnect ? SOCKET_CONNECTING : SOCKET_CLOSED
    },
  }
}

function openedWithin(socket: ReconnectingWebSocket, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const settle = (opened: boolean): void => {
      clearTimeout(timer)
      socket.removeEventListener('open', onOpen)
      resolve(opened)
    }
    const onOpen = (): void => settle(true)
    const timer = setTimeout(() => settle(false), timeoutMs)
    socket.addEventListener('open', onOpen, {once: true})
  })
}

function reconnectingSocket(apiBase: string): ReconnectingWebSocket {
  return new ReconnectingWebSocket(() => websocketUrl(apiBase), [], {
    minReconnectionDelay: MIN_RECONNECT_DELAY_MS,
    maxReconnectionDelay: MAX_RECONNECT_DELAY_MS,
    minUptime: MIN_UPTIME_MS,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
  })
}

function probedConnection(apiBase: string): BrowserRpcConnection {
  const state: {open: boolean; transport: RpcTransport | null} = {open: true, transport: null}
  const alive = (): boolean => state.open
  const socket = reconnectingSocket(apiBase)
  const settled = openedWithin(socket, PROBE_TIMEOUT_MS).then((opened): ClientLink<RpcClientContext> => {
    if (!state.open) return fetchLink(apiBase, alive)
    if (opened) {
      state.transport = 'websocket'
      return new WebsocketRpcLink<RpcClientContext>({
        websocket: socketDelegate(socket, alive),
        plugins: [retryPlugin(alive)],
      })
    }
    socket.close()
    state.transport = 'fetch'
    console.warn(`[conciv] rpc websocket probe to ${apiBase} timed out; this tab falls back to fetch/SSE`)
    return fetchLink(apiBase, alive)
  })
  return {
    link: new DynamicLink<RpcClientContext>(() => settled),
    transport: () => state.transport,
    close: () => {
      disposeSocket(socket)
      state.open = false
    },
  }
}

function pinnedConnection(apiBase: string, transport: RpcTransport): BrowserRpcConnection {
  const state = {open: true}
  const alive = (): boolean => state.open
  if (transport === 'fetch') {
    return {
      link: fetchLink(apiBase, alive),
      transport: () => 'fetch',
      close: () => {
        state.open = false
      },
    }
  }
  const socket = reconnectingSocket(apiBase)
  return {
    link: new WebsocketRpcLink<RpcClientContext>({
      websocket: socketDelegate(socket, alive),
      plugins: [retryPlugin(alive)],
    }),
    transport: () => 'websocket',
    close: () => {
      disposeSocket(socket)
      state.open = false
    },
  }
}

export function browserRpcConnection(
  apiBase: string,
  preference: RpcTransportPreference = 'auto',
): BrowserRpcConnection {
  const key = normalizeApiBase(apiBase)
  const connections = registry()
  const existing = connections.get(key)
  if (existing) return existing
  const created = preference === 'auto' ? probedConnection(key) : pinnedConnection(key, preference)
  connections.set(key, created)
  return created
}

export function closeBrowserRpcConnection(apiBase: string): void {
  const key = normalizeApiBase(apiBase)
  const connections = registry()
  const existing = connections.get(key)
  if (!existing) return
  connections.delete(key)
  existing.close()
}

export function browserRpcTransport(apiBase: string): RpcTransport | null {
  return registry().get(normalizeApiBase(apiBase))?.transport() ?? null
}
