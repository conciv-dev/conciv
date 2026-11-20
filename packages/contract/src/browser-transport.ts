import type {ClientLink} from '@orpc/client'
import {Effect, Exit, Option, RcMap, Scope} from 'effect'
import {Socket} from 'effect/socket'
import {
  makeEngineConnection,
  type EngineConnection,
  type EngineTokenSource,
  type EngineTrust,
  type ReachabilityListener,
  type RpcClientContext,
  type SessionAccessor,
} from './engine-connection.js'

import {defaultEngineConnectionTimings, type EngineConnectionTimings} from './engine-connection-machine.js'

export {
  defaultEngineConnectionTimings,
  REVOKED_SOCKET_CLOSE_CODE,
  type EngineConnectionTimings,
  type TrustStatus,
} from './engine-connection-machine.js'
export type {
  EngineTokenSource,
  EngineTrust,
  ReachabilityListener,
  RpcClientContext,
  SessionAccessor,
  TrustListener,
} from './engine-connection.js'

const MAGIC_LINK_PARAM = 'conciv_otp'

export type BrowserRpcConnection = {
  link: ClientLink<RpcClientContext>
  trust: EngineTrust
  release: () => void
}

type HeldConnection = {readonly connection: EngineConnection; readonly release: () => void}

type ConnectionKey = {readonly apiBase: string; readonly timings: EngineConnectionTimings}

type ConnectionPool = {
  readonly hold: (key: ConnectionKey) => HeldConnection
  readonly find: (apiBase: string) => readonly EngineConnection[]
}

declare global {
  // eslint-disable-next-line no-var
  var __concivBrowserRpcConnectionsV7: ConnectionPool | undefined
}

function borrow<A>(lookup: Effect.Effect<A, never, Scope.Scope>): {value: A; release: () => void} {
  const scope = Scope.makeUnsafe()
  return {
    value: Effect.runSync(Scope.provide(lookup, scope)),
    release: () => {
      Effect.runFork(Scope.close(scope, Exit.void))
    },
  }
}

function makeConnectionPool(): ConnectionPool {
  const connections = Effect.runSync(
    RcMap.make({lookup: (key: ConnectionKey) => makeEngineConnection(key.apiBase, key.timings)}).pipe(
      Scope.provide(Scope.makeUnsafe()),
      Effect.provide(Socket.layerWebSocketConstructorGlobal),
    ),
  )
  return {
    hold: (key) => {
      const held = borrow(RcMap.get(connections, key))
      return {connection: held.value, release: held.release}
    },
    find: (apiBase) => {
      const found = borrow(
        RcMap.keys(connections).pipe(
          Effect.flatMap((keys) =>
            Effect.forEach(
              [...keys].filter((key) => key.apiBase === apiBase),
              (key) => RcMap.getOption(connections, key),
            ),
          ),
        ),
      )
      found.release()
      return found.value.flatMap((connection) => Option.toArray(connection))
    },
  }
}

function connectionPool(): ConnectionPool {
  globalThis.__concivBrowserRpcConnectionsV7 ??= makeConnectionPool()
  return globalThis.__concivBrowserRpcConnectionsV7
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

function holdConnection(apiBase: string, timings: Partial<EngineConnectionTimings> = {}): HeldConnection {
  return connectionPool().hold({
    apiBase: normalizeApiBase(apiBase),
    timings: {...defaultEngineConnectionTimings, ...timings},
  })
}

export function subscribeRpcReachability(apiBase: string, listener: ReachabilityListener): () => void {
  const {connection, release} = holdConnection(apiBase)
  const unsubscribe = connection.subscribeReachability(listener)
  return () => {
    unsubscribe()
    release()
  }
}

export function browserRpcConnection(
  apiBase: string,
  tokenSource?: EngineTokenSource,
  timings?: Partial<EngineConnectionTimings>,
): BrowserRpcConnection {
  const {connection, release} = holdConnection(apiBase, timings)
  if (tokenSource !== undefined) connection.useTokenSource(tokenSource)
  return {link: connection.link, trust: connection.trust, release}
}

export function resetBrowserRpcConnection(apiBase: string): void {
  connectionPool()
    .find(normalizeApiBase(apiBase))
    .forEach((connection) => connection.reset())
}

export const RPC_UNBOUND_MESSAGE = 'conciv core not connected yet'

export type HeldBrowserRpcLink = {link: ClientLink<RpcClientContext>; release: () => void}

type HeldBase = {key: string | null; held: HeldConnection | undefined}

const NOT_HELD: HeldBase = {key: null, held: undefined}

export function heldBrowserRpcLink(currentApiBase: () => string | null, session?: SessionAccessor): HeldBrowserRpcLink {
  const held: {current: HeldBase} = {current: NOT_HELD}
  const hold = (apiBase: string): EngineConnection => {
    const key = normalizeApiBase(apiBase)
    if (held.current.key === key && held.current.held !== undefined) return held.current.held.connection
    held.current.held?.release()
    const next = holdConnection(key)
    held.current = {key, held: next}
    return next.connection
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
      held.current.held?.release()
      held.current = NOT_HELD
    },
  }
}
