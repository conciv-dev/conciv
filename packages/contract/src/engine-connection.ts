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
  type EncodedMessage,
} from '@orpc/standard-server-peer'
import {
  Clock,
  Deferred,
  Duration,
  Effect,
  Exit,
  FiberHandle,
  Match,
  Option,
  PubSub,
  Ref,
  Scope,
  Semaphore,
  Stream,
  SubscriptionRef,
} from 'effect'
import {Socket} from 'effect/socket'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {CONCIV_AUTH_TOKEN_QUERY_PARAM, RPC_WS_PATH} from '@conciv/protocol/rpc-types'
import {contract, SOCKET_TRUST_FRAME, type ExchangeResult} from './contract.js'
import {
  createConnectionState,
  defaultEngineConnectionTimings,
  transitionConnection,
  type ConnectionEffect,
  type ConnectionEvent,
  type ConnectionSignal,
  type ConnectionState,
  type EngineConnectionTimings,
  type TrustStatus,
} from './engine-connection-machine.js'

export type RpcClientContext = ClientRetryPluginContext & {concivSessionId?: string}

export type SessionAccessor = () => string | null

export type TrustListener = (status: TrustStatus, previous: TrustStatus) => void

export type ReachabilityListener = (reachable: boolean) => void

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

export type EngineConnection = {
  readonly link: ClientLink<RpcClientContext>
  readonly trust: EngineTrust
  readonly reset: () => void
  readonly useTokenSource: (source: EngineTokenSource) => void
  readonly subscribeReachability: (listener: ReachabilityListener) => () => void
}

const MIN_UPTIME = Duration.seconds(1)
const UNAUTHORIZED_STATUS = 401
const NORMAL_CLOSE_CODE = 1000
const ABNORMAL_CLOSE_CODE = 1006
const SOCKET_LINK_URL = 'http://orpc'
const WEBSOCKET_OPEN = 1
const SOCKET_NOT_OPEN_MESSAGE = 'Cannot send message, WebSocket is not open.'
const CONNECTION_CLOSED_MESSAGE = 'The engine connection closed before the call was answered.'
const TOKEN_STORAGE_PREFIX = 'conciv:engine-token:'

export type EngineUnreachable = Error & {readonly isEngineUnreachable: true}

export function engineUnreachable(message: string, cause?: unknown): EngineUnreachable {
  return Object.assign(new Error(message, {cause}), {isEngineUnreachable: true as const})
}

export function isEngineUnreachable(value: unknown): value is EngineUnreachable {
  return value instanceof Error && Reflect.get(value, 'isEngineUnreachable') === true
}

function storageRefused(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'SecurityError' || error.name === 'QuotaExceededError')
}

function tokenStorage(): Storage | undefined {
  return typeof localStorage === 'undefined' ? undefined : (localStorage ?? undefined)
}

function storageEffect<A>(io: () => A, fallback: A): Effect.Effect<A> {
  return Effect.try({try: io, catch: (error) => error}).pipe(
    Effect.catch((error) =>
      storageRefused(error)
        ? Effect.succeed(fallback)
        : Effect.logError('[conciv] the engine token storage failed', error).pipe(Effect.as(fallback)),
    ),
  )
}

function readStoredToken(key: string): Effect.Effect<string | undefined> {
  return storageEffect(() => tokenStorage()?.getItem(`${TOKEN_STORAGE_PREFIX}${key}`) ?? undefined, undefined)
}

function storeToken(key: string, token: string): Effect.Effect<void> {
  return storageEffect(() => tokenStorage()?.setItem(`${TOKEN_STORAGE_PREFIX}${key}`, token), undefined)
}

function forgetToken(key: string, token: string): Effect.Effect<void> {
  return readStoredToken(key).pipe(
    Effect.flatMap((stored) =>
      stored === token
        ? storageEffect(() => tokenStorage()?.removeItem(`${TOKEN_STORAGE_PREFIX}${key}`), undefined)
        : Effect.void,
    ),
  )
}

function rpcSocketUrl(key: string, token: string | undefined): string {
  const url = new URL(`${key}${RPC_WS_PATH}`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (token !== undefined && token !== '') url.searchParams.set(CONCIV_AUTH_TOKEN_QUERY_PARAM, token)
  return url.toString()
}

function isStreamingCall(path: readonly string[]): boolean {
  const procedure = getContractRouter(contract, path)
  return isContractProcedure(procedure) && getEventIteratorSchemaDetails(procedure['~orpc'].outputSchema) !== undefined
}

function frame(encoded: EncodedMessage): string | Uint8Array<ArrayBuffer> {
  if (typeof encoded === 'string') return encoded
  return Uint8Array.from(ArrayBuffer.isView(encoded) ? encoded : new Uint8Array(encoded))
}

function closeCode(error: Socket.SocketError): number {
  return error.reason instanceof Socket.SocketCloseError ? error.reason.code : ABNORMAL_CLOSE_CODE
}

function sessionHeaders(options: ClientOptions<RpcClientContext>): Record<string, string> {
  const id = options.context.concivSessionId
  return id ? {[CONCIV_SESSION_HEADER]: id} : {}
}

function isEventIterator(value: unknown): value is AsyncIteratorObject<unknown, unknown, void> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

function unauthorized(error: unknown): boolean {
  return error instanceof ORPCError && error.status === UNAUTHORIZED_STATUS
}

function stalled(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'TimeoutError'
}

function untilAborted(signal: AbortSignal | undefined): Effect.Effect<void> {
  if (signal === undefined) return Effect.never
  return Effect.callback<void>((resume) => {
    if (signal.aborted) return resume(Effect.void)
    const settle = (): void => resume(Effect.void)
    signal.addEventListener('abort', settle, {once: true})
    return Effect.sync(() => signal.removeEventListener('abort', settle))
  })
}

function sourcedToken(source: EngineTokenSource): Effect.Effect<string | undefined> {
  return Effect.tryPromise({try: source, catch: (error) => error}).pipe(
    Effect.catch((error) =>
      Effect.logError('[conciv] the host could not provide an engine token', error).pipe(Effect.as(undefined)),
    ),
  )
}

export const makeEngineConnection = Effect.fn('EngineConnection.make')(function* (
  key: string,
  timings: EngineConnectionTimings = defaultEngineConnectionTimings,
  engineToken?: string,
) {
  const services = yield* Effect.context<never>()
  const run = Effect.runPromiseWith(services)
  const runNow = Effect.runSyncWith(services)
  const runDetached = Effect.runForkWith(services)
  const lifetime = yield* Effect.scope
  const makeWebSocket = yield* Socket.WebSocketConstructor
  const live = yield* Ref.make(Option.none<Socket.WebSocketLike>())
  const tokenSource = yield* Ref.make<EngineTokenSource | undefined>(undefined)
  const connectToken = Effect.gen(function* () {
    if (engineToken !== undefined) return engineToken
    const source = yield* Ref.get(tokenSource)
    return source === undefined ? undefined : yield* sourcedToken(source)
  })
  const socket = yield* Socket.fromWebSocket(
    Effect.acquireRelease(
      connectToken.pipe(
        Effect.map((token) => makeWebSocket(rpcSocketUrl(key, token))),
        Effect.tap((ws) => Ref.set(live, Option.some(ws))),
      ),
      (ws) => Effect.sync(() => ws.close(NORMAL_CLOSE_CODE)),
    ),
    {openTimeout: Duration.millis(timings.openTimeoutMs)},
  )
  const writer = yield* socket.writer
  const state = yield* SubscriptionRef.make(createConnectionState(yield* readStoredToken(key), timings))
  const signals = yield* PubSub.unbounded<ConnectionSignal>()
  const attempts = yield* FiberHandle.make<void, never>()
  const retryTimer = yield* FiberHandle.make<void, never>()
  const uptimeTimer = yield* FiberHandle.make<void, never>()
  const asking = yield* Ref.make(Option.none<Deferred.Deferred<boolean, unknown>>())
  const transitions = yield* Semaphore.make(1)

  const current = (): ConnectionState => SubscriptionRef.getUnsafe(state)
  const disposed = (): boolean => current().socket === 'disposed'

  const dispatch = (event: ConnectionEvent): Effect.Effect<void> =>
    transitions.withPermits(1)(
      Effect.gen(function* () {
        const before = yield* SubscriptionRef.get(state)
        const next = transitionConnection(before, event)
        if (next.state !== before) yield* SubscriptionRef.set(state, next.state)
        yield* Effect.forEach(next.effects, perform, {discard: true})
      }),
    )

  const writeIfOpen = (data: string | Uint8Array<ArrayBuffer>): Effect.Effect<boolean, Socket.SocketError> =>
    transitions.withPermits(1)(
      Effect.gen(function* () {
        const ws = yield* Ref.get(live)
        const open = current().socket === 'open' && Option.exists(ws, (held) => held.readyState === WEBSOCKET_OPEN)
        if (!open) return false
        yield* writer.write(data)
        return true
      }),
    )

  const settled = (signal: AbortSignal | undefined): Effect.Effect<void> =>
    Effect.gen(function* () {
      yield* dispatch({type: 'call-started'})
      const start = yield* SubscriptionRef.get(state)
      if (start.socket === 'open' || start.socket === 'disposed') return
      yield* SubscriptionRef.changes(state).pipe(
        Stream.filter(
          (next) =>
            next.socket === 'open' ||
            next.socket === 'closed' ||
            next.socket === 'disposed' ||
            next.attempt !== start.attempt,
        ),
        Stream.runHead,
      )
    }).pipe(Effect.raceFirst(untilAborted(signal)))

  const reopened = (signal: AbortSignal | undefined): Effect.Effect<void> =>
    SubscriptionRef.changes(state).pipe(
      Stream.filter((next) => next.socket === 'open' || next.socket === 'disposed'),
      Stream.runHead,
      Effect.asVoid,
      Effect.raceFirst(untilAborted(signal)),
    )

  const sendFrame = async ([id, type, payload]: DecodedRequestMessage): Promise<void> => {
    const encoded = await encodeRequestMessage(id, type, payload)
    if (type !== MessageType.ABORT_SIGNAL) await run(settled(undefined))
    const written = await run(writeIfOpen(frame(encoded)))
    if (!written && type !== MessageType.ABORT_SIGNAL) throw engineUnreachable(SOCKET_NOT_OPEN_MESSAGE)
  }

  const peer = new ClientPeer(async (message) => {
    const sending = sendFrame(message)
    if (message[1] === MessageType.REQUEST) return sending
    await sending.catch((error: unknown) => peer.close({id: message[0], reason: error}))
  })

  const deliver = (raw: string | Uint8Array): Effect.Effect<void> =>
    Effect.tryPromise({
      try: async () => peer.message(await decodeResponseMessage(raw)),
      catch: (error) => error,
    }).pipe(
      Effect.catch((error) =>
        Effect.logError('[conciv] the dev server sent a frame the rpc client could not read', error).pipe(
          Effect.andThen(Effect.sync(() => peer.close({reason: error}))),
        ),
      ),
    )

  const connectAttempt = (attempt: number): Effect.Effect<void> =>
    Effect.scoped(
      Effect.gen(function* () {
        const reader = yield* socket.reader
        yield* dispatch({type: 'socket-opened', attempt})
        return yield* reader.pull.pipe(
          Effect.flatMap((chunk) => Effect.forEach(chunk, deliver, {discard: true})),
          Effect.forever,
        )
      }).pipe(Effect.catch((error) => dispatch({type: 'socket-closed', attempt, code: closeCode(error)}))),
    )

  const sendTrustFrame = (token: string) =>
    writer
      .write(JSON.stringify({type: SOCKET_TRUST_FRAME, token}))
      .pipe(Effect.catch((error) => Effect.logError('[conciv] the trust frame could not be sent', error)))

  const after = (delay: Duration.Duration, event: ConnectionEvent) =>
    Effect.andThen(Duration.isZero(delay) ? Effect.void : Effect.sleep(delay), dispatch(event))

  const perform = (effect: ConnectionEffect): Effect.Effect<void> =>
    Match.value(effect).pipe(
      Match.discriminatorsExhaustive('type')({
        'schedule-retry': (retry) =>
          FiberHandle.run(
            retryTimer,
            after(Duration.millis(retry.delayMs), {type: 'retry-due', attempt: retry.attempt}),
            {startImmediately: true},
          ).pipe(Effect.asVoid),
        'open-socket': (opening) =>
          FiberHandle.run(attempts, connectAttempt(opening.attempt), {startImmediately: true}).pipe(Effect.asVoid),
        'close-socket': () => FiberHandle.clear(attempts),
        'close-peer': () => Effect.sync(() => peer.close({reason: engineUnreachable(CONNECTION_CLOSED_MESSAGE)})),
        'send-trust-frame': (trustFrame) => sendTrustFrame(trustFrame.token),
        'schedule-uptime': (uptime) =>
          FiberHandle.run(uptimeTimer, after(MIN_UPTIME, {type: 'uptime-reached', attempt: uptime.attempt}), {
            startImmediately: true,
          }).pipe(Effect.asVoid),
        publish: (published) => PubSub.publish(signals, published.signal).pipe(Effect.asVoid),
        'ask-trust': () => Effect.forkIn(requestTrust(false), lifetime).pipe(Effect.asVoid),
        'store-token': (stored) => storeToken(key, stored.token),
        'forget-token': (forgotten) => forgetToken(key, forgotten.token),
      }),
    )

  const listen = (handle: (signal: ConnectionSignal) => void): (() => void) => {
    const scope = Scope.makeUnsafe()
    runNow(
      Scope.provide(
        PubSub.subscribe(signals).pipe(
          Effect.flatMap((subscription) =>
            Stream.fromSubscription(subscription).pipe(
              Stream.runForEach((signal) =>
                Effect.try({try: () => handle(signal), catch: (error) => error}).pipe(
                  Effect.catch((error) => Effect.logError('[conciv] a connection listener failed', error)),
                ),
              ),
              Effect.forkScoped,
            ),
          ),
        ),
        scope,
      ),
    )
    return () => {
      runDetached(Scope.close(scope, Exit.void))
    }
  }

  const refused = async (error: unknown, credential: string | undefined): Promise<unknown> => {
    if (unauthorized(error)) await run(dispatch({type: 'unauthorized', token: credential}))
    return error
  }

  const now = (): number => runNow(Clock.currentTimeMillis)

  const retriable = (options: ClientRetryPluginAttemptOptions<RpcClientContext>): boolean =>
    !disposed() && options.signal?.aborted !== true && !(options.error instanceof ORPCError)

  const retryDelay = (options: ClientRetryPluginAttemptOptions<RpcClientContext>): Promise<number> => {
    const wait = isStreamingCall(options.path)
      ? reopened(options.signal)
      : Effect.sleep(Duration.millis(timings.connectionLossRetryDelayMs))
    return run(wait.pipe(Effect.as(0)))
  }

  const socketClient: StandardLinkClient<RpcClientContext> = {
    call: async (request) => {
      await run(settled(request.signal))
      request.signal?.throwIfAborted()
      if (current().socket !== 'open') throw engineUnreachable(SOCKET_NOT_OPEN_MESSAGE)
      const response = await peer.request(request)
      return {...response, body: async () => response.body}
    },
  }

  const rpc = new StandardRPCLink<RpcClientContext>(socketClient, {
    url: SOCKET_LINK_URL,
    headers: sessionHeaders,
    interceptors: [
      async (options) => {
        const sent = current().token
        const output = await options.next().catch(async (error: unknown) => {
          throw await refused(error, sent)
        })
        if (!isEventIterator(output)) return output
        return mapEventIterator(output, {
          value: async (value) => value,
          error: async (error) => refused(error, current().token),
        })
      },
    ],
    plugins: [
      new ClientRetryPlugin<RpcClientContext>({
        default: {retry: Number.POSITIVE_INFINITY, retryDelay, shouldRetry: retriable},
      }),
    ],
  })

  const reconnectWhenStalled = (signal: AbortSignal | undefined): void => {
    signal?.addEventListener(
      'abort',
      () => {
        if (stalled(signal.reason)) runDetached(dispatch({type: 'stalled'}))
      },
      {once: true},
    )
  }

  const link: ClientLink<RpcClientContext> = {
    call: (path, input, options) => {
      runDetached(dispatch({type: 'call-started'}))
      if (isStreamingCall(path)) {
        reconnectWhenStalled(options.signal)
        return rpc.call(path, input, options)
      }
      const deadline = now() + timings.callDeadlineMs
      const asked = options.context.shouldRetry
      const callerRetries = async (attempt: ClientRetryPluginAttemptOptions<RpcClientContext>): Promise<boolean> => {
        if (asked === undefined) return now() < deadline && retriable(attempt)
        return typeof asked === 'function' ? asked(attempt) : asked
      }
      const shouldRetry = async (attempt: ClientRetryPluginAttemptOptions<RpcClientContext>): Promise<boolean> =>
        !disposed() && (await callerRetries(attempt))
      return rpc.call(path, input, {...options, context: {...options.context, shouldRetry}})
    },
  }

  const auth = createORPCClient<ContractRouterClient<typeof contract, RpcClientContext>>(link).auth

  const answered = <A>(call: (signal: AbortSignal) => Promise<A>): Effect.Effect<A, unknown> =>
    Effect.tryPromise({try: call, catch: (error) => error}).pipe(Effect.timeout(Duration.millis(timings.authTimeoutMs)))

  const trustAnswer = (token: string): Effect.Effect<boolean, unknown> =>
    answered((signal) => auth.trust({token}, {signal, context: {retry: 0}})).pipe(
      Effect.map(({trusted}) => trusted),
      Effect.catchIf(unauthorized, () => Effect.succeed(false)),
    )

  const settle = (token: string, trusted: boolean): Effect.Effect<boolean> =>
    dispatch(trusted ? {type: 'trusted', token} : {type: 'trust-refused', token}).pipe(Effect.as(trusted))

  const askWithToken = (token: string): Effect.Effect<boolean, unknown> =>
    trustAnswer(token).pipe(Effect.flatMap((trusted) => settle(token, trusted)))

  const askHeldThenSource = (held: string, source: EngineTokenSource, storedOnly: boolean) =>
    Effect.gen(function* () {
      if (yield* trustAnswer(held)) return yield* settle(held, true)
      if (storedOnly) return false
      const sourced = yield* sourcedToken(source)
      if (sourced === undefined) return yield* settle(held, false)
      if (yield* trustAnswer(sourced)) return yield* settle(sourced, true)
      yield* settle(held, false)
      return yield* settle(sourced, false)
    })

  const ask = (storedOnly: boolean): Effect.Effect<boolean> =>
    Effect.gen(function* () {
      const held = current().token ?? (yield* readStoredToken(key)) ?? ''
      const source = yield* Ref.get(tokenSource)
      if (source === undefined) return yield* askWithToken(held)
      return yield* askHeldThenSource(held, source, storedOnly)
    }).pipe(
      Effect.catch((error) =>
        Effect.logError('[conciv] the dev server did not answer the trust check', error).pipe(
          Effect.andThen(dispatch({type: 'trust-unanswered'})),
          Effect.as(false),
        ),
      ),
    )

  const pending = (asked: Effect.Effect<boolean, unknown>): Effect.Effect<Deferred.Deferred<boolean, unknown>> =>
    Effect.gen(function* () {
      const answer = yield* Deferred.make<boolean, unknown>()
      yield* Ref.set(asking, Option.some(answer))
      const clear = Ref.update(asking, (held) => (Option.isSome(held) && held.value === answer ? Option.none() : held))
      yield* asked.pipe(
        Effect.onExit((exit) => Deferred.done(answer, exit)),
        Effect.ensuring(clear),
        Effect.forkIn(lifetime),
      )
      return answer
    })

  const requestTrust = (storedOnly: boolean): Effect.Effect<boolean> =>
    Effect.gen(function* () {
      if (current().trust === 'trusted') return true
      const inFlight = yield* Ref.get(asking)
      const answer = Option.isSome(inFlight) ? inFlight.value : yield* pending(ask(storedOnly))
      return yield* Deferred.await(answer).pipe(Effect.catchCause(() => Effect.succeed(false)))
    })

  const trust: EngineTrust = {
    isTrusted: () => current().trust === 'trusted',
    status: () => current().trust,
    subscribe: (listener) =>
      listen((signal) => {
        if (signal.type === 'status') listener(signal.status, signal.previous)
      }),
    requestTrust: (options = {}) => run(requestTrust(options.storedOnly ?? false)),
    requestTrustWithToken: (token) => run(pending(askWithToken(token)).pipe(Effect.flatMap(Deferred.await))),
    requestTrustWithCode: (code) =>
      run(
        answered((signal) => auth.exchange({code}, {signal})).pipe(
          Effect.tap((result) => ('token' in result ? dispatch({type: 'trusted', token: result.token}) : Effect.void)),
        ),
      ),
    requestAuthCode: (options = {}) =>
      run(answered((signal) => auth.requestCode({reissue: options.reissue ?? false}, {signal})).pipe(Effect.asVoid)),
  }

  yield* Effect.addFinalizer(() => dispatch({type: 'disposed'}))

  const connection: EngineConnection = {
    link,
    trust,
    reset: () => {
      runDetached(dispatch({type: 'reset-requested'}))
    },
    useTokenSource: (source) => runNow(Ref.set(tokenSource, source)),
    subscribeReachability: (listener) =>
      listen((signal) => {
        if (signal.type === 'reachable') listener(signal.reachable)
      }),
  }
  return connection
})
