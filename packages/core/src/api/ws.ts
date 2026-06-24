import type {H3} from 'h3'
import type {Server} from 'srvx'
import type {Hooks} from 'crossws'
import nodeWebSocketAdapter from 'crossws/adapters/node'

declare global {
  interface Response {
    crossws?: Partial<Hooks>
  }
}

export function attachWebSocket(server: Server, app: H3, originAllowed: (origin: string | null) => boolean): void {
  const adapter = nodeWebSocketAdapter({
    resolve: async (request) => (await app.fetch(request)).crossws ?? {},
    hooks: {
      upgrade: (request) => {
        if (originAllowed(request.headers.get('origin'))) return
        throw new Response('forbidden origin', {status: 403})
      },
    },
  })
  server.node?.server?.on('upgrade', (request, socket, head) => adapter.handleUpgrade(request, socket, head))
}
