import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import {createServer, type Server} from 'node:http'
import {runCommand} from 'citty'
import {toolsCommand} from '../src/tools.js'
import {uiCommand} from '../src/ui.js'

// Real end-to-end IT for the CLI: the actual citty commands parse argv, zod validates, the
// builders produce a request, and native fetch sends it to a REAL http server that records
// what arrived. No mocks — proves the full argv → zod → fetch → /api/* wire.

type Captured = {method: string; url: string; body: unknown}
const state = {server: undefined as Server | undefined, last: undefined as Captured | undefined}

beforeAll(async () => {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      state.last = {method: req.method ?? '', url: req.url ?? '', body: raw ? JSON.parse(raw) : undefined}
      res.setHeader('content-type', 'application/json')
      res.end('{"ok":true}')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  process.env.CONCIV_PORT = String(typeof addr === 'object' && addr ? addr.port : 0)
  state.server = server
})

afterAll(async () => {
  await new Promise<void>((r) => (state.server ? state.server.close(() => r()) : r()))
  delete process.env.CONCIV_PORT
})

describe('conciv CLI (IT, real server)', () => {
  it('tools server graph → GET /api/server/graph with the file in the query string', async () => {
    await runCommand(toolsCommand, {rawArgs: ['server', 'graph', '/x.ts']})
    expect(state.last).toMatchObject({method: 'GET', url: '/api/server/graph?file=%2Fx.ts'})
  })

  it('tools page fill → POST /api/page/fill with selector + value in the body', async () => {
    await runCommand(toolsCommand, {rawArgs: ['page', 'fill', '#email', '--value', 'a@b.c']})
    expect(state.last).toMatchObject({
      method: 'POST',
      url: '/api/page/fill',
      body: {selector: '#email', value: 'a@b.c'},
    })
  })

  it('tools page wait → rejects an invalid --state via zod before sending', async () => {
    state.last = undefined
    await expect(runCommand(toolsCommand, {rawArgs: ['page', 'wait', '#x', '--state', 'bogus']})).rejects.toThrow()
    expect(state.last).toBeUndefined()
  })

  it('tools page locate → GET /api/page/locate with the selector', async () => {
    await runCommand(toolsCommand, {rawArgs: ['page', 'locate', 'h1']})
    expect(state.last).toMatchObject({method: 'GET', url: '/api/page/locate?selector=h1'})
  })

  it('tools page inspect → GET /api/page/inspect with --ref', async () => {
    await runCommand(toolsCommand, {rawArgs: ['page', 'inspect', '--ref', 'v3']})
    expect(state.last).toMatchObject({method: 'GET', url: '/api/page/inspect?ref=v3'})
  })

  it('tools page tree → GET /api/page/tree with the root selector', async () => {
    await runCommand(toolsCommand, {rawArgs: ['page', 'tree', 'main']})
    expect(state.last).toMatchObject({method: 'GET', url: '/api/page/tree?selector=main'})
  })

  it('tools page find → GET /api/page/find with --name', async () => {
    await runCommand(toolsCommand, {rawArgs: ['page', 'find', '--name', 'LoginForm']})
    expect(state.last).toMatchObject({method: 'GET', url: '/api/page/find?name=LoginForm'})
  })

  it('ui confirm → POST a confirm spec to /api/chat/ui', async () => {
    await runCommand(uiCommand, {rawArgs: ['confirm', '--question', 'OK?']})
    expect(state.last?.method).toBe('POST')
    expect(state.last?.url).toBe('/api/chat/ui')
    expect(state.last?.body).toMatchObject({spec: {kind: 'confirm', question: 'OK?'}})
  })
})
