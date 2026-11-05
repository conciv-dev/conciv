import {createORPCClient, ORPCError, type ClientLink, type ClientOptions} from '@orpc/client'
import {RPCLink as FetchRpcLink} from '@orpc/client/fetch'
import {ClientRetryPlugin, type ClientRetryPluginContext} from '@orpc/client/plugins'
import type {ContractRouterClient} from '@orpc/contract'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {contract, SOCKET_TRUST_FRAME, type ExchangeResult} from './contract.js'

export type RpcClientContext = ClientRetryPluginContext & {concivSessionId?: string}

export type SessionAccessor = () => string | null

const CONNECTION_LOSS_RETRIES = 12
const CONNECTION_LOSS_RETRY_DELAY_MS = 250
const ENSURE_TRUSTED_TIMEOUT_MS = 60_000
const TOKEN_STORAGE_PREFIX = 'conciv:engine-token:'
const MAGIC_LINK_PARAM = 'conciv_otp'
const UNAUTHORIZED_STATUS = 401

export const REVOKED_SOCKET_CLOSE_CODE = 1008

export type TrustStatus = 'checking' | 'trusted' | 'untrusted' | 'unreachable'

export type TrustListener = (status: TrustStatus) => void

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

type TrustState = {key: string; status: TrustStatus; token: string | undefined; listeners: Set<TrustListener>}

export type BrowserRpcConnection = {
  link: ClientLink<RpcClientContext>
  trust: EngineTrust
  close: () => void
}

type ConnectionEntry = BrowserRpcConnection & {state: TrustState}

export type ReachabilityListener = (reachable: boolean) => void

type Registry = Map<string, ConnectionEntry>
type ReachabilityRegistry = Map<string, Set<ReachabilityListener>>
type ActiveConnectionRegistry = Map<string, symbol>

declare global {
  // eslint-disable-next-line no-var
  var __concivBrowserRpcRegistryV2: Registry | undefined
  // eslint-disable-next-line no-var
  var __concivRpcReachabilityListenersV1: ReachabilityRegistry | undefined
  // eslint-disable-next-line no-var
  var __concivRpcReachabilityActiveV1: ActiveConnectionRegistry | undefined
}

function registry(): Registry {
  globalThis.__concivBrowserRpcRegistryV2 ??= new Map()
  return globalThis.__concivBrowserRpcRegistryV2
}

function reachabilityListeners(): ReachabilityRegistry {
  globalThis.__concivRpcReachabilityListenersV1 ??= new Map()
  return globalThis.__concivRpcReachabilityListenersV1
}

function activeConnections(): ActiveConnectionRegistry {
  globalThis.__concivRpcReachabilityActiveV1 ??= new Map()
  return globalThis.__concivRpcReachabilityActiveV1
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

export function consumeMagicLinkCode(): string | undefined {
  if (typeof location === 'undefined') return undefined
  const url = new URL(location.href)
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  const code = fragment.get(MAGIC_LINK_PARAM) ?? undefined
  if (code === undefined) return undefined
  fragment.delete(MAGIC_LINK_PARAM)
  url.hash = fragment.toString()
  history.replaceState(history.state, '', url.href)
  return code
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

function setStatus(state: TrustState, status: TrustStatus): void {
  if (state.status === status) return
  state.status = status
  for (const listener of state.listeners) listener(status)
}

function distrust(state: TrustState, refused: string | undefined): void {
  if (state.status === 'checking' || refused !== state.token) return
  if (state.token !== undefined && readStoredToken(state.key) === state.token) writeStoredToken(state.key, undefined)
  state.token = undefined
  setStatus(state, 'untrusted')
}

function bearer(state: TrustState): Record<string, string> {
  return state.token === undefined ? {} : {authorization: `Bearer ${state.token}`}
}

function requestHeaders(state: TrustState, options: ClientOptions<RpcClientContext>): Record<string, string> {
  const id = options.context.concivSessionId
  return {...bearer(state), ...(id ? {[CONCIV_SESSION_HEADER]: id} : {})}
}

function fetchLink(
  key: string,
  state: TrustState,
  alive: () => boolean,
  vote: ReachabilityListener,
): ClientLink<RpcClientContext> {
  return new FetchRpcLink<RpcClientContext>({
    url: `${key}/rpc`,
    headers: (options) => requestHeaders(state, options),
    interceptors: [
      (options) => {
        const sent = state.token
        return options.next().catch((error: unknown) => {
          if (error instanceof ORPCError && error.status === UNAUTHORIZED_STATUS) distrust(state, sent)
          throw error
        })
      },
    ],
    plugins: [retryPlugin(alive, vote)],
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
    setStatus(state, 'untrusted')
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
    state.listeners.add(listener)
    return () => {
      state.listeners.delete(listener)
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

function fetchConnection(key: string, state: TrustState): ConnectionEntry {
  const connectionId = Symbol('conciv-rpc-connection')
  activeConnections().set(key, connectionId)
  const vote = (reachable: boolean): void => voteReachability(key, connectionId, reachable)
  const open = {value: true}
  const link = fetchLink(key, state, () => open.value, vote)
  return {
    link,
    state,
    trust: makeEngineTrust(key, state, link),
    close: () => {
      open.value = false
    },
  }
}

function connectionEntry(apiBase: string): ConnectionEntry {
  const key = normalizeApiBase(apiBase)
  const connections = registry()
  const existing = connections.get(key)
  if (existing) return existing
  const created = fetchConnection(key, {key, status: 'checking', token: readStoredToken(key), listeners: new Set()})
  connections.set(key, created)
  return created
}

export function browserRpcConnection(apiBase: string): BrowserRpcConnection {
  return connectionEntry(apiBase)
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

export function resetBrowserRpcConnection(apiBase: string): BrowserRpcConnection {
  const key = normalizeApiBase(apiBase)
  const existing = registry().get(key)
  closeBrowserRpcConnection(apiBase)
  if (!existing) return browserRpcConnection(apiBase)
  const reset = fetchConnection(key, existing.state)
  registry().set(key, reset)
  return reset
}

export function engineHeaders(apiBase: string): Record<string, string> {
  return bearer(connectionEntry(apiBase).state)
}

export function engineWebSocket(apiBase: string): typeof WebSocket {
  return new Proxy(WebSocket, {
    construct: (target, args) => {
      const socket: WebSocket = Reflect.construct(target, args)
      const sent: {token: string | undefined} = {token: undefined}
      socket.addEventListener('open', () => {
        sent.token = connectionEntry(apiBase).state.token
        socket.send(JSON.stringify({type: SOCKET_TRUST_FRAME, token: sent.token ?? ''}))
      })
      socket.addEventListener('close', (event) => {
        if (event.code === REVOKED_SOCKET_CLOSE_CODE) distrust(connectionEntry(apiBase).state, sent.token)
      })
      return socket
    },
  })
}

export const RPC_UNBOUND_MESSAGE = 'conciv core not connected yet'

export function dynamicBrowserRpcLink(
  currentApiBase: () => string | null,
  session?: SessionAccessor,
): ClientLink<RpcClientContext> {
  return {
    call: (path, input, options) => {
      const apiBase = currentApiBase()
      if (apiBase === null) throw new Error(RPC_UNBOUND_MESSAGE)
      const sessionId = session?.()
      const context = sessionId ? {...options.context, concivSessionId: sessionId} : options.context
      return browserRpcConnection(apiBase).link.call(path, input, {...options, context})
    },
  }
}
