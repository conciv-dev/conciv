import {ORPCError, type ClientLink, type ClientOptions} from '@orpc/client'
import {RPCLink as FetchRpcLink} from '@orpc/client/fetch'
import {ClientRetryPlugin, type ClientRetryPluginContext} from '@orpc/client/plugins'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'

export type RpcClientContext = ClientRetryPluginContext & {concivSessionId?: string}

export type SessionAccessor = () => string | null

const CONNECTION_LOSS_RETRIES = 12
const CONNECTION_LOSS_RETRY_DELAY_MS = 250

export type BrowserRpcConnection = {
  link: ClientLink<RpcClientContext>
  close: () => void
}

function sessionHeaders(options: ClientOptions<RpcClientContext>): Record<string, string> {
  const id = options.context.concivSessionId
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

function fetchLink(apiBase: string, alive: () => boolean, vote: ReachabilityListener): ClientLink<RpcClientContext> {
  return new FetchRpcLink<RpcClientContext>({
    url: `${apiBase}/rpc`,
    headers: sessionHeaders,
    plugins: [retryPlugin(alive, vote)],
  })
}

function fetchConnection(key: string): BrowserRpcConnection {
  const connectionId = Symbol('conciv-rpc-connection')
  activeConnections().set(key, connectionId)
  const vote = (reachable: boolean): void => voteReachability(key, connectionId, reachable)
  const state = {open: true}
  return {
    link: fetchLink(key, () => state.open, vote),
    close: () => {
      state.open = false
    },
  }
}

export function browserRpcConnection(apiBase: string): BrowserRpcConnection {
  const key = normalizeApiBase(apiBase)
  const connections = registry()
  const existing = connections.get(key)
  if (existing) return existing
  const created = fetchConnection(key)
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

export function resetBrowserRpcConnection(apiBase: string): BrowserRpcConnection {
  closeBrowserRpcConnection(apiBase)
  return browserRpcConnection(apiBase)
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
