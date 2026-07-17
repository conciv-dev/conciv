import {createServer} from 'node:http'
import {afterAll, describe, expect, it} from 'vitest'
import {probeCore} from '../src/shared/probe.js'

const servers: Array<() => void> = []
afterAll(() => servers.forEach((close) => close()))

function serveHealth(port: number, token: string): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      if (request.url === `/t/${token}/health`) {
        response.writeHead(200)
        response.end('ok')
        return
      }
      response.writeHead(404)
      response.end()
    })
    servers.push(() => server.close())
    server.listen(port, '127.0.0.1', () => resolve())
  })
}

describe('probeCore', () => {
  it('finds a token-gated core on any candidate port', async () => {
    await serveHealth(45911, 'tok-p')
    expect(await probeCore('tok-p', [45910, 45911])).toBe('http://127.0.0.1:45911/t/tok-p')
  })
  it('resolves null when nothing answers', async () => {
    expect(await probeCore('tok-none', [45907])).toBe(null)
  })
})
