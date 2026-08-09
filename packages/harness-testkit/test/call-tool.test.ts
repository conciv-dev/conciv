import {createServer} from 'node:http'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {expect, it} from 'vitest'
import {z} from 'zod'
import {getHarness} from '@conciv/harness'
import {harnessAvailable} from '../src/harness-available.js'
import {makeCallTool, makeRunTypescript} from '../src/call-tool.js'

it('harnessAvailable returns a boolean for any adapter', () => {
  const claude = getHarness('claude')
  if (!claude) throw new Error('claude adapter not registered')
  expect(typeof harnessAvailable(claude)).toBe('boolean')
})

it('makeCallTool returns a caller', () => {
  expect(typeof makeCallTool('http://127.0.0.1:0', 's')).toBe('function')
})

const JsonRpcCallSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.object({protocolVersion: z.string().optional()}).loose().optional(),
})

const EXECUTE_TOOL = {
  name: 'execute_typescript',
  description: 'runs typescript in the sandbox',
  inputSchema: {type: 'object', properties: {typescriptCode: {type: 'string'}}, required: ['typescriptCode']},
}

function hangMessage(method: string): string {
  return `the fake MCP server hung ${method} past the deadline`
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

function sendJson(response: ServerResponse, payload: unknown): void {
  response.writeHead(200, {'content-type': 'application/json'})
  response.end(JSON.stringify(payload))
}

function resultFor(method: string, protocolVersion: string): unknown {
  if (method === 'initialize') {
    return {protocolVersion, capabilities: {tools: {}}, serverInfo: {name: 'stalling-mcp', version: '0.0.0'}}
  }
  if (method === 'tools/list') return {tools: [EXECUTE_TOOL]}
  return {}
}

type StalledOutcome = 'error' | 'success'

async function answer(
  request: IncomingMessage,
  response: ServerResponse,
  hung: string,
  stallMs: number,
  outcome: StalledOutcome,
): Promise<void> {
  if (request.method !== 'POST') {
    response.writeHead(405)
    response.end()
    return
  }
  const call = JsonRpcCallSchema.safeParse(JSON.parse(await readBody(request)))
  if (!call.success || call.data.id === undefined) {
    response.writeHead(202)
    response.end()
    return
  }
  const {id, method, params} = call.data
  if (method === hung) {
    await new Promise((resolve) => setTimeout(resolve, stallMs))
    if (outcome === 'error') {
      sendJson(response, {jsonrpc: '2.0', id, error: {code: -32000, message: hangMessage(method)}})
      return
    }
  }
  sendJson(response, {jsonrpc: '2.0', id, result: resultFor(method, params?.protocolVersion ?? '2025-06-18')})
}

function startMcpServerHanging(
  hung: string,
  stallMs: number,
  outcome: StalledOutcome = 'error',
): Promise<{apiBase: string; stop: () => Promise<void>}> {
  const server = createServer((request, response) => {
    answer(request, response, hung, stallMs, outcome).catch(() => {
      response.writeHead(500)
      response.end()
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('server did not bind a port'))
        return
      }
      resolve({
        apiBase: `http://127.0.0.1:${address.port}`,
        stop: () => new Promise<void>((done) => server.close(() => done())),
      })
    })
  })
}

async function failureOf(apiBase: string): Promise<unknown> {
  const runTypescript = makeRunTypescript(apiBase, 'session', {deadlineMs: 150, label: 'stage_probe'})
  return runTypescript('return 1').then(
    () => new Error('runTypescript resolved instead of failing'),
    (error: unknown) => error,
  )
}

it('a tools/list failure past the deadline is not reported as the execute stage', async () => {
  const server = await startMcpServerHanging('tools/list', 400)
  try {
    const failure = await failureOf(server.apiBase)
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).not.toContain('waiting on the MCP execute')
    expect(String(failure)).toContain(hangMessage('tools/list'))
  } finally {
    await server.stop()
  }
}, 10_000)

it('a tools/list that succeeds past the deadline is not reported as the execute stage', async () => {
  const server = await startMcpServerHanging('tools/list', 400, 'success')
  try {
    const failure = await failureOf(server.apiBase)
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).not.toContain('waiting on the MCP execute')
    expect(String(failure)).toContain('tools/list')
  } finally {
    await server.stop()
  }
}, 10_000)

it('an execute that outlives the deadline is reported as the execute stage', async () => {
  const server = await startMcpServerHanging('tools/call', 2_000)
  try {
    const failure = await failureOf(server.apiBase)
    expect(String(failure)).toContain('runTypescript(stage_probe) exceeded 150ms waiting on the MCP execute')
  } finally {
    await server.stop()
  }
}, 10_000)
