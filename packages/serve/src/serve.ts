import {once} from 'node:events'
import {serve, upgradeWebSocket, type Http2Bindings, type HttpBindings, type ServerType} from '@hono/node-server'
import {WebSocketServer} from 'ws'

export {upgradeWebSocket}

export const DEFAULT_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024
const GRACEFUL_SOCKET_CLOSE_MS = 2_000
const SHUTTING_DOWN_CLOSE_CODE = 1001

export type ServeFetch = (request: Request, env: HttpBindings | Http2Bindings) => Response | Promise<Response>

export type ServeHonoOptions = {
  fetch: ServeFetch
  port?: number
  hostname?: string
  maxPayload?: number
  gracefulCloseMs?: number
}

export type ServedHono = {
  server: ServerType
  wss: WebSocketServer
  port: number
  close: () => Promise<void>
}

function boundPort(server: ServerType, fallback: number): number {
  const address = server.address()
  return typeof address === 'object' && address !== null ? address.port : fallback
}

async function closeLiveSockets(wss: WebSocketServer, timeoutMs: number): Promise<void> {
  const deadline = AbortSignal.timeout(timeoutMs)
  while (wss.clients.size > 0 && !deadline.aborted) {
    const sockets = [...wss.clients]
    sockets.forEach((socket) => socket.close(SHUTTING_DOWN_CLOSE_CODE, 'server shutting down'))
    const settled = await Promise.allSettled(sockets.map((socket) => once(socket, 'close', {signal: deadline})))
    if (settled.some((outcome) => outcome.status === 'rejected')) sockets.forEach((socket) => socket.terminate())
  }
  wss.clients.forEach((socket) => socket.terminate())
}

function closeServer(server: ServerType, wss: WebSocketServer, gracefulCloseMs: number): () => Promise<void> {
  return async () => {
    const stopped = new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    await closeLiveSockets(wss, gracefulCloseMs)
    if ('closeAllConnections' in server) server.closeAllConnections()
    await stopped
  }
}

export async function serveHono(options: ServeHonoOptions): Promise<ServedHono> {
  const requestedPort = options.port ?? 0
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxPayload ?? DEFAULT_MAX_PAYLOAD_BYTES,
  })
  const server = serve({
    fetch: options.fetch,
    port: requestedPort,
    hostname: options.hostname ?? '127.0.0.1',
    websocket: {server: wss},
    overrideGlobalObjects: false,
  })
  await new Promise<void>((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    server.once('listening', onListening)
    server.once('error', onError)
  })
  return {
    server,
    wss,
    port: boundPort(server, requestedPort),
    close: closeServer(server, wss, options.gracefulCloseMs ?? GRACEFUL_SOCKET_CLOSE_MS),
  }
}
