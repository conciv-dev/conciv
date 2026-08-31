import {createServer, type Server} from 'node:http'
import {afterAll, beforeAll, expect, it} from 'vitest'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {closeBrowserRpcConnection, dynamicBrowserRpcLink} from '../src/browser-transport.js'

const seen: (string | null)[] = []

let server: Server
let base = ''

function listening(instance: Server): Promise<number> {
  return new Promise((resolve) => {
    instance.listen(0, '127.0.0.1', () => {
      const address = instance.address()
      resolve(typeof address === 'object' && address !== null ? address.port : 0)
    })
  })
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const header = request.headers[CONCIV_SESSION_HEADER]
    seen.push(typeof header === 'string' ? header : null)
    request.resume()
    request.on('end', () => {
      response.writeHead(200, {'content-type': 'application/json'})
      response.end(JSON.stringify({json: {ok: true}, meta: []}))
    })
  })
  const port = await listening(server)
  base = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  closeBrowserRpcConnection(base)
  await new Promise((resolve) => server.close(resolve))
})

it('each client on one api base sends its own session identity, and a session-less client sends none', async () => {
  const first = dynamicBrowserRpcLink(
    () => base,
    () => 'conciv_first',
  )
  const second = dynamicBrowserRpcLink(
    () => base,
    () => 'conciv_second',
  )
  const anonymous = dynamicBrowserRpcLink(() => base)

  await first.call(['probe'], {}, {context: {}})
  await second.call(['probe'], {}, {context: {}})
  await anonymous.call(['probe'], {}, {context: {}})
  await first.call(['probe'], {}, {context: {}})

  expect(seen).toEqual(['conciv_first', 'conciv_second', null, 'conciv_first'])
}, 15_000)
