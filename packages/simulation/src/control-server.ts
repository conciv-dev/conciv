import {AsyncIteratorClass, ORPCError, type Router} from '@orpc/server'
import {RPCHandler} from '@orpc/server/ws'
import {Effect, Queue, type Scope} from 'effect'
import {WebSocketServer, type WebSocket} from 'ws'
import {
  PROTOCOL_VERSION,
  type EndpointRole,
  type HandshakeParams,
  type HandshakeResponse,
  type Identity,
} from '@conciv/protocol/simulation'

const MAX_OUTBOUND_BYTES = 64 * 1024 * 1024

const MAX_WAITING_MESSAGES = 256

const QUEUE_FULL = 'Simulation control queue is full'

export type Server = {readonly url: string}

export type Connection = {readonly socket: WebSocket}

export function isClosed(connection: Connection): boolean {
  return connection.socket.readyState !== connection.socket.OPEN
}

export type Context = {readonly connection: Connection}

function withinOutboundLimit(socket: WebSocket, value: unknown): boolean {
  const bytes = Buffer.byteLength(JSON.stringify(value))
  return bytes <= MAX_OUTBOUND_BYTES && socket.bufferedAmount + bytes <= MAX_OUTBOUND_BYTES
}

function nextValue<A>(queue: Queue.Dequeue<A>, connection: Connection): Promise<IteratorResult<A, undefined>> {
  const ended: IteratorResult<A, undefined> = {done: true, value: undefined}
  return Effect.runPromise(
    Queue.take(queue).pipe(
      Effect.map((value): IteratorResult<A, undefined> => {
        if (withinOutboundLimit(connection.socket, value)) return {done: false, value}
        connection.socket.terminate()
        return ended
      }),
      Effect.catchCause(() => Effect.succeed(ended)),
    ),
  )
}

export function notifications<A>(
  queue: Queue.Dequeue<A>,
  connection: Connection,
  cleanup: () => Promise<void>,
): AsyncIteratorClass<A, undefined> {
  return new AsyncIteratorClass(() => nextValue(queue, connection), cleanup)
}

type RoleMismatch = {
  readonly code: 'ROLE_MISMATCH'
  readonly message: string
  readonly data: {expected: EndpointRole; actual: EndpointRole}
}

type UnsupportedProtocol = {
  readonly code: 'UNSUPPORTED_PROTOCOL'
  readonly message: string
  readonly data: {offered: number[]; supported: number[]}
}

type MissingCapability = {
  readonly code: 'MISSING_CAPABILITY'
  readonly message: string
  readonly data: {missing: string[]}
}

export type HandshakeRefusal = RoleMismatch | UnsupportedProtocol | MissingCapability

export type HandshakeOutcome =
  | {readonly type: 'accepted'; readonly response: HandshakeResponse}
  | {readonly type: 'refused'; readonly refusal: HandshakeRefusal}

export type HandshakeAction = {
  readonly role: EndpointRole
  readonly server: Identity
  readonly capabilities: readonly string[]
}

export function dispatchHandshake(action: HandshakeAction, params: HandshakeParams): HandshakeOutcome {
  if (params.expectedRole !== action.role) {
    const message = `Expected simulation endpoint role ${params.expectedRole}, received ${action.role}`
    const data = {expected: params.expectedRole, actual: action.role}
    return {type: 'refused', refusal: {code: 'ROLE_MISMATCH', message, data}}
  }
  if (!params.offeredVersions.includes(PROTOCOL_VERSION)) {
    const message = 'No mutually supported simulation protocol version'
    const data = {offered: [...params.offeredVersions], supported: [PROTOCOL_VERSION]}
    return {type: 'refused', refusal: {code: 'UNSUPPORTED_PROTOCOL', message, data}}
  }
  const installed = new Set(action.capabilities)
  const missing = params.requiredCapabilities.filter((capability) => !installed.has(capability))
  if (missing.length > 0) {
    const message = `Simulation endpoint is missing required capabilities: ${missing.join(', ')}`
    return {type: 'refused', refusal: {code: 'MISSING_CAPABILITY', message, data: {missing}}}
  }
  const capabilities = [...installed]
  return {
    type: 'accepted',
    response: {protocolVersion: PROTOCOL_VERSION, role: action.role, server: action.server, capabilities},
  }
}

function oneAtATime() {
  const state = {waiting: 0, tail: Promise.resolve()}
  return <A>({next}: {next: () => Promise<A>}): Promise<A> => {
    if (state.waiting >= MAX_WAITING_MESSAGES) return Promise.reject(new ORPCError('QUEUE_FULL', {message: QUEUE_FULL}))
    state.waiting += 1
    const run = state.tail.then(() => {
      state.waiting -= 1
      return next()
    })
    state.tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

function listen(endpoint: URL): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({host: endpoint.hostname, port: Number(endpoint.port)})
    server.once('listening', () => {
      server.off('error', reject)
      resolve(server)
    })
    server.once('error', reject)
  })
}

function closeAll(server: WebSocketServer, cleanups: ReadonlySet<Promise<void>>): Promise<void> {
  server.clients.forEach((socket) => socket.terminate())
  const closed = new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  return Promise.all([closed, ...cleanups]).then(() => undefined)
}

export type StartOptions = {
  readonly endpoint: URL
  readonly label: string
  readonly router: Router<Record<never, never>, Context>
  readonly close: (connection: Connection) => Effect.Effect<void>
}

export function start(options: StartOptions): Effect.Effect<Server, Error, Scope.Scope> {
  const handler = new RPCHandler(options.router, {interceptors: [oneAtATime()]})
  const cleanups = new Set<Promise<void>>()
  const accept = (socket: WebSocket): void => {
    const connection: Connection = {socket}
    socket.once('close', () => {
      const cleanup = Effect.runPromise(options.close(connection)).finally(() => cleanups.delete(cleanup))
      cleanups.add(cleanup)
    })
    void handler.upgrade(socket, {context: {connection}})
  }
  return Effect.acquireRelease(
    Effect.tryPromise({
      try: () => listen(options.endpoint),
      catch: (cause) => new Error(`${options.label} could not listen on ${options.endpoint.href}`, {cause}),
    }),
    (server) =>
      Effect.tryPromise(() => closeAll(server, cleanups)).pipe(
        Effect.catch((error) => Effect.logWarning(`${options.label} did not close cleanly`, error)),
      ),
  ).pipe(
    Effect.tap((server) => Effect.sync(() => server.on('connection', accept))),
    Effect.map(() => ({url: `${options.endpoint.protocol}//${options.endpoint.host}`})),
  )
}
