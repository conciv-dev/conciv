import {serve} from '@hono/node-server'
import {WebSocketServer} from 'ws'

export type ServedApp = {
  base: string
  wsBase: string
  close: () => Promise<void>
}

export async function serveApp(fetch: (request: Request) => Response | Promise<Response>): Promise<ServedApp> {
  const wss = new WebSocketServer({noServer: true})
  const server = serve({fetch, port: 0, hostname: '127.0.0.1', websocket: {server: wss}, overrideGlobalObjects: false})
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const base = `http://127.0.0.1:${port}`
  return {
    base,
    wsBase: base.replace('http', 'ws'),
    close: async () => {
      if ('closeAllConnections' in server) server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
    },
  }
}
