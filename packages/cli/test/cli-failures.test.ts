import {createServer, type Server} from 'node:http'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {z} from 'zod'
import {main} from '../src/bin.js'
import {runCli} from '../src/run.js'
import {captureStdout, onlyDocument} from './support/stdout.js'

const written: string[] = []
const servers: Server[] = []

const FailureSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    kind: z.enum(['user', 'unexpected']),
    message: z.string(),
    hint: z.string().optional(),
    code: z.string().optional(),
    stack: z.string().optional(),
  }),
})

beforeEach(() => {
  captureStdout(written)
})

afterEach(async () => {
  vi.restoreAllMocks()
  delete process.env.CONCIV_PORT
  for (const server of servers.splice(0)) await new Promise((done) => server.close(() => done(null)))
})

function failure(): z.infer<typeof FailureSchema>['error'] {
  return FailureSchema.parse(onlyDocument(written)).error
}

async function listen(handler: Parameters<typeof createServer>[1]): Promise<number> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(null)))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port')
  return address.port
}

async function closedPort(): Promise<number> {
  const port = await listen((_request, response) => response.end('unused'))
  const server = servers.pop()
  if (server) await new Promise((done) => server.close(() => done(null)))
  return port
}

describe('conciv CLI failure reporting', () => {
  it('names the address and the fix when no dev server is listening, with no stack', async () => {
    process.env.CONCIV_PORT = String(await closedPort())
    const code = await runCli(main, ['tools', 'server', 'urls'])
    expect(code).toBe(1)
    const error = failure()
    expect(error.kind).toBe('user')
    expect(error.message).toContain(`127.0.0.1:${process.env.CONCIV_PORT}`)
    expect(error.message).toContain('No conciv dev server')
    expect(error.hint).toContain('CONCIV_PORT')
    expect(error.stack).toBeUndefined()
    expect(JSON.stringify(error)).not.toContain('fetch failed')
  })

  it('reports an alien server on the port as a probable bug, with the stack', async () => {
    process.env.CONCIV_PORT = String(await listen((_request, response) => response.end('not a rpc reply')))
    const code = await runCli(main, ['tools', 'server', 'urls'])
    expect(code).toBe(1)
    const error = failure()
    expect(error.kind).toBe('unexpected')
    expect(error.hint).toContain('bug')
    expect(error.stack).toContain('at ')
  })
})
