import {createORPCClient, ORPCError, type ClientLink, type ClientOptions} from '@orpc/client'
import {RPCLink as WebsocketRpcLink, type LinkWebsocketClientOptions} from '@orpc/client/websocket'
import {
  ClientRetryPlugin,
  type ClientRetryPluginAttemptOptions,
  type ClientRetryPluginContext,
} from '@orpc/client/plugins'
import {
  getContractRouter,
  getEventIteratorSchemaDetails,
  isContractProcedure,
  type ContractRouterClient,
} from '@orpc/contract'
import ReconnectingWebSocket from 'partysocket/ws'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {RPC_WS_PATH} from '@conciv/protocol/rpc-types'
import {contract, SOCKET_TRUST_FRAME, type ExchangeResult} from './contract.js'

export type RpcClientContext = ClientRetryPluginContext & {concivSessionId?: string}

export type SessionAccessor = () => string | null

const CONNECTION_LOSS_RETRIES = 12
const CONNECTION_LOSS_RETRY_DELAY_MS = 250
const MIN_RECONNECT_DELAY_MS = 250
const MAX_RECONNECT_DELAY_MS = 2000
const MIN_UPTIME_MS = 1000
const CONNECTION_TIMEOUT_MS = 2000
const ENSURE_TRUSTED_TIMEOUT_MS = 60_000
const TOKEN_STORAGE_PREFIX = 'conciv:engine-token:'
const MAGIC_LINK_PARAM = 'conciv_otp'
const UNAUTHORIZED_STATUS = 401
const NO_RECONNECT_DELAY_MS = 0
const SOCKET_CLOSED = 3
const SOCKET_STATES = [0, 1, 2, SOCKET_CLOSED] as const

export const REVOKED_SOCKET_CLOSE_CODE = 1008

export type TrustStatus = 'checking' | 'trusted' | 'untrusted' | 'revoked' | 'unreachable'

export type TrustListener = (status: TrustStatus, previous: TrustStatus) => void

const TRUST_STATUSES: readonly TrustStatus[] = ['checking', 'trusted', 'untrusted', 'revoked', 'unreachable']

export type EngineTokenSource = () => Promise<string>

export type EngineTrust = {
  isTrusted: () => boolean
  status: () => TrustStatus
  subscribe: (listener: TrustListener) => () => void
  requestTrust: (tokenSource?: EngineTokenSource) => Promise<boolean>
  requestTrustWithToken: (token: string) => Promise<boolean>
  requestTrustWithCode: (code: string) => Promise<ExchangeResult>
  requestAuthCode: (options?: {reissue?: boolean}) => Promise<void>
  ensureTrusted: (timeoutMs?: number) => Promise<boolean>
}

type TrustState = {key: string; status: TrustStatus; token: string | undefined; events: EventTarget}

export type BrowserRpcConnection = {
  link: ClientLink<RpcClientContext>
  trust: EngineTrust
  release: () => void
}

type ConnectionEntry = {
  link: ClientLink<RpcClientContext>
  trust: EngineTrust
  state: TrustState
  reconnect: () => void
  close: () => void
  holders: Set<object>
}

export type ReachabilityListener = (reachable: boolean) => void

declare global {
  // eslint-disable-next-line no-var
  var __concivBrowserRpcConnectionsV5: Map<string, ConnectionEntry> | undefined
}

function connections(): Map<string, ConnectionEntry> {
  globalThis.__concivBrowserRpcConnectionsV5 ??= new Map()
  return globalThis.__concivBrowserRpcConnectionsV5
}

function readStoredToken(key: string): string | undefined {
  try {
    return localStorage.getItem(`${TOKEN_STORAGE_PREFIX}${key}`) ?? undefined
  } catch {
    return undefined
  }
}

function writeStoredToken(key: string, token: string | undefined): void {
  try {
    if (token === undefined) {
      localStorage.removeItem(`${TOKEN_STORAGE_PREFIX}${key}`)
      return
    }
    localStorage.setItem(`${TOKEN_STORAGE_PREFIX}${key}`, token)
  } catch {
    return
  }
}

function magicLinkFragment(url: URL): URLSearchParams {
  return new URLSearchParams(url.hash.replace(/^#/, ''))
}

export function readMagicLinkCode(): string | undefined {
  if (typeof location === 'undefined') return undefined
  return magicLinkFragment(new URL(location.href)).get(MAGIC_LINK_PARAM) ?? undefined
}

export function forgetMagicLinkCode(): void {
  if (readMagicLinkCode() === undefined) return
  const url = new URL(location.href)
  const fragment = magicLinkFragment(url)
  fragment.delete(MAGIC_LINK_PARAM)
  url.hash = fragment.toString()
  history.replaceState(history.state, '', url.href)
}

const REACHABILITY_EVENT = 'reachability'

export function subscribeRpcReachability(apiBase: string, listener: ReachabilityListener): () => void {
  const key = normalizeApiBase(apiBase)
  const release = holdConnection(key)
  const {events} = connectionEntry(key).state
  const handler = (event: Event): void => {
    if (event instanceof CustomEvent && typeof event.detail === 'boolean') listener(event.detail)
  }
  events.addEventListener(REACHABILITY_EVENT, handler)
  return () => {
    events.removeEventListener(REACHABILITY_EVENT, handler)
    release()
  }
}

function normalizeApiBase(apiBase: string): string {
  const url = new URL(apiBase === '' ? '/' : apiBase, typeof location === 'undefined' ? undefined : location.href)
  const path = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname
  return `${url.origin}${path}`
}

function isAbortedFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function isRetryableRpcFailure(alive: boolean, error: unknown): boolean {
  return alive && !(error instanceof ORPCError) && !isAbortedFailure(error)
}

function isStreamingCall(path: readonly string[]): boolean {
  const procedure = getContractRouter(contract, path)
  return isContractProcedure(procedure) && getEventIteratorSchemaDetails(procedure['~orpc'].outputSchema) !== undefined
}

function socketReopened(
  socket: ReconnectingWebSocket,
  lifetime: AbortSignal,
  call: AbortSignal | undefined,
): Promise<number> {
  const ended = call === undefined ? lifetime : AbortSignal.any([lifetime, call])
  if (socket.readyState === socket.OPEN || ended.aborted) return Promise.resolve(NO_RECONNECT_DELAY_MS)
  return new Promise((resolve) => {
    const settle = (): void => {
      socket.removeEventListener('open', settle)
      ended.removeEventListener('abort', settle)
      resolve(NO_RECONNECT_DELAY_MS)
    }
    socket.addEventListener('open', settle)
    ended.addEventListener('abort', settle)
  })
}

function retryDelay(
  socket: ReconnectingWebSocket,
  lifetime: AbortSignal,
  options: ClientRetryPluginAttemptOptions<RpcClientContext>,
): number | Promise<number> {
  if (!isStreamingCall(options.path)) return CONNECTION_LOSS_RETRY_DELAY_MS
  return socketReopened(socket, lifetime, options.signal)
}

function retryPlugin(socket: ReconnectingWebSocket, lifetime: AbortSignal): ClientRetryPlugin<RpcClientContext> {
  return new ClientRetryPlugin<RpcClientContext>({
    default: {
      retry: (options) => (isStreamingCall(options.path) ? Number.POSITIVE_INFINITY : CONNECTION_LOSS_RETRIES),
      retryDelay: (options) => retryDelay(socket, lifetime, options),
      shouldRetry: (options) =>
        !lifetime.aborted && options.signal?.aborted !== true && !(options.error instanceof ORPCError),
    },
  })
}

const TRUST_STATUS_EVENT = 'status'

function setStatus(state: TrustState, status: TrustStatus): void {
  if (state.status === status) return
  const previous = state.status
  state.status = status
  state.events.dispatchEvent(new CustomEvent(TRUST_STATUS_EVENT, {detail: previous}))
}

function distrust(state: TrustState, refused: string | undefined): void {
  if (state.status === 'checking' || refused !== state.token) return
  if (refused === undefined && state.status === 'revoked') return
  if (state.token !== undefined && readStoredToken(state.key) === state.token) writeStoredToken(state.key, undefined)
  state.token = undefined
  setStatus(state, refusedStatus(refused))
}

function refusedStatus(token: string | undefined): TrustStatus {
  return token === undefined || token === '' ? 'untrusted' : 'revoked'
}

function bearer(token: string | undefined): Record<string, string> {
  return token === undefined ? {} : {authorization: `Bearer ${token}`}
}

function sessionHeaders(options: ClientOptions<RpcClientContext>): Record<string, string> {
  const id = options.context.concivSessionId
  return id ? {[CONCIV_SESSION_HEADER]: id} : {}
}

function rpcSocketUrl(key: string): string {
  const url = new URL(`${key}${RPC_WS_PATH}`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function socketDelegate(socket: ReconnectingWebSocket): LinkWebsocketClientOptions['websocket'] {
  return {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) =>
      socket.addEventListener(type, listener, options),
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions) =>
      socket.removeEventListener(type, listener, options),
    send: (data) => socket.send(data),
    get readyState() {
      return SOCKET_STATES.find((state) => state === socket.readyState) ?? SOCKET_CLOSED
    },
  }
}

function socketLink(
  socket: ReconnectingWebSocket,
  state: TrustState,
  lifetime: AbortSignal,
): ClientLink<RpcClientContext> {
  return new WebsocketRpcLink<RpcClientContext>({
    websocket: socketDelegate(socket),
    headers: sessionHeaders,
    interceptors: [
      (options) => {
        const sent = state.token
        return options.next().catch((error: unknown) => {
          if (error instanceof ORPCError && error.status === UNAUTHORIZED_STATUS) distrust(state, sent)
          throw error
        })
      },
    ],
    plugins: [retryPlugin(socket, lifetime)],
  })
}

function makeEngineTrust(key: string, state: TrustState, link: ClientLink<RpcClientContext>): EngineTrust {
  const auth = createORPCClient<ContractRouterClient<typeof contract, RpcClientContext>>(link).auth
  const trustWith = (token: string): void => {
    state.token = token
    writeStoredToken(key, token)
    setStatus(state, 'trusted')
  }
  const requestTrustWithToken = async (token: string): Promise<boolean> => {
    const {trusted} = await auth.trust({token})
    if (trusted) {
      trustWith(token)
      return true
    }
    if (readStoredToken(key) === token) writeStoredToken(key, undefined)
    if (state.token === token) state.token = undefined
    setStatus(state, refusedStatus(token))
    return false
  }
  const sourcedToken = async (tokenSource: EngineTokenSource | undefined): Promise<string | undefined> => {
    if (tokenSource === undefined) return undefined
    return tokenSource().catch((error: unknown) => {
      console.error('[conciv] the host could not provide an engine token', error)
      return undefined
    })
  }
  const requestTrust = async (tokenSource?: EngineTokenSource): Promise<boolean> => {
    if (state.status === 'trusted') return true
    try {
      if (await requestTrustWithToken(state.token ?? readStoredToken(key) ?? '')) return true
      const sourced = await sourcedToken(tokenSource)
      return sourced === undefined ? false : await requestTrustWithToken(sourced)
    } catch (error) {
      console.error('[conciv] the dev server did not answer the trust check', error)
      setStatus(state, 'unreachable')
      return false
    }
  }
  const subscribe = (listener: TrustListener): (() => void) => {
    const handler = (event: Event): void => {
      const previous =
        event instanceof CustomEvent ? TRUST_STATUSES.find((status) => status === event.detail) : undefined
      listener(state.status, previous ?? state.status)
    }
    state.events.addEventListener(TRUST_STATUS_EVENT, handler)
    return () => {
      state.events.removeEventListener(TRUST_STATUS_EVENT, handler)
    }
  }
  return {
    isTrusted: () => state.status === 'trusted',
    status: () => state.status,
    subscribe,
    requestTrust,
    requestTrustWithToken,
    requestTrustWithCode: async (code) => {
      const result = await auth.exchange({code})
      if ('token' in result) trustWith(result.token)
      return result
    },
    requestAuthCode: async (options = {}) => {
      await auth.requestCode({reissue: options.reissue ?? false})
    },
    ensureTrusted: (timeoutMs = ENSURE_TRUSTED_TIMEOUT_MS) =>
      new Promise<boolean>((resolve) => {
        if (state.status === 'trusted') {
          resolve(true)
          return
        }
        const settle = (trusted: boolean): void => {
          clearTimeout(timer)
          unsubscribe()
          resolve(trusted)
        }
        const timer = setTimeout(() => settle(false), timeoutMs)
        const unsubscribe = subscribe((status) => {
          if (status === 'trusted') settle(true)
        })
      }),
  }
}

function socketConnection(key: string, state: TrustState): ConnectionEntry {
  const lifetime = new AbortController()
  const socket = new ReconnectingWebSocket(rpcSocketUrl(key), [], {
    minReconnectionDelay: MIN_RECONNECT_DELAY_MS,
    maxReconnectionDelay: MAX_RECONNECT_DELAY_MS,
    minUptime: MIN_UPTIME_MS,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    shouldReconnectOnClose: (event) => event.code !== REVOKED_SOCKET_CLOSE_CODE,
    startClosed: true,
    WebSocket: trustingWebSocket(
      () => state.token,
      (sent) => distrust(state, sent),
    ),
  })
  const vote = (reachable: boolean): void => {
    if (!lifetime.signal.aborted) state.events.dispatchEvent(new CustomEvent(REACHABILITY_EVENT, {detail: reachable}))
  }
  socket.addEventListener('open', () => vote(true))
  socket.addEventListener('close', (event) => {
    if (event.code === REVOKED_SOCKET_CLOSE_CODE) {
      distrust(state, state.token)
      return
    }
    vote(false)
  })
  const rpc = socketLink(socket, state, lifetime.signal)
  const link: ClientLink<RpcClientContext> = {
    call: (path, input, options) => {
      if (!socket.shouldReconnect && !lifetime.signal.aborted) socket.reconnect()
      return rpc.call(path, input, options)
    },
  }
  return {
    link,
    state,
    trust: makeEngineTrust(key, state, link),
    holders: new Set(),
    reconnect: () => {
      if (socket.shouldReconnect && socket.readyState !== socket.OPEN && !lifetime.signal.aborted) socket.reconnect()
    },
    close: () => {
      lifetime.abort()
      socket.close()
    },
  }
}

function connectionEntry(apiBase: string): ConnectionEntry {
  const key = normalizeApiBase(apiBase)
  const existing = connections().get(key)
  if (existing) return existing
  const created = socketConnection(key, {
    key,
    status: 'checking',
    token: readStoredToken(key),
    events: new EventTarget(),
  })
  connections().set(key, created)
  return created
}

function closeEntry(entry: ConnectionEntry): void {
  if (connections().get(entry.state.key) === entry) connections().delete(entry.state.key)
  entry.close()
}

export function browserRpcConnection(apiBase: string): BrowserRpcConnection {
  const key = normalizeApiBase(apiBase)
  const release = holdConnection(key)
  const {link, trust} = connectionEntry(key)
  return {link, trust, release}
}

function holdConnection(key: string): () => void {
  const entry = connectionEntry(key)
  const holder = {}
  entry.holders.add(holder)
  return () => {
    if (entry.holders.delete(holder) && entry.holders.size === 0) closeEntry(entry)
  }
}

export function resetBrowserRpcConnection(apiBase: string): void {
  connections().get(normalizeApiBase(apiBase))?.reconnect()
}

export function engineHeaders(apiBase: string): Record<string, string> {
  const key = normalizeApiBase(apiBase)
  return bearer(connections().get(key)?.state.token ?? readStoredToken(key))
}

function trustingWebSocket(
  currentToken: () => string | undefined,
  revoked: (sent: string | undefined) => void,
): typeof WebSocket {
  return new Proxy(WebSocket, {
    construct: (target, args) => {
      const socket: WebSocket = Reflect.construct(target, args)
      const sent: {token: string | undefined} = {token: undefined}
      socket.addEventListener('open', () => {
        sent.token = currentToken()
        socket.send(JSON.stringify({type: SOCKET_TRUST_FRAME, token: sent.token ?? ''}))
      })
      socket.addEventListener('close', (event) => {
        if (event.code === REVOKED_SOCKET_CLOSE_CODE) revoked(sent.token)
      })
      return socket
    },
  })
}

function forgetRevoked(key: string, sent: string | undefined): void {
  const entry = connections().get(key)
  if (entry) {
    distrust(entry.state, sent)
    return
  }
  if (sent !== undefined && readStoredToken(key) === sent) writeStoredToken(key, undefined)
}

export function engineWebSocket(apiBase: string): typeof WebSocket {
  const key = normalizeApiBase(apiBase)
  return trustingWebSocket(
    () => connections().get(key)?.state.token ?? readStoredToken(key),
    (sent) => forgetRevoked(key, sent),
  )
}

export const RPC_UNBOUND_MESSAGE = 'conciv core not connected yet'

export type HeldBrowserRpcLink = {link: ClientLink<RpcClientContext>; release: () => void}

type HeldConnection = {key: string | null; release: () => void}

const NOT_HELD: HeldConnection = {key: null, release: () => {}}

export function heldBrowserRpcLink(currentApiBase: () => string | null, session?: SessionAccessor): HeldBrowserRpcLink {
  const held: {current: HeldConnection} = {current: NOT_HELD}
  const hold = (apiBase: string): ConnectionEntry => {
    const key = normalizeApiBase(apiBase)
    if (held.current.key !== key) {
      held.current.release()
      held.current = {key, release: holdConnection(key)}
    }
    return connectionEntry(key)
  }
  return {
    link: {
      call: (path, input, options) => {
        const apiBase = currentApiBase()
        if (apiBase === null) throw new Error(RPC_UNBOUND_MESSAGE)
        const sessionId = session?.()
        const context = sessionId ? {...options.context, concivSessionId: sessionId} : options.context
        return hold(apiBase).link.call(path, input, {...options, context})
      },
    },
    release: () => {
      held.current.release()
      held.current = NOT_HELD
    },
  }
}
