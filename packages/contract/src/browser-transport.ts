import {createORPCClient, mapEventIterator, ORPCError, type ClientLink, type ClientOptions} from '@orpc/client'
import {StandardRPCLink, type StandardLinkClient} from '@orpc/client/standard'
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
import {
  decodeResponseMessage,
  encodeRequestMessage,
  experimental_ClientPeerWithoutCodec as ClientPeer,
  MessageType,
  type DecodedRequestMessage,
  type DecodedResponseMessage,
  type EncodedMessage,
} from '@orpc/standard-server-peer'
import ReconnectingWebSocket from 'partysocket/ws'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {CONCIV_AUTH_TOKEN_QUERY_PARAM, RPC_WS_PATH} from '@conciv/protocol/rpc-types'
import {contract, SOCKET_TRUST_FRAME, type ExchangeResult} from './contract.js'

export type RpcClientContext = ClientRetryPluginContext & {concivSessionId?: string}

export type SessionAccessor = () => string | null

export type EngineConnectionTimings = {
  readonly reconnectMinDelayMs: number
  readonly reconnectMaxDelayMs: number
  readonly reconnectDelayGrowth: number
  readonly openTimeoutMs: number
  readonly callDeadlineMs: number
  readonly connectionLossRetryDelayMs: number
  readonly authTimeoutMs: number
  readonly offlineGraceMs: number
}

export const defaultEngineConnectionTimings: EngineConnectionTimings = {
  reconnectMinDelayMs: 250,
  reconnectMaxDelayMs: 2000,
  reconnectDelayGrowth: 1.3,
  openTimeoutMs: 30_000,
  callDeadlineMs: 3000,
  connectionLossRetryDelayMs: 250,
  authTimeoutMs: 3000,
  offlineGraceMs: 1000,
}

const MIN_UPTIME_MS = 1000
const TOKEN_STORAGE_PREFIX = 'conciv:engine-token:'
const MAGIC_LINK_PARAM = 'conciv_otp'
const UNAUTHORIZED_STATUS = 401
const NO_RECONNECT_DELAY_MS = 0
const SOCKET_LINK_URL = 'http://orpc'
const SOCKET_NOT_OPEN_MESSAGE = 'Cannot send message, WebSocket is not open.'
const CONNECTION_CLOSED_MESSAGE = 'The engine connection closed before the call was answered.'
const TRUST_STATUS_EVENT = 'status'
const REACHABILITY_EVENT = 'reachability'

export const REVOKED_SOCKET_CLOSE_CODE = 1008

export type TrustStatus = 'checking' | 'trusted' | 'untrusted' | 'revoked' | 'unreachable'

export type TrustListener = (status: TrustStatus, previous: TrustStatus) => void

export type ReachabilityListener = (reachable: boolean) => void

const TRUST_STATUSES: readonly TrustStatus[] = ['checking', 'trusted', 'untrusted', 'revoked', 'unreachable']

export type EngineTokenSource = () => Promise<string>

export type EngineTrust = {
  isTrusted: () => boolean
  status: () => TrustStatus
  subscribe: (listener: TrustListener) => () => void
  requestTrust: (options?: {storedOnly?: boolean}) => Promise<boolean>
  requestTrustWithToken: (token: string) => Promise<boolean>
  requestTrustWithCode: (code: string) => Promise<ExchangeResult>
  requestAuthCode: (options?: {reissue?: boolean}) => Promise<void>
}

export type EngineUnreachable = Error & {readonly isEngineUnreachable: true}

export function engineUnreachable(message: string, cause?: unknown): EngineUnreachable {
  return Object.assign(new Error(message, {cause}), {isEngineUnreachable: true as const})
}

export function isEngineUnreachable(value: unknown): value is EngineUnreachable {
  return value instanceof Error && Reflect.get(value, 'isEngineUnreachable') === true
}

type TrustState = {
  key: string
  status: TrustStatus
  token: string | undefined
  events: EventTarget
  tokenSource: EngineTokenSource | undefined
  asking: Promise<boolean> | undefined
}

export type BrowserRpcConnection = {
  link: ClientLink<RpcClientContext>
  trust: EngineTrust
  release: () => void
}

type ConnectionKey = {
  readonly apiBase: string
  readonly timings: EngineConnectionTimings
  readonly token: string | undefined
}

type ConnectionEntry = {
  id: string
  link: ClientLink<RpcClientContext>
  trust: EngineTrust
  state: TrustState
  close: () => void
  holders: Set<object>
}

declare global {
  // eslint-disable-next-line no-var
  var __concivBrowserRpcConnectionsV8: Map<string, ConnectionEntry> | undefined
}

function connections(): Map<string, ConnectionEntry> {
  globalThis.__concivBrowserRpcConnectionsV8 ??= new Map()
  return globalThis.__concivBrowserRpcConnectionsV8
}

function storageRefused(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'SecurityError' || error.name === 'QuotaExceededError')
}

function storageAccess<A>(io: (storage: Storage | undefined) => A, fallback: A): A {
  try {
    return io(typeof localStorage === 'undefined' ? undefined : (localStorage ?? undefined))
  } catch (error) {
    if (!storageRefused(error)) console.error('[conciv] the engine token storage failed', error)
    return fallback
  }
}

function readStoredToken(key: string): string | undefined {
  return storageAccess((storage) => storage?.getItem(`${TOKEN_STORAGE_PREFIX}${key}`) ?? undefined, undefined)
}

function storeToken(key: string, token: string): void {
  storageAccess((storage) => storage?.setItem(`${TOKEN_STORAGE_PREFIX}${key}`, token), undefined)
}

function forgetToken(key: string, token: string): void {
  if (readStoredToken(key) !== token) return
  storageAccess((storage) => storage?.removeItem(`${TOKEN_STORAGE_PREFIX}${key}`), undefined)
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

export function normalizeApiBase(apiBase: string): string {
  const url = new URL(apiBase === '' ? '/' : apiBase, typeof location === 'undefined' ? undefined : location.href)
  const path = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname
  return `${url.origin}${path}`
}

function isStreamingCall(path: readonly string[]): boolean {
  const procedure = getContractRouter(contract, path)
  return isContractProcedure(procedure) && getEventIteratorSchemaDetails(procedure['~orpc'].outputSchema) !== undefined
}

function unauthorized(error: unknown): boolean {
  return error instanceof ORPCError && error.status === UNAUTHORIZED_STATUS
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

function retriable(lifetime: AbortSignal, options: ClientRetryPluginAttemptOptions<RpcClientContext>): boolean {
  return !lifetime.aborted && options.signal?.aborted !== true && !(options.error instanceof ORPCError)
}

function retryPlugin(
  socket: ReconnectingWebSocket,
  lifetime: AbortSignal,
  timings: EngineConnectionTimings,
): ClientRetryPlugin<RpcClientContext> {
  return new ClientRetryPlugin<RpcClientContext>({
    default: {
      retry: Number.POSITIVE_INFINITY,
      retryDelay: (options) =>
        isStreamingCall(options.path)
          ? socketReopened(socket, lifetime, options.signal)
          : timings.connectionLossRetryDelayMs,
      shouldRetry: (options) => retriable(lifetime, options),
    },
  })
}

function setStatus(state: TrustState, status: TrustStatus): void {
  if (state.status === status) return
  const previous = state.status
  state.status = status
  state.events.dispatchEvent(new CustomEvent(TRUST_STATUS_EVENT, {detail: previous}))
}

function refusedStatus(token: string | undefined): TrustStatus {
  return token === undefined || token === '' ? 'untrusted' : 'revoked'
}

function distrust(state: TrustState, refused: string | undefined): void {
  if (state.status === 'checking' || refused !== state.token) return
  if (refused === undefined && state.status === 'revoked') return
  if (state.token !== undefined) forgetToken(state.key, state.token)
  state.token = undefined
  setStatus(state, refusedStatus(refused))
}

function refuse(state: TrustState, token: string): void {
  if (state.status === 'trusted' && state.token !== token) return
  forgetToken(state.key, token)
  if (state.token === token) state.token = undefined
  setStatus(state, refusedStatus(token))
}

function trustWith(state: TrustState, token: string): void {
  state.token = token
  storeToken(state.key, token)
  setStatus(state, 'trusted')
}

function sessionHeaders(options: ClientOptions<RpcClientContext>): Record<string, string> {
  const id = options.context.concivSessionId
  return id ? {[CONCIV_SESSION_HEADER]: id} : {}
}

function rpcSocketUrl(apiBase: string, token: string | undefined): string {
  const url = new URL(`${apiBase}${RPC_WS_PATH}`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (token !== undefined && token !== '') url.searchParams.set(CONCIV_AUTH_TOKEN_QUERY_PARAM, token)
  return url.toString()
}

async function sourcedToken(source: EngineTokenSource | undefined): Promise<string | undefined> {
  if (source === undefined) return undefined
  return source().catch((error: unknown) => {
    console.error('[conciv] the host could not provide an engine token', error)
    return undefined
  })
}

function frame(encoded: EncodedMessage): string | Uint8Array<ArrayBuffer> {
  if (typeof encoded === 'string') return encoded
  return Uint8Array.from(ArrayBuffer.isView(encoded) ? encoded : new Uint8Array(encoded))
}

function attemptSettled(socket: ReconnectingWebSocket, ended: AbortSignal): Promise<void> {
  if (socket.readyState === socket.OPEN || ended.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const settle = (): void => {
      socket.removeEventListener('open', settle)
      socket.removeEventListener('close', settle)
      ended.removeEventListener('abort', settle)
      resolve()
    }
    socket.addEventListener('open', settle)
    socket.addEventListener('close', settle)
    ended.addEventListener('abort', settle)
  })
}

async function sendFrame(
  socket: ReconnectingWebSocket,
  lifetime: AbortSignal,
  [id, type, payload]: DecodedRequestMessage,
): Promise<void> {
  const encoded = await encodeRequestMessage(id, type, payload)
  if (type !== MessageType.ABORT_SIGNAL) await attemptSettled(socket, lifetime)
  if (socket.readyState === socket.OPEN) socket.send(frame(encoded))
  else if (type !== MessageType.ABORT_SIGNAL) throw engineUnreachable(SOCKET_NOT_OPEN_MESSAGE)
}

async function receivedFrame(event: MessageEvent): Promise<DecodedResponseMessage> {
  const raw: unknown = event.data
  return decodeResponseMessage(
    raw instanceof Blob ? await raw.arrayBuffer() : raw instanceof ArrayBuffer ? raw : String(raw),
  )
}

function socketClient(socket: ReconnectingWebSocket, lifetime: AbortSignal): StandardLinkClient<RpcClientContext> {
  const peer = new ClientPeer(async (message) => {
    const sending = sendFrame(socket, lifetime, message)
    if (message[1] === MessageType.REQUEST) return sending
    await sending.catch((error: unknown) => peer.close({id: message[0], reason: error}))
  })
  socket.addEventListener('message', (event: MessageEvent) => {
    void receivedFrame(event)
      .then((message) => peer.message(message))
      .catch((error: unknown) => {
        console.error('[conciv] the dev server sent a frame the rpc client could not read', error)
        peer.close({reason: error})
      })
  })
  socket.addEventListener('close', () => peer.close({reason: engineUnreachable(CONNECTION_CLOSED_MESSAGE)}))
  return {
    call: async (request) => {
      await attemptSettled(
        socket,
        request.signal === undefined ? lifetime : AbortSignal.any([lifetime, request.signal]),
      )
      request.signal?.throwIfAborted()
      if (socket.readyState !== socket.OPEN) throw engineUnreachable(SOCKET_NOT_OPEN_MESSAGE)
      const response = await peer.request(request)
      return {...response, body: async () => response.body}
    },
  }
}

function isEventIterator(value: unknown): value is AsyncIteratorObject<unknown, unknown, void> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

function socketLink(
  socket: ReconnectingWebSocket,
  state: TrustState,
  lifetime: AbortSignal,
  timings: EngineConnectionTimings,
): ClientLink<RpcClientContext> {
  return new StandardRPCLink<RpcClientContext>(socketClient(socket, lifetime), {
    url: SOCKET_LINK_URL,
    headers: sessionHeaders,
    interceptors: [
      async (options) => {
        const sent = state.token
        const refused = (error: unknown, credential: string | undefined): unknown => {
          if (unauthorized(error)) distrust(state, credential)
          return error
        }
        const output = await options.next().catch((error: unknown) => {
          throw refused(error, sent)
        })
        if (!isEventIterator(output)) return output
        return mapEventIterator(output, {
          value: async (value) => value,
          error: async (error) => refused(error, state.token),
        })
      },
    ],
    plugins: [retryPlugin(socket, lifetime, timings)],
  })
}

function makeEngineTrust(
  state: TrustState,
  link: ClientLink<RpcClientContext>,
  timings: EngineConnectionTimings,
): EngineTrust {
  const auth = createORPCClient<ContractRouterClient<typeof contract, RpcClientContext>>(link).auth
  const answerDeadline = (): AbortSignal => AbortSignal.timeout(timings.authTimeoutMs)
  const trustAnswer = async (token: string): Promise<boolean> => {
    const answer = await auth
      .trust({token}, {signal: answerDeadline(), context: {retry: 0}})
      .catch((error: unknown) => {
        if (unauthorized(error)) return {trusted: false}
        throw error
      })
    return answer.trusted
  }
  const settle = (token: string, trusted: boolean): boolean => {
    if (trusted) trustWith(state, token)
    else refuse(state, token)
    return trusted
  }
  const askWithToken = async (token: string): Promise<boolean> => settle(token, await trustAnswer(token))
  const askHeldThenSource = async (held: string, source: EngineTokenSource, storedOnly: boolean): Promise<boolean> => {
    if (await trustAnswer(held)) return settle(held, true)
    if (storedOnly) return false
    const sourced = await sourcedToken(source)
    if (sourced === undefined) return settle(held, false)
    if (await trustAnswer(sourced)) return settle(sourced, true)
    settle(held, false)
    return settle(sourced, false)
  }
  const ask = async (storedOnly: boolean): Promise<boolean> => {
    try {
      const held = state.token ?? readStoredToken(state.key) ?? ''
      const source = state.tokenSource
      if (source === undefined) return await askWithToken(held)
      return await askHeldThenSource(held, source, storedOnly)
    } catch (error) {
      console.error('[conciv] the dev server did not answer the trust check', error)
      if (state.status === 'checking') setStatus(state, 'unreachable')
      return false
    }
  }
  const pending = (asked: Promise<boolean>): Promise<boolean> => {
    const settled = asked.catch(() => false)
    const clear = (): void => {
      if (state.asking === settled) state.asking = undefined
    }
    state.asking = settled
    void settled.then(clear)
    return asked
  }
  const requestTrust = (options: {storedOnly?: boolean} = {}): Promise<boolean> => {
    if (state.status === 'trusted') return Promise.resolve(true)
    return state.asking ?? pending(ask(options.storedOnly ?? false))
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
    requestTrustWithToken: (token) => pending(askWithToken(token)),
    requestTrustWithCode: async (code) => {
      const result = await auth.exchange({code}, {signal: answerDeadline()})
      if ('token' in result) trustWith(state, result.token)
      return result
    },
    requestAuthCode: async (options = {}) => {
      await auth.requestCode({reissue: options.reissue ?? false}, {signal: answerDeadline()})
    },
  }
}

function socketConnection(id: string, key: ConnectionKey, state: TrustState): ConnectionEntry {
  const {timings} = key
  const lifetime = new AbortController()
  const connectUrl = async (): Promise<string> =>
    rpcSocketUrl(key.apiBase, key.token ?? (await sourcedToken(state.tokenSource)))
  const socket = new ReconnectingWebSocket(connectUrl, [], {
    minReconnectionDelay: timings.reconnectMinDelayMs,
    maxReconnectionDelay: timings.reconnectMaxDelayMs,
    reconnectionDelayGrowFactor: timings.reconnectDelayGrowth,
    minUptime: MIN_UPTIME_MS,
    connectionTimeout: timings.openTimeoutMs,
  })
  const vote = (reachable: boolean): void => {
    if (!lifetime.signal.aborted) state.events.dispatchEvent(new CustomEvent(REACHABILITY_EVENT, {detail: reachable}))
  }
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({type: SOCKET_TRUST_FRAME, token: state.token ?? ''}))
    vote(true)
  })
  socket.addEventListener('close', (event) => {
    if (event.code === REVOKED_SOCKET_CLOSE_CODE) {
      distrust(state, state.token)
      return
    }
    vote(false)
  })
  const rpc = socketLink(socket, state, lifetime.signal, timings)
  const link: ClientLink<RpcClientContext> = {
    call: (path, input, options) => {
      if (isStreamingCall(path)) return rpc.call(path, input, options)
      const deadline = performance.now() + timings.callDeadlineMs
      const asked = options.context.shouldRetry
      const callerRetries = async (attempt: ClientRetryPluginAttemptOptions<RpcClientContext>): Promise<boolean> => {
        if (asked === undefined) return performance.now() < deadline && retriable(lifetime.signal, attempt)
        return typeof asked === 'function' ? asked(attempt) : asked
      }
      const shouldRetry = async (attempt: ClientRetryPluginAttemptOptions<RpcClientContext>): Promise<boolean> =>
        !lifetime.signal.aborted && (await callerRetries(attempt))
      return rpc.call(path, input, {...options, context: {...options.context, shouldRetry}})
    },
  }
  const trust = makeEngineTrust(state, link, timings)
  socket.addEventListener('open', () => {
    if (state.status === 'unreachable') void trust.requestTrust()
  })
  return {
    id,
    link,
    state,
    trust,
    holders: new Set(),
    close: () => {
      lifetime.abort()
      socket.close()
      state.asking = undefined
    },
  }
}

function connectionKey(apiBase: string, timings: Partial<EngineConnectionTimings> = {}, token?: string): ConnectionKey {
  return {apiBase: normalizeApiBase(apiBase), timings: {...defaultEngineConnectionTimings, ...timings}, token}
}

function connectionId(key: ConnectionKey): string {
  return JSON.stringify([key.apiBase, key.token ?? null, key.timings])
}

function connectionEntry(key: ConnectionKey): ConnectionEntry {
  const id = connectionId(key)
  const existing = connections().get(id)
  if (existing) return existing
  const created = socketConnection(id, key, {
    key: key.apiBase,
    status: 'checking',
    token: readStoredToken(key.apiBase),
    events: new EventTarget(),
    tokenSource: undefined,
    asking: undefined,
  })
  connections().set(id, created)
  return created
}

type HeldEntry = {entry: ConnectionEntry; release: () => void}

function holdConnection(key: ConnectionKey): HeldEntry {
  const entry = connectionEntry(key)
  const holder = {}
  entry.holders.add(holder)
  return {
    entry,
    release: () => {
      if (!entry.holders.delete(holder) || entry.holders.size > 0) return
      if (connections().get(entry.id) === entry) connections().delete(entry.id)
      entry.close()
    },
  }
}

export function subscribeRpcReachability(
  apiBase: string,
  listener: ReachabilityListener,
  timings?: Partial<EngineConnectionTimings>,
): () => void {
  const {entry, release} = holdConnection(connectionKey(apiBase, timings))
  const {events} = entry.state
  const handler = (event: Event): void => {
    if (event instanceof CustomEvent && typeof event.detail === 'boolean') listener(event.detail)
  }
  events.addEventListener(REACHABILITY_EVENT, handler)
  return () => {
    events.removeEventListener(REACHABILITY_EVENT, handler)
    release()
  }
}

export function browserRpcConnection(
  apiBase: string,
  tokenSource?: EngineTokenSource,
  timings?: Partial<EngineConnectionTimings>,
): BrowserRpcConnection {
  const {entry, release} = holdConnection(connectionKey(apiBase, timings))
  if (tokenSource !== undefined) entry.state.tokenSource = tokenSource
  return {link: entry.link, trust: entry.trust, release}
}

export const RPC_UNBOUND_MESSAGE = 'conciv core not connected yet'

export type HeldBrowserRpcLink = {link: ClientLink<RpcClientContext>; release: () => void}

const NOT_HELD: HeldEntry | undefined = undefined

export function heldBrowserRpcLink(
  currentApiBase: () => string | null,
  session?: SessionAccessor,
  timings?: Partial<EngineConnectionTimings>,
  currentToken: () => string | undefined = () => undefined,
): HeldBrowserRpcLink {
  const held: {current: HeldEntry | undefined} = {current: NOT_HELD}
  const hold = (apiBase: string): ConnectionEntry => {
    const key = connectionKey(apiBase, timings, currentToken())
    if (held.current?.entry.id === connectionId(key)) return held.current.entry
    held.current?.release()
    held.current = holdConnection(key)
    return held.current.entry
  }
  return {
    link: {
      call: (path, input, options) => {
        const apiBase = currentApiBase()
        if (apiBase === null) throw engineUnreachable(RPC_UNBOUND_MESSAGE)
        const sessionId = session?.()
        const context = sessionId ? {...options.context, concivSessionId: sessionId} : options.context
        return hold(apiBase).link.call(path, input, {...options, context})
      },
    },
    release: () => {
      held.current?.release()
      held.current = NOT_HELD
    },
  }
}
