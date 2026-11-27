import {AsyncIteratorClass, ORPCError, type Router} from '@orpc/server'
import '@orpc/effect/extensions/effect'
import {RPCHandler} from '@orpc/server/websocket'
import {Effect, Queue, type Scope} from 'effect'
import {WebSocketServer, type WebSocket} from 'ws'
import {SIMULATION_ERROR_STATUS} from '@conciv/protocol/simulation'

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
  release: Effect.Effect<void>,
): AsyncIteratorClass<A, undefined> {
  return new AsyncIteratorClass(
    () => nextValue(queue, connection),
    () => Effect.runPromise(release),
  )
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
  readonly router: Router<Context>
  readonly close: (connection: Connection) => Effect.Effect<void>
}

export function start(options: StartOptions): Effect.Effect<Server, Error, Scope.Scope> {
  const handler = new RPCHandler(options.router, {
    interceptors: [oneAtATime()],
    errorStatusMap: SIMULATION_ERROR_STATUS,
  })
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
