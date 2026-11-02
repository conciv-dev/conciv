import {once} from 'node:events'
import type {IncomingMessage} from 'node:http'
import type {Duplex} from 'node:stream'
import {serve, upgradeWebSocket, type Http2Bindings, type HttpBindings, type ServerType} from '@hono/node-server'
import {WebSocketServer} from 'ws'
import {WS_MAX_PAYLOAD_BYTES} from '@conciv/protocol/rpc-types'

export {upgradeWebSocket}
const GRACEFUL_SOCKET_CLOSE_MS = 2_000
const SHUTTING_DOWN_CLOSE_CODE = 1001

export type ServeFetch = (request: Request, env: HttpBindings | Http2Bindings) => Response | Promise<Response>

export type ClaimUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean

export type ServeHonoOptions = {
  fetch: ServeFetch
  claimUpgrade?: ClaimUpgrade
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

function trackClaim(req: IncomingMessage, socket: Duplex, head: Buffer, claim: ClaimUpgrade, sockets: Set<Duplex>) {
  try {
    if (!claim(req, socket, head)) return false
  } catch (error) {
    console.error('conciv: a claimed websocket upgrade failed', error)
    socket.destroy()
    return true
  }
  sockets.add(socket)
  socket.once('close', () => sockets.delete(socket))
  return true
}

function claimUpgrades(server: ServerType, claim: ClaimUpgrade, sockets: Set<Duplex>): void {
  const honoListeners = server.listeners('upgrade')
  server.removeAllListeners('upgrade')
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (trackClaim(req, socket, head, claim, sockets)) return
    honoListeners.forEach((listener) => Reflect.apply(listener, server, [req, socket, head]))
  })
}

function closeServer(
  server: ServerType,
  wss: WebSocketServer,
  claimedSockets: Set<Duplex>,
  gracefulCloseMs: number,
): () => Promise<void> {
  return async () => {
    const stopped = new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    await closeLiveSockets(wss, gracefulCloseMs)
    claimedSockets.forEach((socket) => socket.destroy())
    if ('closeAllConnections' in server) server.closeAllConnections()
    await stopped
  }
}

export async function serveHono(options: ServeHonoOptions): Promise<ServedHono> {
  const requestedPort = options.port ?? 0
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: options.maxPayload ?? WS_MAX_PAYLOAD_BYTES,
  })
  const server = serve({
    fetch: options.fetch,
    port: requestedPort,
    hostname: options.hostname ?? '127.0.0.1',
    websocket: {server: wss},
    overrideGlobalObjects: false,
  })
  const claimedSockets = new Set<Duplex>()
  if (options.claimUpgrade) claimUpgrades(server, options.claimUpgrade, claimedSockets)
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
    close: closeServer(server, wss, claimedSockets, options.gracefulCloseMs ?? GRACEFUL_SOCKET_CLOSE_MS),
  }
}
