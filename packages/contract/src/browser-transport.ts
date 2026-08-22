import {DynamicLink, ORPCError, type ClientLink} from '@orpc/client'
import {RPCLink as FetchRpcLink} from '@orpc/client/fetch'
import {RPCLink as WebsocketRpcLink, type LinkWebsocketClientOptions} from '@orpc/client/websocket'
import {ClientRetryPlugin, type ClientRetryPluginContext} from '@orpc/client/plugins'
import {AsyncRetryer} from '@tanstack/pacer'
import ReconnectingWebSocket from 'partysocket/ws'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

export type RpcClientContext = ClientRetryPluginContext

export type SessionAccessor = () => string | null

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
const SOCKET_CLOSING = 2
const SOCKET_CLOSED = 3

export type BrowserRpcConnection = {
  link: ClientLink<RpcClientContext>
  transport: () => RpcTransport | null
  bindSession: (accessor: SessionAccessor) => void
  close: () => void
}

type SessionHolder = {read: SessionAccessor}

function sessionHeaders(holder: SessionHolder): Record<string, string> {
  const id = holder.read()
  if (!id) return {}
  return {[CONCIV_SESSION_HEADER]: id}
}

export type ReachabilityListener = (reachable: boolean) => void

type Registry = Map<string, BrowserRpcConnection>
type ReachabilityRegistry = Map<string, Set<ReachabilityListener>>
type ActiveConnectionRegistry = Map<string, symbol>

declare global {
  // eslint-disable-next-line no-var
  var __concivBrowserRpcRegistryV1: Registry | undefined
  // eslint-disable-next-line no-var
  var __concivRpcReachabilityListenersV1: ReachabilityRegistry | undefined
  // eslint-disable-next-line no-var
  var __concivRpcReachabilityActiveV1: ActiveConnectionRegistry | undefined
}

function registry(): Registry {
  globalThis.__concivBrowserRpcRegistryV1 ??= new Map()
  return globalThis.__concivBrowserRpcRegistryV1
}

function reachabilityListeners(): ReachabilityRegistry {
  globalThis.__concivRpcReachabilityListenersV1 ??= new Map()
  return globalThis.__concivRpcReachabilityListenersV1
}

function activeConnections(): ActiveConnectionRegistry {
  globalThis.__concivRpcReachabilityActiveV1 ??= new Map()
  return globalThis.__concivRpcReachabilityActiveV1
}

export function subscribeRpcReachability(apiBase: string, listener: ReachabilityListener): () => void {
  const key = normalizeApiBase(apiBase)
  const listeners = reachabilityListeners()
  const forKey = listeners.get(key) ?? new Set()
  forKey.add(listener)
  listeners.set(key, forKey)
  return () => {
    forKey.delete(listener)
  }
}

function voteReachability(key: string, connectionId: symbol, reachable: boolean): void {
  if (activeConnections().get(key) !== connectionId) return
  const forKey = reachabilityListeners().get(key)
  if (!forKey) return
  for (const listener of forKey) listener(reachable)
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

function isAbortedFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function isRetryableRpcFailure(alive: boolean, error: unknown): boolean {
  return alive && !(error instanceof ORPCError) && !isAbortedFailure(error)
}

function retryPlugin(alive: () => boolean, vote: ReachabilityListener): ClientRetryPlugin<RpcClientContext> {
  return new ClientRetryPlugin<RpcClientContext>({
    default: {
      retry: CONNECTION_LOSS_RETRIES,
      retryDelay: CONNECTION_LOSS_RETRY_DELAY_MS,
      shouldRetry: (options) => {
        const retryable = isRetryableRpcFailure(alive(), options.error)
        if (retryable) vote(false)
        return retryable
      },
      onRetry: () => (isSuccess: boolean) => {
        if (isSuccess) vote(true)
      },
    },
  })
}

function fetchLink(
  apiBase: string,
  alive: () => boolean,
  vote: ReachabilityListener,
  session: SessionHolder,
): ClientLink<RpcClientContext> {
  return new FetchRpcLink<RpcClientContext>({
    url: `${apiBase}/rpc`,
    headers: () => sessionHeaders(session),
    plugins: [retryPlugin(alive, vote)],
  })
}

type SocketDelegate = LinkWebsocketClientOptions['websocket']

const CLOSED_CONNECTION_MESSAGE = 'conciv rpc connection is closed'

function isPeerRequestFrame(data: string | ArrayBufferLike | Blob | ArrayBufferView): boolean {
  if (typeof data !== 'string') return true
  const frame: unknown = JSON.parse(data)
  if (typeof frame !== 'object' || frame === null) return true
  return !('t' in frame)
}

export function disposeSocket(socket: ReconnectingWebSocket): void {
  const realCloseStillPending = socket.readyState === SOCKET_CLOSING
  let dispatched = false
  const observeClose = (): void => {
    dispatched = true
  }
  socket.addEventListener('close', observeClose)
  socket.close()
  socket.removeEventListener('close', observeClose)
  if (!dispatched && !realCloseStillPending) socket.dispatchEvent(new Event('close'))
}

function socketDelegate(
  socket: ReconnectingWebSocket,
  alive: () => boolean,
  attempting: () => boolean,
): SocketDelegate {
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
      return attempting() ? SOCKET_CONNECTING : SOCKET_CLOSED
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

const RECONNECT_BACKOFF_BASE_MS = 2000
const RECONNECT_BACKOFF_MAX_MS = 30_000

function reconnectingSocket(apiBase: string): ReconnectingWebSocket {
  return new ReconnectingWebSocket(() => websocketUrl(apiBase), [], {
    minReconnectionDelay: MIN_RECONNECT_DELAY_MS,
    maxReconnectionDelay: MAX_RECONNECT_DELAY_MS,
    minUptime: MIN_UPTIME_MS,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    maxRetries: 0,
  })
}

type SocketReachabilityWiring = {markDeliberate: () => void; attempting: () => boolean}

type SocketConnectionPhase = 'attempting' | 'backing-off' | 'open' | 'disposed'

function wireSocketReachability(
  socket: ReconnectingWebSocket,
  key: string,
  connectionId: symbol,
): SocketReachabilityWiring {
  const phase: {current: SocketConnectionPhase} = {current: 'attempting'}
  const retryer = new AsyncRetryer(
    async () => {
      phase.current = 'attempting'
      socket.reconnect()
      const opened = await openedWithin(socket, CONNECTION_TIMEOUT_MS)
      if (!opened) {
        phase.current = 'backing-off'
        throw new Error(`conciv rpc websocket reconnect attempt to ${key} failed`)
      }
    },
    {
      backoff: 'exponential',
      baseWait: RECONNECT_BACKOFF_BASE_MS,
      maxWait: RECONNECT_BACKOFF_MAX_MS,
      maxAttempts: Number.MAX_SAFE_INTEGER,
      throwOnError: false,
      enabled: () => phase.current !== 'disposed',
    },
  )
  socket.addEventListener('open', () => {
    phase.current = 'open'
    retryer.abort()
    voteReachability(key, connectionId, true)
  })
  socket.addEventListener('close', () => {
    if (phase.current === 'disposed') return
    const wasOpen = phase.current === 'open'
    phase.current = 'attempting'
    if (!wasOpen) voteReachability(key, connectionId, false)
    if (!retryer.store.state.isExecuting) void retryer.execute()
  })
  return {
    attempting: () => phase.current === 'attempting' || phase.current === 'open',
    markDeliberate: () => {
      phase.current = 'disposed'
      retryer.abort()
    },
  }
}

function probedConnection(key: string): BrowserRpcConnection {
  const connectionId = Symbol('conciv-rpc-connection')
  activeConnections().set(key, connectionId)
  const vote = (reachable: boolean): void => voteReachability(key, connectionId, reachable)
  const state: {open: boolean; transport: RpcTransport | null} = {open: true, transport: null}
  const alive = (): boolean => state.open
  const session: SessionHolder = {read: () => null}
  const socket = reconnectingSocket(key)
  const wiring = wireSocketReachability(socket, key, connectionId)
  const settled = openedWithin(socket, PROBE_TIMEOUT_MS).then((opened): ClientLink<RpcClientContext> => {
    if (!state.open) return fetchLink(key, alive, vote, session)
    if (opened) {
      state.transport = 'websocket'
      return new WebsocketRpcLink<RpcClientContext>({
        websocket: socketDelegate(socket, alive, wiring.attempting),
        headers: () => sessionHeaders(session),
        plugins: [retryPlugin(alive, vote)],
      })
    }
    wiring.markDeliberate()
    socket.close()
    state.transport = 'fetch'
    console.warn(`[conciv] rpc websocket probe to ${key} timed out; this tab falls back to fetch/SSE`)
    return fetchLink(key, alive, vote, session)
  })
  return {
    link: new DynamicLink<RpcClientContext>(() => settled),
    transport: () => state.transport,
    bindSession: (accessor) => {
      session.read = accessor
    },
    close: () => {
      wiring.markDeliberate()
      disposeSocket(socket)
      state.open = false
    },
  }
}

function pinnedConnection(key: string, transport: RpcTransport): BrowserRpcConnection {
  const connectionId = Symbol('conciv-rpc-connection')
  activeConnections().set(key, connectionId)
  const vote = (reachable: boolean): void => voteReachability(key, connectionId, reachable)
  const state = {open: true}
  const alive = (): boolean => state.open
  const session: SessionHolder = {read: () => null}
  const bindSession = (accessor: SessionAccessor): void => {
    session.read = accessor
  }
  if (transport === 'fetch') {
    return {
      link: fetchLink(key, alive, vote, session),
      transport: () => 'fetch',
      bindSession,
      close: () => {
        state.open = false
      },
    }
  }
  const socket = reconnectingSocket(key)
  const wiring = wireSocketReachability(socket, key, connectionId)
  return {
    link: new WebsocketRpcLink<RpcClientContext>({
      websocket: socketDelegate(socket, alive, wiring.attempting),
      headers: () => sessionHeaders(session),
      plugins: [retryPlugin(alive, vote)],
    }),
    transport: () => 'websocket',
    bindSession,
    close: () => {
      wiring.markDeliberate()
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
  activeConnections().delete(key)
  existing.close()
}

export function reprobeBrowserRpcConnection(
  apiBase: string,
  preference: RpcTransportPreference = 'auto',
): BrowserRpcConnection {
  const key = normalizeApiBase(apiBase)
  const connections = registry()
  const existing = connections.get(key)
  if (existing) {
    connections.delete(key)
    activeConnections().delete(key)
    existing.close()
  }
  const created = preference === 'auto' ? probedConnection(key) : pinnedConnection(key, preference)
  connections.set(key, created)
  return created
}

export function browserRpcTransport(apiBase: string): RpcTransport | null {
  return registry().get(normalizeApiBase(apiBase))?.transport() ?? null
}

export const RPC_UNBOUND_MESSAGE = 'conciv core not connected yet'

export function dynamicBrowserRpcLink(
  currentApiBase: () => string | null,
  preference: RpcTransportPreference = 'auto',
  session?: SessionAccessor,
): ClientLink<RpcClientContext> {
  return new DynamicLink<RpcClientContext>(() => {
    const apiBase = currentApiBase()
    if (apiBase === null) throw new Error(RPC_UNBOUND_MESSAGE)
    const connection = browserRpcConnection(apiBase, preference)
    if (session) connection.bindSession(session)
    return Promise.resolve(connection.link)
  })
}
