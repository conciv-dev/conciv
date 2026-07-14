import {serve, type ServerType} from '@hono/node-server'
import {WebSocketServer} from 'ws'

export type ServeHonoOptions = {
  fetch: (request: Request) => Response | Promise<Response>
  port?: number
  hostname?: string
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

function closeServer(server: ServerType): () => Promise<void> {
  return async () => {
    if ('closeAllConnections' in server) server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

export async function serveHono(options: ServeHonoOptions): Promise<ServedHono> {
  const requestedPort = options.port ?? 0
  const wss = new WebSocketServer({noServer: true})
  const server = serve({
    fetch: options.fetch,
    port: requestedPort,
    hostname: options.hostname ?? '127.0.0.1',
    websocket: {server: wss},
    overrideGlobalObjects: false,
  })
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  return {server, wss, port: boundPort(server, requestedPort), close: closeServer(server)}
}
