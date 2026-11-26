import {Effect, Exit, Scope} from 'effect'
import {Socket} from 'effect/socket'
import {makeEngineConnection, type EngineConnection, type EngineTokenSource} from './engine-connection.js'
import {defaultEngineConnectionTimings, type EngineConnectionTimings} from './engine-connection-machine.js'

export {
  createConnectionState,
  defaultEngineConnectionTimings,
  REVOKED_SOCKET_CLOSE_CODE,
  transitionConnection,
  type ConnectionEvent,
  type ConnectionState,
  type EngineConnectionTimings,
  type TrustStatus,
} from './engine-connection-machine.js'
export {
  engineUnreachable,
  isEngineUnreachable,
  type EngineConnection,
  type EngineTokenSource,
  type EngineTrust,
  type EngineUnreachable,
  type ReachabilityListener,
  type RpcClientContext,
  type SessionAccessor,
  type TrustListener,
} from './engine-connection.js'

const MAGIC_LINK_PARAM = 'conciv_otp'

export type BrowserEngineConnection = EngineConnection & {readonly dispose: () => void}

export type BrowserEngineConnectionOptions = {
  readonly token?: string
  readonly tokenSource?: EngineTokenSource
  readonly timings?: Partial<EngineConnectionTimings>
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

export function makeBrowserEngineConnection(
  apiBase: string,
  options: BrowserEngineConnectionOptions = {},
): BrowserEngineConnection {
  const scope = Scope.makeUnsafe()
  const connection = Effect.runSync(
    makeEngineConnection(
      normalizeApiBase(apiBase),
      {...defaultEngineConnectionTimings, ...options.timings},
      options.token,
      options.tokenSource,
    ).pipe(Scope.provide(scope), Effect.provide(Socket.layerWebSocketConstructorGlobal)),
  )
  return {
    ...connection,
    dispose: () => {
      Effect.runFork(Scope.close(scope, Exit.void))
    },
  }
}
