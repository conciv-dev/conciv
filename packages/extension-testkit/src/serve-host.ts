import {createServer, type Server} from 'node:http'
import {listenLocal} from './listen-local.js'

export async function serveHost(html: (url: URL) => string): Promise<{base: string; close: () => Promise<void>}> {
  const server: Server = createServer((req, res) => {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
    res.end(html(new URL(req.url ?? '/', 'http://127.0.0.1')))
  })
  const {base, close} = await listenLocal(server)
  return {
    base,
    close: async () => {
      try {
        await close()
      } catch (error) {
        console.error('[extension-testkit] host close failed:', error)
      }
    },
  }
}
