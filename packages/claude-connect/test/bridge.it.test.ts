import {spawn} from 'node:child_process'
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs'
import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {createInterface} from 'node:readline'
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {CONCIV_CLAUDE_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {CLAUDE_CONNECT_BRIDGE_TIMEOUT_VAR, claudeConnectBridgeSource} from '../src/bridge.js'
import {claudeConnectEndpointFile} from '../src/endpoint.js'

const CLAUDE_SESSION = 'sess-1'

const FrameSchema = z.record(z.string(), z.unknown())

const CallSchema = z.object({id: z.number()})

const ErrorFrameSchema = z.object({error: z.object({message: z.string()})})

type Recorded = {body: string; session: string | null}

type Served = {server: Server; url: string; recorded: Recorded[]}

type BridgeRun = {cwd: string; input: string[]; expected: number; timeoutMs?: number}

type Waiter = {count: number; resolve: (lines: string[]) => void}

const scratch = {dir: '', bridge: ''}
const running: Server[] = []
const projects: string[] = []

function bodyOf(incoming: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    incoming.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    incoming.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

function sessionOf(incoming: IncomingMessage): string | null {
  const value = incoming.headers[CONCIV_CLAUDE_SESSION_HEADER]
  return typeof value === 'string' ? value : null
}

function addressOf(server: Server): string {
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('server is not listening on a port')
  return `http://127.0.0.1:${address.port}/api/mcp`
}

function stopServer(server: Server): Promise<void> {
  server.closeAllConnections()
  return new Promise((resolve) => server.close(() => resolve()))
}

async function serve(respond: (recorded: Recorded, response: ServerResponse) => void): Promise<Served> {
  const recorded: Recorded[] = []
  const server = createServer((incoming, response) => {
    void bodyOf(incoming).then((body) => {
      const entry = {body, session: sessionOf(incoming)}
      recorded.push(entry)
      respond(entry, response)
    })
  })
  running.push(server)
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  return {server, url: addressOf(server), recorded}
}

async function closedServerUrl(): Promise<string> {
  const server = createServer(() => {})
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const url = addressOf(server)
  await stopServer(server)
  return url
}

function makeProject(name: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `conciv-project-${name}-`)))
  projects.push(dir)
  return dir
}

function pointProjectAt(dir: string, mcpUrl: string): void {
  const file = claudeConnectEndpointFile({stateDir: concivStateDir(dir), mcpUrl})
  mkdirSync(dirname(file.path), {recursive: true})
  writeFileSync(file.path, file.contents)
}

function projectServedBy(name: string, mcpUrl: string): string {
  const dir = makeProject(name)
  pointProjectAt(dir, mcpUrl)
  return dir
}

function bridgeEnv(run: {timeoutMs?: number}): NodeJS.ProcessEnv {
  const timeout = run.timeoutMs === undefined ? {} : {[CLAUDE_CONNECT_BRIDGE_TIMEOUT_VAR]: String(run.timeoutMs)}
  return {...process.env, CLAUDE_CODE_SESSION_ID: CLAUDE_SESSION, ...timeout}
}

function startBridge(run: {cwd: string; timeoutMs?: number}) {
  const child = spawn(process.execPath, [scratch.bridge], {
    cwd: run.cwd,
    env: bridgeEnv(run),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const lines: string[] = []
  const waiters: Waiter[] = []
  const wake = (): void => {
    const ready = waiters.filter((waiter) => lines.length >= waiter.count)
    const pending = waiters.filter((waiter) => lines.length < waiter.count)
    waiters.length = 0
    waiters.push(...pending)
    for (const waiter of ready) waiter.resolve(lines.slice(0, waiter.count))
  }
  const drain = (): void => {
    for (const waiter of waiters.splice(0)) waiter.resolve([...lines])
  }
  createInterface({input: child.stdout}).on('line', (line) => {
    lines.push(line)
    wake()
  })
  child.on('exit', drain)
  child.on('error', drain)
  return {
    write: (line: string): void => {
      child.stdin.write(`${line}\n`)
    },
    frames: (count: number): Promise<string[]> =>
      new Promise<string[]>((resolve) => {
        waiters.push({count, resolve})
        wake()
      }),
    stop: (): void => {
      child.kill()
    },
  }
}

async function bridgeLines(run: BridgeRun): Promise<string[]> {
  const bridge = startBridge(run)
  for (const line of run.input) bridge.write(line)
  const lines = await bridge.frames(run.expected)
  bridge.stop()
  return lines
}

function rpcCall(id: number, name: string): string {
  return JSON.stringify({jsonrpc: '2.0', id, method: 'tools/call', params: {name}})
}

function callId(body: string): number {
  return CallSchema.parse(JSON.parse(body)).id
}

function frames(lines: string[]): Array<Record<string, unknown>> {
  return lines.map((line) => FrameSchema.parse(JSON.parse(line)))
}

function onlyFrame(lines: string[]): Record<string, unknown> {
  const parsed = frames(lines)
  const first = parsed[0]
  if (parsed.length !== 1 || first === undefined) throw new Error(`expected one frame, got ${parsed.length}`)
  return first
}

function errorMessage(frame: Record<string, unknown>): string {
  return ErrorFrameSchema.parse(frame).error.message
}

function sendJson(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {'content-type': 'application/json'})
  response.end(body)
}

function sendEvents(response: ServerResponse, body: string): void {
  response.writeHead(200, {'content-type': 'text/event-stream'})
  response.end(body)
}

function serveEcho(): Promise<Served> {
  return serve((recorded, response) => {
    sendJson(response, 200, JSON.stringify({jsonrpc: '2.0', id: callId(recorded.body), result: {ok: true}}))
  })
}

beforeAll(() => {
  scratch.dir = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-bridge-')))
  scratch.bridge = join(scratch.dir, 'conciv-mcp-bridge.mjs')
  writeFileSync(scratch.bridge, claudeConnectBridgeSource())
})

afterEach(async () => {
  await Promise.all(running.splice(0).map((server) => stopServer(server)))
  for (const dir of projects.splice(0)) rmSync(dir, {recursive: true, force: true})
})

afterAll(() => {
  rmSync(scratch.dir, {recursive: true, force: true})
})

describe('claude connect bridge', () => {
  it('forwards a request and writes the json reply with the session header attached', async () => {
    const served = await serveEcho()
    const cwd = projectServedBy('one', served.url)
    const lines = await bridgeLines({cwd, input: [rpcCall(1, 'canvas.draw')], expected: 1})

    expect(onlyFrame(lines)).toEqual({jsonrpc: '2.0', id: 1, result: {ok: true}})
    expect(served.recorded[0]?.session).toBe(CLAUDE_SESSION)
  })

  it('answers a 500 with an error frame carrying the request id', async () => {
    const served = await serve((_recorded, response) => {
      sendJson(response, 500, JSON.stringify({message: 'internal error'}))
    })
    const cwd = projectServedBy('one', served.url)
    const lines = await bridgeLines({cwd, input: [rpcCall(2, 'canvas.draw')], expected: 1})
    const frame = onlyFrame(lines)

    expect(frame.id).toBe(2)
    expect(frame.error).toEqual({code: -32000, message: expect.stringContaining('500')})
  })

  it('answers a 404 html body with an error frame instead of echoing it', async () => {
    const served = await serve((_recorded, response) => {
      response.writeHead(404, {'content-type': 'text/html'})
      response.end('<!doctype html><h1>not found</h1>')
    })
    const cwd = projectServedBy('one', served.url)
    const lines = await bridgeLines({cwd, input: [rpcCall(3, 'canvas.draw')], expected: 1})
    const frame = onlyFrame(lines)

    expect(frame.id).toBe(3)
    expect(frame.error).toEqual({code: -32000, message: expect.stringContaining('404')})
  })

  it('answers a 200 that is not json with an error frame instead of echoing it', async () => {
    const served = await serve((_recorded, response) => {
      response.writeHead(200, {'content-type': 'text/plain'})
      response.end('hello')
    })
    const cwd = projectServedBy('one', served.url)
    const lines = await bridgeLines({cwd, input: [rpcCall(13, 'canvas.draw')], expected: 1})
    const frame = onlyFrame(lines)

    expect(frame.id).toBe(13)
    expect(frame.error).toEqual({code: -32000, message: expect.stringContaining('non-json')})
  })

  it('answers an empty 200 with an error frame', async () => {
    const served = await serve((_recorded, response) => {
      sendJson(response, 200, '')
    })
    const cwd = projectServedBy('one', served.url)
    const lines = await bridgeLines({cwd, input: [rpcCall(14, 'canvas.draw')], expected: 1})
    const frame = onlyFrame(lines)

    expect(frame.id).toBe(14)
    expect(frame.error).toEqual({code: -32000, message: expect.stringContaining('empty response')})
  })

  it('answers an error frame when the server is not listening', async () => {
    const cwd = projectServedBy('one', await closedServerUrl())
    const lines = await bridgeLines({cwd, input: [rpcCall(4, 'canvas.draw')], expected: 1})
    const frame = onlyFrame(lines)

    expect(frame.id).toBe(4)
    expect(frame.error).toEqual({code: -32000, message: expect.stringContaining('conciv bridge')})
  })

  it('times out a server that never answers', async () => {
    const served = await serve(() => {})
    const cwd = projectServedBy('one', served.url)
    const lines = await bridgeLines({cwd, input: [rpcCall(5, 'canvas.draw')], expected: 1, timeoutMs: 300})
    const frame = onlyFrame(lines)

    expect(frame.id).toBe(5)
    expect(frame.error).toEqual({code: -32000, message: expect.stringContaining('timed out')})
  })

  it('stays silent for a notification that fails', async () => {
    const served = await serve((_recorded, response) => {
      sendJson(response, 500, '{}')
    })
    const cwd = projectServedBy('one', served.url)
    const notification = JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'})
    const input = [notification, rpcCall(6, 'canvas.draw')]
    const lines = await bridgeLines({cwd, input, expected: 1})

    expect(onlyFrame(lines).id).toBe(6)
  })

  it('writes one line per sse event', async () => {
    const first = JSON.stringify({jsonrpc: '2.0', method: 'notifications/progress', params: {progress: 1}})
    const second = JSON.stringify({jsonrpc: '2.0', id: 7, result: {ok: true}})
    const served = await serve((_recorded, response) => {
      sendEvents(response, `event: message\ndata: ${first}\n\nevent: message\ndata: ${second}\n\n`)
    })
    const cwd = projectServedBy('one', served.url)
    const lines = await bridgeLines({cwd, input: [rpcCall(7, 'canvas.draw')], expected: 2})

    expect(lines).toHaveLength(2)
    expect(frames(lines).map((frame) => frame.method ?? frame.id)).toEqual(['notifications/progress', 7])
  })

  it('joins a single sse event split over two data lines', async () => {
    const served = await serve((_recorded, response) => {
      const head = 'data: {"jsonrpc":"2.0","id":8,'
      const tail = 'data:  "result":{"text":"line one\\nline two"}}'
      sendEvents(response, `${head}\n${tail}\n\n`)
    })
    const cwd = projectServedBy('one', served.url)
    const lines = await bridgeLines({cwd, input: [rpcCall(8, 'canvas.draw')], expected: 1})
    const frame = onlyFrame(lines)

    expect(frame.id).toBe(8)
    expect(frame.result).toEqual({text: 'line one\nline two'})
  })

  it('writes a one megabyte result as exactly one parseable line', async () => {
    const text = 'x'.repeat(1_000_000)
    const served = await serve((_recorded, response) => {
      sendJson(response, 200, JSON.stringify({jsonrpc: '2.0', id: 9, result: {text}}))
    })
    const cwd = projectServedBy('one', served.url)
    const lines = await bridgeLines({cwd, input: [rpcCall(9, 'canvas.draw')], expected: 1})
    const frame = onlyFrame(lines)

    expect(frame.id).toBe(9)
    expect(frame.result).toEqual({text})
  })

  it('answers three pipelined requests with matching ids when the first is slowest', async () => {
    const delays: Record<number, number> = {10: 400, 11: 150, 12: 10}
    const served = await serve((recorded, response) => {
      const id = callId(recorded.body)
      setTimeout(() => sendJson(response, 200, JSON.stringify({jsonrpc: '2.0', id, result: {ok: true}})), delays[id])
    })
    const cwd = projectServedBy('one', served.url)
    const input = [rpcCall(10, 'canvas.draw'), rpcCall(11, 'canvas.draw'), rpcCall(12, 'canvas.draw')]
    const lines = await bridgeLines({cwd, input, expected: 3})

    expect(lines).toHaveLength(3)
    expect(
      frames(lines)
        .map((frame) => frame.id)
        .toSorted(),
    ).toEqual([10, 11, 12])
  })
})

describe('claude connect bridge project resolution', () => {
  it('sends each project to its own dev server when both run the same bridge file', async () => {
    const first = await serveEcho()
    const second = await serveEcho()
    const firstProject = projectServedBy('first', first.url)
    const secondProject = projectServedBy('second', second.url)

    const toFirst = await bridgeLines({cwd: firstProject, input: [rpcCall(20, 'canvas.draw')], expected: 1})
    const toSecond = await bridgeLines({cwd: secondProject, input: [rpcCall(21, 'canvas.draw')], expected: 1})
    const backToFirst = await bridgeLines({cwd: firstProject, input: [rpcCall(22, 'canvas.draw')], expected: 1})

    expect(frames([...toFirst, ...toSecond, ...backToFirst]).map((frame) => frame.id)).toEqual([20, 21, 22])
    expect(first.recorded.map((entry) => callId(entry.body))).toEqual([20, 22])
    expect(second.recorded.map((entry) => callId(entry.body))).toEqual([21])
  })

  it('reaches a project from a directory below its root', async () => {
    const served = await serveEcho()
    const project = projectServedBy('nested', served.url)
    const nested = join(project, 'packages', 'app')
    mkdirSync(nested, {recursive: true})
    const lines = await bridgeLines({cwd: nested, input: [rpcCall(23, 'canvas.draw')], expected: 1})

    expect(onlyFrame(lines).id).toBe(23)
    expect(served.recorded).toHaveLength(1)
  })

  it('follows a restarted dev server onto a new port without restarting the bridge', async () => {
    const before = await serveEcho()
    const project = projectServedBy('restart', before.url)
    const bridge = startBridge({cwd: project})
    bridge.write(rpcCall(24, 'canvas.draw'))
    await bridge.frames(1)

    await stopServer(before.server)
    const after = await serveEcho()
    pointProjectAt(project, after.url)
    bridge.write(rpcCall(25, 'canvas.draw'))
    const lines = await bridge.frames(2)
    bridge.stop()

    expect(frames(lines).map((frame) => frame.id)).toEqual([24, 25])
    expect(before.recorded.map((entry) => callId(entry.body))).toEqual([24])
    expect(after.recorded.map((entry) => callId(entry.body))).toEqual([25])
  })

  it('refuses to bridge a project with no dev server and names the directory it searched', async () => {
    const served = await serveEcho()
    projectServedBy('served', served.url)
    const stranger = makeProject('stranger')
    const lines = await bridgeLines({cwd: stranger, input: [rpcCall(26, 'canvas.draw')], expected: 1})
    const frame = onlyFrame(lines)

    expect(frame.id).toBe(26)
    expect(errorMessage(frame)).toContain(stranger)
    expect(served.recorded).toEqual([])
  })
})
