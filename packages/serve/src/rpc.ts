import {ServerResponse} from 'node:http'
import {AsyncIteratorClass, ORPCError, type AnyRouter} from '@orpc/server'
import {RPCHandler} from '@orpc/server/fetch'
import {RPCHandler as WebsocketRPCHandler, type MinimalWebsocket} from '@orpc/server/websocket'
import type {Context, MiddlewareHandler} from 'hono'
import type {WSContext, WSEvents, WSMessageReceive} from 'hono/ws'
import type {StandardRPCHandlerOptions} from '@orpc/server/standard'
import {valid} from 'semver'
import {z} from 'zod'
import {SOCKET_TRUST_FRAME, SocketTrustFrameSchema} from '@conciv/contract'
import {CONCIV_VERSION_HEADER, type RpcContext, type RpcHeaders, type RpcSocketTrust} from '@conciv/protocol/rpc-types'

const ADAPTER_REFUSED_STATUS = 500

const SOCKET_OPEN = 1

const REVOKED_MESSAGE = 'this browser is no longer trusted'

const MAX_UNSENT_BYTES = 8 * 1024 * 1024

const SLOW_CONSUMER_MESSAGE = 'the reader fell too far behind the stream'

const UnsentBytesSchema = z.object({bufferedAmount: z.number()})

export const RPC_PREFIX = '/rpc'

const ClientVersionSchema = z
  .string()
  .max(64)
  .refine((value) => valid(value) === value.split('+')[0])
  .optional()
  .catch(undefined)

const TRUST_FRAME_PREFIX = JSON.stringify({type: SOCKET_TRUST_FRAME}).slice(0, -1)

export type UpgradeWebSocket = (createEvents: (c: Context) => WSEvents) => MiddlewareHandler

export type RpcSocketGate = {
  trust: RpcSocketTrust
  open: (socket: Pick<WSContext<unknown>, 'close'>) => void
  present: (token: string) => void
  close: () => void
}

function rpcConnectionContext(requestUrl: string, callerOrigin: string | null, headers: RpcHeaders = {}): RpcContext {
  return {origin: new URL(requestUrl).origin, callerOrigin, headers}
}

type SocketStreams = {revoked: AbortSignal; replies: Set<Promise<boolean>>; unsent: () => number}

function isEventIterator(value: unknown): value is AsyncIteratorObject<unknown, unknown, void> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value
}

function slowConsumer(): ORPCError<'SLOW_CONSUMER', {capacity: number}> {
  return new ORPCError('SLOW_CONSUMER', {message: SLOW_CONSUMER_MESSAGE, data: {capacity: MAX_UNSENT_BYTES}})
}

function guardedStream(
  stream: AsyncIteratorObject<unknown, unknown, void>,
  streams: SocketStreams,
): AsyncIteratorClass<unknown, unknown> {
  const {revoked} = streams
  const refused = Promise.withResolvers<never>()
  refused.promise.catch(() => undefined)
  const refuse = (): void => refused.reject(revoked.reason)
  revoked.addEventListener('abort', refuse, {once: true})
  if (revoked.aborted) refuse()
  return new AsyncIteratorClass(
    () =>
      streams.unsent() > MAX_UNSENT_BYTES
        ? Promise.reject(slowConsumer())
        : Promise.race([stream.next(), refused.promise]),
    async () => {
      revoked.removeEventListener('abort', refuse)
      void stream.return?.()?.catch(() => undefined)
    },
  )
}

function heldUntilReplied(streams: SocketStreams, replied: Promise<boolean> | undefined): void {
  if (replied === undefined) return
  streams.replies.add(replied)
  void replied.finally(() => streams.replies.delete(replied))
}

function rpcHandlerOptions(streams?: SocketStreams): StandardRPCHandlerOptions<RpcContext> {
  return {
    rootInterceptors: [
      (options) =>
        options.next({
          ...options,
          context: {
            ...options.context,
            headers: {...options.context.headers, ...options.request.headers},
            clientVersion: readClientVersion(options.request.headers),
          },
        }),
    ],
    clientInterceptors: [
      (options) => {
        if (options.context.socket?.allows(options.path) === false) {
          throw new ORPCError('UNAUTHORIZED', {message: 'this connection is not trusted'})
        }
        return options.next()
      },
      async (options) => {
        const output = await options.next()
        if (streams === undefined || !isEventIterator(output)) return output
        heldUntilReplied(streams, options.context.replied)
        return guardedStream(output, streams)
      },
    ],
  }
}

function readClientVersion(headers: RpcHeaders): string | undefined {
  const value = headers[CONCIV_VERSION_HEADER]
  return ClientVersionSchema.parse(Array.isArray(value) ? value[0] : value)
}

export function rpcFetchMiddleware(router: AnyRouter): MiddlewareHandler {
  const handler = new RPCHandler<RpcContext>(router, rpcHandlerOptions())
  return async (c, next) => {
    const {matched, response} = await handler.handle(c.req.raw, {
      prefix: RPC_PREFIX,
      context: {
        ...rpcConnectionContext(c.req.url, c.req.header('origin') ?? null),
        replied: responseWritten(c.env?.outgoing),
      },
    })
    if (matched && response) return c.newResponse(response.body, response)
    await next()
  }
}

function responseWritten(outgoing: unknown): Promise<boolean> | undefined {
  if (!(outgoing instanceof ServerResponse)) return undefined
  if (outgoing.closed) return Promise.resolve(outgoing.writableFinished)
  return new Promise((resolve) => outgoing.once('close', () => resolve(outgoing.writableFinished)))
}

function peerFrame(data: WSMessageReceive): string | ArrayBuffer | null {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return data
  return null
}

function trustFrameToken(frame: string | ArrayBuffer): string | null {
  if (typeof frame !== 'string' || !frame.startsWith(TRUST_FRAME_PREFIX)) return null
  const parsed = SocketTrustFrameSchema.safeParse(parsedJson(frame))
  return parsed.success ? parsed.data.token : null
}

function parsedJson(frame: string): unknown {
  try {
    return JSON.parse(frame)
  } catch {
    return null
  }
}

function upgradeHeaders(c: Context): RpcHeaders {
  return {'user-agent': c.req.header('user-agent')}
}

function unsentBytes(socket: WSContext<unknown> | null): number {
  const raw = UnsentBytesSchema.safeParse(socket?.raw)
  return raw.success ? raw.data.bufferedAmount : 0
}

function peerSocket(held: {socket: WSContext<unknown> | null}): MinimalWebsocket {
  return {
    addEventListener: () => {},
    send: (data: string | ArrayBuffer) => held.socket?.send(data),
  }
}

function splitAdapterError(): Error {
  return new Error(
    'the rpc websocket upgrade was refused by the hono node-server adapter: the upgradeWebSocket passed to rpcWebsocketRoute comes from a different @hono/node-server module instance than the running server. Import it from @conciv/serve so both come from one instance.',
  )
}

export function rpcWebsocketRoute(
  router: AnyRouter,
  options: {
    upgrade: UpgradeWebSocket
    onError?: (message: string) => void
    gate?: (c: Context) => RpcSocketGate
  },
): MiddlewareHandler {
  const route = options.upgrade((c) => {
    const revocation = new AbortController()
    const held: {socket: WSContext<unknown> | null} = {socket: null}
    const streams: SocketStreams = {
      revoked: revocation.signal,
      replies: new Set(),
      unsent: () => unsentBytes(held.socket),
    }
    const handler = new WebsocketRPCHandler<RpcContext>(router, rpcHandlerOptions(streams))
    const gate = options.gate?.(c)
    const connection = rpcConnectionContext(c.req.url, c.req.header('origin') ?? null, upgradeHeaders(c))
    const context = gate === undefined ? connection : {...connection, socket: gate.trust}
    const peer = peerSocket(held)
    return {
      onOpen: (_event, ws) => {
        held.socket = ws
        gate?.open({
          close: (code, reason) => {
            revocation.abort(new ORPCError('UNAUTHORIZED', {message: REVOKED_MESSAGE}))
            void Promise.allSettled(streams.replies).then(() => ws.close(code, reason))
          },
        })
      },
      onMessage: (event, ws) => {
        held.socket = ws
        const frame = peerFrame(event.data)
        if (frame === null) return
        const token = trustFrameToken(frame)
        if (token !== null) {
          gate?.present(token)
          return
        }
        const replying = Promise.withResolvers<boolean>()
        handler.message(peer, frame, {context: {...context, replied: replying.promise}}).then(
          () => replying.resolve(ws.readyState === SOCKET_OPEN),
          (error: unknown) => {
            replying.resolve(false)
            options.onError?.(`rpc ws frame rejected: ${String(error)}`)
            handler.close(peer)
            ws.close(1011, 'rpc frame rejected')
          },
        )
      },
      onClose: () => {
        gate?.close()
        handler.close(peer)
      },
    }
  })
  return async (c, next) => {
    const adapted = {handled: false}
    const response = await route(c, async () => {
      adapted.handled = true
      await next()
    })
    const upgrading = c.req.header('upgrade')?.toLowerCase() === 'websocket'
    const refused = response instanceof Response && response.status === ADAPTER_REFUSED_STATUS
    if (adapted.handled || !upgrading || !refused) return response
    const failure = splitAdapterError()
    options.onError?.(failure.message)
    throw failure
  }
}
