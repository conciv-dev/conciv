import {call as callProcedure, ORPCError, Procedure, type AnyRouter} from '@orpc/server'
import {createORPCClient, type ClientLink} from '@orpc/client'
import {
  createConnectionState,
  REVOKED_SOCKET_CLOSE_CODE,
  transitionConnection,
  type ConnectionEvent,
  type ConnectionState,
} from '@conciv/client'
import type {EngineConnection, EngineTrust, ReachabilityListener, RpcClientContext, TrustListener} from '@conciv/client'
import type {EngineClient} from '@conciv/client'
import {lookup} from './fake-router.js'
import type {FakeConnectOptions} from './fake-types.js'

function makeLoginCode(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)
    .padStart(6, '0')
    .slice(-6)
}

const MAX_CODE_FAILURES = 5

export function issueCode(access: Access): string {
  const code = makeLoginCode()
  access.code = code
  access.failures = 0
  return code
}

function unauthorizedCall(): never {
  throw new ORPCError('UNAUTHORIZED', {message: 'this browser is not authorized'})
}

function refusedTrust(error: unknown): boolean {
  return error instanceof ORPCError && error.code === 'UNAUTHORIZED'
}

export type Access = {
  required: string | undefined
  code: string | undefined
  failures: number
  readonly links: Set<AbortController>
  readonly connections: Set<FakeConnection>
  up: PromiseWithResolvers<void> | undefined
}

export type FakeConnection = {
  readonly connection: EngineConnection
  readonly revoke: () => void
  readonly reachable: (reachable: boolean) => void
}

function accepts(access: Access, token: string | undefined): boolean {
  return access.required === undefined || token === access.required
}

export function fakeConnection(
  router: AnyRouter,
  access: Access,
  version: () => string | null,
  options: FakeConnectOptions,
): FakeConnection {
  const state: {current: ConnectionState} = {current: {...createConnectionState(options.token), socket: 'open'}}
  const trustListeners = new Set<TrustListener>()
  const reachabilityListeners = new Set<ReachabilityListener>()
  const dispatch = (event: ConnectionEvent): void => {
    const next = transitionConnection(state.current, event)
    state.current = {...next.state, socket: 'open'}
    for (const effect of next.effects) {
      if (effect.type !== 'publish') continue
      const signal = effect.signal
      if (signal.type === 'status') trustListeners.forEach((listener) => listener(signal.status, signal.previous))
      else reachabilityListeners.forEach((listener) => listener(signal.reachable))
    }
  }
  const invoke = async (path: readonly string[], input: unknown, signal: AbortSignal | undefined): Promise<unknown> => {
    const procedure = lookup(router, path)
    if (!(procedure instanceof Procedure))
      throw new ORPCError('NOT_FOUND', {message: `no procedure at ${path.join('.')}`})
    await access.up?.promise
    const sent = state.current.token
    if (path[0] !== 'auth' && !accepts(access, sent)) {
      dispatch({type: 'unauthorized', token: sent})
      unauthorizedCall()
    }
    const lifetime = new AbortController()
    access.links.add(lifetime)
    const ended = signal === undefined ? lifetime.signal : AbortSignal.any([signal, lifetime.signal])
    ended.addEventListener('abort', () => access.links.delete(lifetime), {once: true})
    try {
      const result: unknown = await callProcedure(procedure, input, {signal: ended})
      if (!isAsyncIterable(result)) access.links.delete(lifetime)
      return result
    } catch (error) {
      access.links.delete(lifetime)
      if (refusedTrust(error)) dispatch({type: 'unauthorized', token: sent})
      throw error
    }
  }
  const link: ClientLink<RpcClientContext> = {
    call: (path, input, callOptions) => invoke(path, input, callOptions.signal),
  }
  const auth = createORPCClient<EngineClient>(link).auth
  const trustWithToken = async (token: string): Promise<boolean> => {
    const {trusted} = await auth.trust({token})
    dispatch(trusted ? {type: 'trusted', token} : {type: 'trust-refused', token})
    return trusted
  }
  const sourced = async (): Promise<string | undefined> =>
    options.tokenSource === undefined ? undefined : options.tokenSource().catch(() => undefined)
  const requestTrust = async (storedOnly: boolean): Promise<boolean> => {
    if (state.current.trust === 'trusted') return true
    const held = state.current.token ?? ''
    if (options.tokenSource === undefined) return trustWithToken(held)
    const {trusted} = await auth.trust({token: held})
    if (trusted) return trustWithToken(held)
    if (storedOnly) return false
    const token = await sourced()
    if (token === undefined) return trustWithToken(held)
    return trustWithToken(token)
  }
  const trust: EngineTrust = {
    isTrusted: () => state.current.trust === 'trusted',
    status: () => state.current.trust,
    subscribe: (listener) => {
      trustListeners.add(listener)
      return () => trustListeners.delete(listener)
    },
    requestTrust: (requested = {}) => requestTrust(requested.storedOnly ?? false),
    requestTrustWithToken: trustWithToken,
    requestTrustWithCode: async (code) => {
      const result = await auth.exchange({code})
      if ('token' in result) dispatch({type: 'trusted', token: result.token})
      return result
    },
    requestAuthCode: async (requested = {}) => {
      await auth.requestCode({reissue: requested.reissue ?? false})
    },
  }
  return {
    connection: {
      link,
      trust,
      reset: () => undefined,
      subscribeReachability: (listener) => {
        reachabilityListeners.add(listener)
        return () => reachabilityListeners.delete(listener)
      },
      version: async () => version(),
    },
    revoke: () => dispatch({type: 'socket-closed', attempt: state.current.attempt, code: REVOKED_SOCKET_CLOSE_CODE}),
    reachable: (reachable) => reachabilityListeners.forEach((listener) => listener(reachable)),
  }
}

function isAsyncIterable(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

export function endLinks(access: Access): void {
  const links = [...access.links]
  access.links.clear()
  links.forEach((lifetime) => lifetime.abort())
}

export function authHandlers(access: Access) {
  const issuedToken = (): string => {
    access.required ??= crypto.randomUUID()
    return access.required
  }
  return {
    trust: ({token}: {token: string}) => ({trusted: accepts(access, token)}),
    requestCode: ({reissue}: {reissue?: boolean | undefined}) => {
      if (reissue === true || access.code === undefined) issueCode(access)
      return {expiresAt: Date.now() + 60_000}
    },
    exchange: ({code}: {code: string}) => {
      if (access.code === undefined) return {refused: 'expired' as const}
      if (code === access.code) {
        access.code = undefined
        return {token: issuedToken()}
      }
      access.failures += 1
      if (access.failures >= MAX_CODE_FAILURES) access.code = undefined
      return {refused: 'mismatch' as const}
    },
  }
}
