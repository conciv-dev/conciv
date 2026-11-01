import {createServer, type IncomingMessage, type ServerResponse} from 'node:http'
import {expect, it, afterEach, afterAll, beforeAll, describe, vi} from 'vitest'
import {z} from 'zod'
import {getHarness} from '@conciv/harness'
import {harnessAvailable} from '../src/harness-available.js'
import {makeCallTool, makeRunTypescript} from '../src/call-tool.js'
import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {spawn, type ChildProcess} from 'node:child_process'
import {createTestkit, type BootApp} from '../src/create-testkit.js'
import {createFakeHarness} from '../src/create-fake-harness.js'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {type HarnessConnectContext, type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {createTestHarness} from '../src/create-test-harness.js'
import {harnessModes} from '../src/harness-modes.js'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {type ChatPart} from '@conciv/protocol/chat-message-types'
import {foldChatEvents} from '@conciv/ai/testkit'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import {makeRunStream} from '../src/run-stream.js'
import {makeScriptedRun, type ScriptedRun} from '../src/scripted-run.js'
import {until as testkitUntil} from '../src/testkit.js'
import {until} from '../src/until.js'
import {makeRpcClient, makeSessionBoundRpcClient, type RpcClient} from '../src/session.js'
import {implement} from '@orpc/server'
import {initHub} from '@devframes/hub/initiate'
import {concivError, defineConcivFunction} from '@conciv/extension/devframe-function'
import {defineConcivPlugin} from '@conciv/extension/devframe-plugin'
import {nodeClient, type NodeClient} from '@conciv/extension/devframe-connection'
import {serveDevframePlugin} from '../src/devframe-mounts.js'
import {RPCHandler} from '@orpc/server/node'
import {contract} from '@conciv/contract'
import {once} from 'node:events'
import {setImmediate} from 'node:timers/promises'
import {setFlagsFromString} from 'node:v8'
import {runInNewContext} from 'node:vm'

describe('call tool', () => {
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
})

describe('cleanup concurrent writes', () => {
  const lateWriterSource = `
const {writeFileSync, unlinkSync, existsSync} = require('node:fs')
const {join} = require('node:path')
const root = process.argv[1]
const temp = join(root, '.tanstack-mcp-bridge-late.json')
writeFileSync(join(root, 'writer-live'), '')
console.log('live')
const stopAt = Date.now() + 150
while (Date.now() < stopAt) writeFileSync(temp, '{}')
if (existsSync(temp)) unlinkSync(temp)
if (existsSync(join(root, 'writer-live'))) unlinkSync(join(root, 'writer-live'))
`

  function seedTree(root: string): void {
    for (const dir of Array.from({length: 20}, (_, index) => join(root, `d${index}`))) {
      mkdirSync(dir, {recursive: true})
      for (const file of Array.from({length: 20}, (_, index) => join(dir, `f${index}`))) {
        writeFileSync(file, 'x'.repeat(200))
      }
    }
  }

  function fakeRpcResponse(request: Request): unknown {
    const path = new URL(request.url).pathname
    if (path.endsWith('/sessions/resolve')) return {sessionId: 'conciv_cleanup_fixture'}
    if (path.endsWith('/sessions/list')) return []
    return {ok: true}
  }

  function lateWritingBoot(state: {writer: ChildProcess | null}): BootApp {
    return async (env) => {
      seedTree(env.stateRoot)
      const hub = initHub({base: '/__conciv/', auth: false, mcp: false, cwd: env.cwd})
      return {
        hub,
        claimUpgrade: () => false,
        loginToken: 'unused',
        fetch: (request) =>
          new Response(JSON.stringify({json: fakeRpcResponse(request)}), {
            headers: {'content-type': 'application/json'},
          }),
        dispose: async () => {
          await hub.close()
          const writer = spawn(process.execPath, ['-e', lateWriterSource, env.stateRoot], {
            stdio: ['ignore', 'pipe', 'ignore'],
          })
          state.writer = writer
          await new Promise<void>((resolve) => writer.stdout?.once('data', () => resolve()))
        },
      }
    }
  }

  const state = {writer: null as ChildProcess | null}

  afterEach(() => {
    state.writer?.kill('SIGKILL')
    state.writer = null
  })

  it('removes the state root even when teardown drops a temp file into it mid-removal', async () => {
    const kit = await createTestkit(createFakeHarness(), lateWritingBoot(state)).setup()
    const stateRoot = kit.stateRoot

    await kit.cleanup()

    expect(existsSync(stateRoot)).toBe(false)
  }, 30_000)
})

describe('create fake harness', () => {
  const context: HarnessConnectContext = {
    cwd: '/',
    stateDir: '/state/.conciv',
    concivSessionId: SessionId.parse('conciv_fake_harness'),
    harnessSessionId: HarnessSessionId.parse('s'),
    resume: false,
    owned: true,
    model: null,
    mcpUrl: null,
    hookUrl: null,
  }

  describe('createFakeHarness transcript history', () => {
    it('declares no transcript history by default', () => {
      const harness = createFakeHarness()
      expect(harness.capabilities.transcriptHistory).toBe(false)
      expect(harness.history).toBeUndefined()
    })

    it('serves the injected rows as the harness transcript list', async () => {
      const rows = [
        {
          id: HarnessSessionId.parse('external-1'),
          derivedTitle: 'An external session',
          updatedAt: 1_700,
          messageCount: 7,
        },
        {id: HarnessSessionId.parse('external-2'), derivedTitle: 'Another one', updatedAt: 1_800, messageCount: 2},
      ]
      const harness = createFakeHarness({history: rows})

      expect(harness.capabilities.transcriptHistory).toBe(true)
      expect(await harness.history?.list('/project')).toEqual(rows)
      expect(await harness.history?.messages('/project', HarnessSessionId.parse('external-1'))).toEqual([])
    })
  })

  describe('createFakeHarness tty', () => {
    it('has no tty by default', () => {
      expect(createFakeHarness().tty).toBeUndefined()
    })

    it('exposes an injected tty command', () => {
      const command = () => ({bin: 'bash', args: ['-i'], env: {}})
      const harness = createFakeHarness({tty: {command}})
      expect(harness.tty?.command(context).bin).toBe('bash')
    })
  })
})

describe('create test harness', () => {
  describe('createTestHarness', () => {
    it('keeps the real capabilities but swaps chatConfig for a deterministic one', () => {
      const real = getHarness('claude')
      if (!real) throw new Error('claude adapter not registered')
      const test = createTestHarness(real)
      expect(test.id).toBe(real.id)
      expect(test.capabilities).toEqual(real.capabilities)
      expect(typeof test.chatConfig).toBe('function')
      expect(test.chatConfig).not.toBe(real.chatConfig)
    })
  })
})

describe('harness modes', () => {
  const claude = getHarness('claude')
  if (!claude) throw new Error('claude adapter not registered')

  const priorCI = process.env.CI

  afterEach(() => {
    if (priorCI === undefined) delete process.env.CI
    else process.env.CI = priorCI
  })

  describe('harnessModes', () => {
    it('always runs the fake leg', () => {
      const fake = harnessModes(claude).find((mode) => mode.name === 'fake')
      expect(fake?.run).toBe(true)
    })

    it('disables the real leg under CI regardless of the binary', () => {
      process.env.CI = '1'
      const real = harnessModes(claude).find((mode) => mode.name === 'real')
      expect(real?.run).toBe(false)
    })
  })
})

describe('run stream', () => {
  async function* scripted(chunks: ChatEvent[], gapMs = 5): AsyncGenerator<ChatEvent> {
    for (const chunk of chunks) {
      await new Promise((r) => setTimeout(r, gapMs))
      yield chunk
    }
  }

  async function* parked(chunks: ChatEvent[]): AsyncGenerator<ChatEvent> {
    yield* scripted(chunks)
    await new Promise(() => {})
  }

  async function* slowToStart(preamble: ChatEvent[], gapMs: number): AsyncGenerator<ChatEvent> {
    yield* scripted(preamble, 0)
    await new Promise((r) => setTimeout(r, gapMs))
    yield started
    yield finished
  }

  const text = (delta: string): ChatEvent =>
    ({type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta}) as ChatEvent
  const started = {type: ChatEventType.RUN_STARTED, threadId: 't', runId: 'r'} as ChatEvent
  const finished = {type: ChatEventType.RUN_FINISHED, threadId: 't', runId: 'r'} as ChatEvent
  const accepted = {type: ChatEventType.CUSTOM, name: 'run.accepted', value: {}, timestamp: 0} as ChatEvent

  const snapshot = (parts: ChatPart[]): ChatEvent => aguiSnapshotFor([{id: 'a1', role: 'assistant', parts}])

  const textPart = (content: string): ChatPart => ({type: 'text', content})

  const toolCallPart = (id: string, name: string, args: unknown): ChatPart => ({
    type: 'tool-call',
    id,
    name,
    arguments: JSON.stringify(args),
    state: 'input-complete',
  })

  describe('makeRunStream', () => {
    it('waitForToolCall resolves with parsed input when the call lands mid-stream', async () => {
      const run = makeRunStream(
        scripted([
          started,
          snapshot([textPart('thinking'), toolCallPart('tc-1', 'conciv_ui', {kind: 'confirm', question: 'Proceed?'})]),
          finished,
        ]),
      )
      const call = await run.waitForToolCall('conciv_ui')
      expect(call).toEqual({toolCallId: 'tc-1', name: 'conciv_ui', input: {kind: 'confirm', question: 'Proceed?'}})
    })

    it('waitForToolCall rejects fast when the run finishes without that tool', async () => {
      const run = makeRunStream(scripted([started, snapshot([toolCallPart('tc-1', 'open', {file: 'a.ts'})]), finished]))
      await expect(run.waitForToolCall('conciv_ui')).rejects.toThrow(/finished|without/i)
    })

    it('done().toolCalls filters by name and parses each call input', async () => {
      const run = makeRunStream(
        scripted([
          started,
          snapshot([
            toolCallPart('tc-1', 'open', {file: 'a.ts'}),
            toolCallPart('tc-2', 'conciv_ui', {kind: 'confirm', question: 'Proceed?'}),
          ]),
          finished,
        ]),
      )
      const events = await run.done()
      expect(events.toolCalls().map((call) => call.name)).toEqual(['open', 'conciv_ui'])
      expect(events.toolCalls('conciv_ui')).toEqual([
        {toolCallId: 'tc-2', name: 'conciv_ui', input: {kind: 'confirm', question: 'Proceed?'}},
      ])
    })

    it('done drains to RUN_FINISHED and exposes typed queries', async () => {
      const run = makeRunStream(
        scripted([started, snapshot([textPart('hello ')]), snapshot([textPart('hello world')]), finished]),
      )
      const events = await run.done()
      expect(events.text()).toBe('hello world')
      expect(events.runs()).toBe(1)
    })

    it('hang guard fires while the source is parked', async () => {
      const run = makeRunStream(parked([started, text('still going')]))
      await expect(
        run.waitFor((chunk) => chunk.type === ChatEventType.RUN_FINISHED, {hangGuardMs: 80}),
      ).rejects.toThrow(/stall.*seen:/s)
    })

    it('waitForRunStart outlives a producer that is slow to emit its first chunk', async () => {
      const run = makeRunStream(slowToStart([snapshot([textPart('catch-up')]), accepted], 150))
      const chunk = await run.waitForRunStart()
      expect(chunk.type).toBe(ChatEventType.RUN_STARTED)
    })

    it('a generic stall budget cannot cover the same slow start', async () => {
      const run = makeRunStream(slowToStart([snapshot([textPart('catch-up')]), accepted], 150))
      await expect(run.waitFor((chunk) => chunk.type === ChatEventType.RUN_STARTED, {hangGuardMs: 40})).rejects.toThrow(
        /stall.*MESSAGES_SNAPSHOT/s,
      )
    })

    it('waitForRunStart rejects on the run signal when the run ends without starting', async () => {
      const errored = {type: ChatEventType.RUN_ERROR, threadId: 't', runId: 'r', message: 'no output'} as ChatEvent
      const run = makeRunStream(parked([snapshot([textPart('catch-up')]), accepted, errored]))
      await expect(run.waitForRunStart()).rejects.toThrow(/run finished without a matching event.*RUN_ERROR/s)
    })

    it('waitForRunStart matches the requested runId and ignores an earlier run', async () => {
      const other = {type: ChatEventType.RUN_STARTED, threadId: 't', runId: 'other'} as ChatEvent
      const run = makeRunStream(parked([other, started]))
      const chunk = await run.waitForRunStart({runId: 'r'})
      expect('runId' in chunk ? chunk.runId : '').toBe('r')
    })

    it('parallel waiters each see every chunk', async () => {
      const run = makeRunStream(scripted([started, text('alpha'), text('beta'), finished]))
      const isDelta = (delta: string) => (chunk: ChatEvent) =>
        chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT && chunk.delta === delta
      const [alpha, beta] = await Promise.all([run.waitFor(isDelta('alpha')), run.waitFor(isDelta('beta'))])
      expect(alpha.type).toBe(ChatEventType.TEXT_MESSAGE_CONTENT)
      expect(beta.type).toBe(ChatEventType.TEXT_MESSAGE_CONTENT)
    })

    it('a late waiter replays chunks already collected', async () => {
      const run = makeRunStream(scripted([started, text('early'), finished]))
      await run.done()
      const chunk = await run.waitFor((c) => c.type === ChatEventType.TEXT_MESSAGE_CONTENT, {hangGuardMs: 100})
      expect(chunk.type).toBe(ChatEventType.TEXT_MESSAGE_CONTENT)
    })

    it('done resolves when RUN_FINISHED landed before the call', async () => {
      const run = makeRunStream(
        scripted([
          started,
          snapshot([toolCallPart('tc-1', 'conciv_ui', {kind: 'confirm', question: 'Proceed?'})]),
          text('tail'),
          finished,
        ]),
      )
      await run.waitForToolCall('conciv_ui')
      await new Promise((r) => setTimeout(r, 50))
      const events = await run.done({hangGuardMs: 500})
      expect(events.runs()).toBe(1)
    })

    it('an intermediate tool_calls RUN_FINISHED does not end done()', async () => {
      const intermediate = {
        type: ChatEventType.RUN_FINISHED,
        threadId: 't',
        runId: 'r',
        finishReason: 'tool_calls',
      } as ChatEvent
      const run = makeRunStream(
        scripted([
          started,
          snapshot([toolCallPart('tc-1', 'conciv_ui', {kind: 'confirm', question: 'Proceed?'})]),
          intermediate,
          snapshot([textPart('after')]),
          finished,
        ]),
      )
      const events = await run.done({hangGuardMs: 1000})
      expect(events.text()).toContain('after')
    })

    it('an old-turn RUN_FINISHED in history does not fail a new waiter', async () => {
      const run = makeRunStream(
        parked([
          started,
          finished,
          started,
          snapshot([toolCallPart('tc-2', 'conciv_ui', {kind: 'confirm', question: 'Again?'})]),
        ]),
      )
      await run.done()
      const call = await run.waitForToolCall('conciv_ui')
      expect(call.input).toEqual({kind: 'confirm', question: 'Again?'})
    })
  })
})

describe('scripted run', () => {
  const deps = (): HarnessChatDeps => ({
    cwd: '.',
    sessionId: SessionId.parse('conciv_s'),
    resumeSessionId: null,
    env: {},
    kind: 'chat',
  })

  function drainUnderSignal(
    scripted: ScriptedRun,
    signal: AbortSignal,
  ): {seen: {chunks: ChatEvent[]; ended: boolean}; drained: Promise<void>} {
    const seen: {chunks: ChatEvent[]; ended: boolean} = {chunks: [], ended: false}
    const drained = (async () => {
      for await (const chunk of scripted.chatStream(deps(), {request: {signal}})) seen.chunks.push(chunk)
      seen.ended = true
    })()
    return {seen, drained}
  }

  function drainInBackground(scripted: ScriptedRun): {chunks: ChatEvent[]; drained: Promise<void>} {
    const chunks: ChatEvent[] = []
    const drain = async (): Promise<void> => {
      for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)
    }
    return {chunks, drained: drain()}
  }

  function drainResultTimes(scripted: ScriptedRun): {times: number[]; drained: Promise<void>} {
    const times: number[] = []
    const drain = async (): Promise<void> => {
      for await (const chunk of scripted.chatStream(deps())) {
        if (chunk.type === ChatEventType.TOOL_CALL_RESULT) times.push(performance.now())
      }
    }
    return {times, drained: drain()}
  }

  function drainTextDeltas(scripted: ScriptedRun): {deltas: string[]; times: number[]; drained: Promise<void>} {
    const deltas: string[] = []
    const times: number[] = []
    const drain = async (): Promise<void> => {
      for await (const chunk of scripted.chatStream(deps())) {
        if (chunk.type !== ChatEventType.TEXT_MESSAGE_CONTENT) continue
        deltas.push(chunk.delta)
        times.push(performance.now())
      }
    }
    return {deltas, times, drained: drain()}
  }

  function assistantIds(events: ChatEvent[]): string[] {
    return foldChatEvents(events)
      .filter((message) => message.role === 'assistant')
      .map((message) => message.id)
  }

  const PACED_STEPS = 4
  const PACE_MS = 40
  const PACE_TOLERANCE = 0.8
  const TEXT_CHUNK_SIZE = 8
  const PACED_TEXT = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const PACED_TEXT_SLICES = Math.ceil(PACED_TEXT.length / TEXT_CHUNK_SIZE)

  describe('makeScriptedRun', () => {
    it('emits a full lifecycle with a session-id custom event', async () => {
      const {chatStream} = makeScriptedRun({text: 'hello from fake'})
      const out: ChatEvent[] = []
      for await (const chunk of chatStream(deps())) out.push(chunk)
      expect(out.at(0)?.type).toBe(ChatEventType.RUN_STARTED)
      expect(out.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
      expect(out.some((c) => c.type === ChatEventType.TEXT_MESSAGE_CONTENT)).toBe(true)
      expect(out.some((c) => c.type === ChatEventType.CUSTOM && c.name === 'fake.session-id')).toBe(true)
    })

    it.each([
      {
        name: 'a held turn',
        arrange: (scripted: ScriptedRun) => scripted.hold(),
        parked: ChatEventType.TEXT_MESSAGE_CONTENT,
        withheld: ChatEventType.RUN_FINISHED,
      },
      {
        name: 'a turn held at its tool gate',
        arrange: (scripted: ScriptedRun) => scripted.holdTools(),
        parked: ChatEventType.RUN_STARTED,
        withheld: ChatEventType.TOOL_CALL_START,
      },
      {
        name: 'a turn held at its result gate',
        arrange: (scripted: ScriptedRun) => scripted.holdResults(),
        parked: ChatEventType.TOOL_CALL_END,
        withheld: ChatEventType.TOOL_CALL_RESULT,
      },
    ])('ends $name when the caller aborts the request', async ({arrange, parked, withheld}) => {
      const scripted = makeScriptedRun()
      scripted.scriptTurn({toolCalls: [{name: 'first_tool', input: {a: 1}}], text: 'done'})
      arrange(scripted)
      const controller = new AbortController()
      const run = drainUnderSignal(scripted, controller.signal)

      await vi.waitFor(() => expect(run.seen.chunks.some((chunk) => chunk.type === parked)).toBe(true))
      controller.abort()

      await vi.waitFor(() => expect(run.seen.ended).toBe(true), {timeout: 1_000, interval: 10})
      await run.drained
      expect(run.seen.chunks.some((chunk) => chunk.type === withheld)).toBe(false)
    })

    it('gives each tool call in a session its own toolCallId, matching what scriptToolCall returned', async () => {
      const scripted = makeScriptedRun()
      const firstScriptedId = scripted.scriptToolCall('first_tool', {a: 1}, {blocking: false})
      const secondScriptedId = scripted.scriptToolCall('second_tool', {b: 2}, {blocking: false})
      const collectToolCallId = async (): Promise<string> => {
        for await (const chunk of scripted.chatStream(deps())) {
          if (chunk.type === ChatEventType.TOOL_CALL_START) return chunk.toolCallId
        }
        throw new Error('no tool call start emitted')
      }
      const firstEmittedId = await collectToolCallId()
      const secondEmittedId = await collectToolCallId()
      expect(firstEmittedId).not.toBe(secondEmittedId)
      expect(firstEmittedId).toBe(firstScriptedId)
      expect(secondEmittedId).toBe(secondScriptedId)
    })

    it('keeps two independently queued tool calls in two separate turns', async () => {
      const scripted = makeScriptedRun()
      scripted.scriptToolCall('first_tool', {a: 1})
      scripted.scriptToolCall('second_tool', {b: 2})
      const drainTurn = async (): Promise<ChatEvent[]> => {
        const chunks: ChatEvent[] = []
        for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)
        return chunks
      }
      const first = await drainTurn()
      const second = await drainTurn()
      const startsIn = (chunks: ChatEvent[]): string[] =>
        chunks.flatMap((chunk) => (chunk.type === ChatEventType.TOOL_CALL_START ? [chunk.toolCallName] : []))
      expect(startsIn(first)).toEqual(['first_tool'])
      expect(startsIn(second)).toEqual(['second_tool'])
    })

    it('emits every tool call of a scripted turn, with its result, inside one turn', async () => {
      const scripted = makeScriptedRun()
      const ids = scripted.scriptTurn({
        toolCalls: [
          {name: 'first_tool', input: {a: 1}, result: {ok: 'one'}},
          {name: 'second_tool', input: {b: 2}, result: {ok: 'two'}},
        ],
        text: 'both tools ran',
      })
      const chunks: ChatEvent[] = []
      for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)

      const starts = chunks.flatMap((chunk) => (chunk.type === ChatEventType.TOOL_CALL_START ? [chunk.toolCallId] : []))
      const results = chunks.flatMap((chunk) =>
        chunk.type === ChatEventType.TOOL_CALL_RESULT ? [{id: chunk.toolCallId, content: chunk.content}] : [],
      )
      const text = chunks.flatMap((chunk) => (chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT ? [chunk.delta] : []))
      expect(starts).toEqual(ids)
      expect(results).toEqual([
        {id: ids[0], content: JSON.stringify({ok: 'one'})},
        {id: ids[1], content: JSON.stringify({ok: 'two'})},
      ])
      expect(text).toEqual(['both tools ran'])
      expect(chunks.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
    })

    it('passes a scripted string tool result through raw instead of JSON-quoting it', async () => {
      const scripted = makeScriptedRun()
      const multilineResult = 'line one\nline two\nline three'
      const ids = scripted.scriptTurn({toolCalls: [{name: 'read_file', input: {a: 1}, result: multilineResult}]})
      const chunks: ChatEvent[] = []
      for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)
      const results = chunks.flatMap((chunk) =>
        chunk.type === ChatEventType.TOOL_CALL_RESULT ? [{id: chunk.toolCallId, content: chunk.content}] : [],
      )
      expect(results).toEqual([{id: ids[0], content: multilineResult}])
    })

    it('keeps a scripted null tool result as null instead of substituting the default', async () => {
      const scripted = makeScriptedRun()
      const ids = scripted.scriptTurn({toolCalls: [{name: 'nullish_tool', input: {a: 1}, result: null}]})
      const chunks: ChatEvent[] = []
      for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)
      const results = chunks.flatMap((chunk) =>
        chunk.type === ChatEventType.TOOL_CALL_RESULT ? [{id: chunk.toolCallId, content: chunk.content}] : [],
      )
      expect(results).toEqual([{id: ids[0], content: 'null'}])
    })

    it('streams a queued tool call and a queued turn in the order they were scripted', async () => {
      const scripted = makeScriptedRun()
      scripted.scriptToolCall('first_tool', {a: 1})
      scripted.scriptTurn({toolCalls: [{name: 'second_tool', input: {b: 2}}], text: 'turn ran'})
      const drainTurn = async (): Promise<ChatEvent[]> => {
        const chunks: ChatEvent[] = []
        for await (const chunk of scripted.chatStream(deps())) chunks.push(chunk)
        return chunks
      }
      const first = await drainTurn()
      const second = await drainTurn()
      const startsIn = (chunks: ChatEvent[]): string[] =>
        chunks.flatMap((chunk) => (chunk.type === ChatEventType.TOOL_CALL_START ? [chunk.toolCallName] : []))
      expect(startsIn(first)).toEqual(['first_tool'])
      expect(startsIn(second)).toEqual(['second_tool'])
    })

    it('holds every tool result until releaseResults(), leaving the tool call started and unresolved', async () => {
      const scripted = makeScriptedRun()
      const ids = scripted.scriptTurn({toolCalls: [{name: 'held_tool', input: {a: 1}}], text: 'done'})
      scripted.holdResults()
      const {chunks, drained} = drainInBackground(scripted)
      await new Promise((r) => setTimeout(r, 30))
      expect(chunks.some((c) => c.type === ChatEventType.TOOL_CALL_START && c.toolCallId === ids[0])).toBe(true)
      expect(chunks.some((c) => c.type === ChatEventType.TOOL_CALL_RESULT)).toBe(false)
      scripted.releaseResults()
      await drained
      const results = chunks.flatMap((chunk) =>
        chunk.type === ChatEventType.TOOL_CALL_RESULT ? [chunk.toolCallId] : [],
      )
      expect(results).toEqual(ids)
      expect(chunks.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
    })

    it('releases held tool results one every everyMs instead of all at once', async () => {
      const scripted = makeScriptedRun()
      const ids = scripted.scriptTurn({
        toolCalls: Array.from({length: PACED_STEPS}, (_, index) => ({name: 'paced_tool', input: {step: index}})),
        text: 'done',
      })
      scripted.holdResults()
      const {times, drained} = drainResultTimes(scripted)
      await new Promise((r) => setTimeout(r, 20))
      expect(times.length).toBe(0)
      scripted.releaseResults({everyMs: PACE_MS})
      await drained
      expect(times.length).toBe(ids.length)
      const span = (times.at(-1) ?? 0) - (times.at(0) ?? 0)
      expect(span).toBeGreaterThanOrEqual(PACE_MS * (PACED_STEPS - 1) * PACE_TOLERANCE)
    })

    it('streams a paced turn text as several deltas spaced by everyMs instead of one delta', async () => {
      const scripted = makeScriptedRun()
      scripted.scriptTurn({
        toolCalls: [],
        text: PACED_TEXT,
        textPace: {chunk: TEXT_CHUNK_SIZE, everyMs: PACE_MS},
      })
      const {deltas, times, drained} = drainTextDeltas(scripted)
      await drained
      expect(deltas.length).toBe(PACED_TEXT_SLICES)
      expect(deltas.join('')).toBe(PACED_TEXT)
      const span = (times.at(-1) ?? 0) - (times.at(0) ?? 0)
      expect(span).toBeGreaterThanOrEqual(PACE_MS * (PACED_TEXT_SLICES - 1) * PACE_TOLERANCE)
    })

    it('folds a paced answer after tool calls into one text part of the message that already holds the tool calls, the way a chat processor reads the stream', async () => {
      const scripted = makeScriptedRun()
      scripted.scriptTurn({
        toolCalls: [{name: 'first_tool', input: {a: 1}}],
        text: PACED_TEXT,
        textPace: {chunk: TEXT_CHUNK_SIZE, everyMs: 0},
      })
      const events: ChatEvent[] = []
      const toolCallMessageIds: string[] = []
      for await (const chunk of scripted.chatStream(deps())) {
        events.push(chunk)
        if (chunk.type === ChatEventType.TOOL_CALL_START) toolCallMessageIds.push(...assistantIds(events))
      }
      const texts = foldChatEvents(events).flatMap((message) =>
        message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])),
      )
      expect(assistantIds(events)).toEqual(toolCallMessageIds)
      expect(texts).toEqual([PACED_TEXT])
    })

    it('streams an unpaced turn text as one delta', async () => {
      const scripted = makeScriptedRun()
      scripted.scriptTurn({toolCalls: [], text: PACED_TEXT})
      const {deltas, drained} = drainTextDeltas(scripted)
      await drained
      expect(deltas).toEqual([PACED_TEXT])
    })

    it('emits a queued custom event while the tool call it names is still unresolved', async () => {
      const scripted = makeScriptedRun()
      const ids = scripted.scriptTurn({toolCalls: [{name: 'risky_tool', input: {command: 'rm -rf build'}}]})
      scripted.scriptCustomEvent('approval-requested', {
        toolCallId: ids[0],
        toolName: 'risky_tool',
        input: {command: 'rm -rf build'},
        approval: {id: 'ask-1', needsApproval: true},
      })
      scripted.holdResults()
      const {chunks, drained} = drainInBackground(scripted)
      await new Promise((r) => setTimeout(r, 30))
      expect(chunks.some((c) => c.type === ChatEventType.CUSTOM && c.name === 'approval-requested')).toBe(true)
      expect(chunks.some((c) => c.type === ChatEventType.TOOL_CALL_RESULT)).toBe(false)
      scripted.releaseResults()
      await drained
      const order = chunks.flatMap((chunk) => {
        if (chunk.type === ChatEventType.CUSTOM && chunk.name === 'approval-requested') return ['ask']
        return chunk.type === ChatEventType.TOOL_CALL_RESULT ? ['result'] : []
      })
      expect(order).toEqual(['ask', 'result'])
    })

    it('holds the turn open until release()', async () => {
      const scripted = makeScriptedRun()
      scripted.hold()
      const {chunks, drained} = drainInBackground(scripted)
      await new Promise((r) => setTimeout(r, 30))
      expect(chunks.some((c) => c.type === ChatEventType.RUN_FINISHED)).toBe(false)
      scripted.release()
      await drained
      expect(chunks.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
    })
  })
})

describe('smoke', () => {
  it('package resolves', () => {
    expect(typeof testkitUntil).toBe('function')
  })
})

describe('until', () => {
  describe('until', () => {
    it('resolves once the predicate turns true', async () => {
      const state = {n: 0}
      const tick = setInterval(() => (state.n += 1), 5)
      await until(() => state.n >= 3)
      clearInterval(tick)
      expect(state.n).toBeGreaterThanOrEqual(3)
    })

    it('rejects fast via failWhen without waiting for the guard', async () => {
      const started = performance.now()
      await expect(until(() => false, {failWhen: () => true, hangGuardMs: 4000})).rejects.toThrow()
      expect(performance.now() - started).toBeLessThan(500)
    })

    it('rejects with a stall error after the hang guard', async () => {
      await expect(until(() => false, {hangGuardMs: 60})).rejects.toThrow(/stall|guard|timed out/i)
    })

    it('waits for the predicate to hold continuously when settleFor is set', async () => {
      const state = {open: true}
      setTimeout(() => (state.open = false), 20)
      await until(() => !state.open, {settleFor: 40})
      expect(state.open).toBe(false)
    })
  })
})

describe('rpc clients abort a stream after the request behind it was collected', () => {
  const queries = implement(contract).page.queries.handler(async function* ({signal}) {
    yield {requestId: 'first', query: null}
    if (signal) await once(signal, 'abort')
  })
  const handler = new RPCHandler({page: {queries}})
  const server = createServer((request, response) => {
    void handler.handle(request, response, {prefix: '/rpc'})
  })
  const base = {url: ''}

  beforeAll(async () => {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    base.url = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
  })

  afterAll(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })

  async function expectAbortAfterCollection(client: RpcClient): Promise<void> {
    const abort = new AbortController()
    const stream = await client.page.queries(undefined, {signal: abort.signal})
    await stream.next()
    setFlagsFromString('--expose-gc')
    const collect: unknown = runInNewContext('gc')
    if (typeof collect !== 'function') throw new Error('gc unavailable')
    collect()
    await setImmediate()
    collect()
    await setImmediate()
    const ended = stream.next()
    abort.abort()
    await expect(ended).rejects.toThrow()
  }

  it('makeRpcClient', async () => {
    await expectAbortAfterCollection(makeRpcClient(base.url))
  }, 10_000)

  it('makeSessionBoundRpcClient', async () => {
    await expectAbortAfterCollection(makeSessionBoundRpcClient(base.url, () => 'session-a'))
  }, 10_000)
})

describe('conciv devframe layer over a real hub', () => {
  const held = {release: (): void => {}}

  const probe = defineConcivPlugin({
    id: 'probe',
    title: 'Probe',
    configSchema: z.object({greeting: z.string().default('hello')}),
  }).server((ctx, _host, config) => {
    ctx.rpc.register(
      defineConcivFunction({
        name: 'probe:greet',
        type: 'query',
        input: z.object({name: z.string().default('world'), loud: z.boolean().default(false)}),
        output: z.object({text: z.string()}),
        handler: (input) => {
          const text = `${config.greeting} ${input.name}`
          return {text: input.loud ? text.toUpperCase() : text}
        },
      }),
    )
    ctx.rpc.register(
      defineConcivFunction({
        name: 'probe:fail',
        type: 'query',
        input: z.object({}),
        output: z.null(),
        handler: () => {
          throw concivError('NOT_FOUND', 'nothing here', {id: 7})
        },
      }),
    )
    ctx.rpc.register(
      defineConcivFunction({
        name: 'probe:hold',
        type: 'action',
        input: z.object({}),
        output: z.null(),
        handler: () =>
          new Promise<null>((resolve) => {
            held.release = () => resolve(null)
          }),
      }),
    )
    ctx.rpc.register(
      defineConcivFunction({
        name: 'probe:session',
        type: 'query',
        session: true,
        input: z.object({}),
        output: z.object({sessionId: z.string()}),
        handler: (_input, {sessionId}) => ({sessionId}),
      }),
    )
  })

  const call = (client: NodeClient, name: string, input: unknown): Promise<unknown> =>
    client.connection.ready().then(({rpc}) => rpc.$callRaw({method: name, args: [input]}))

  it('applies zod defaults and the plugin config before the handler runs', async () => {
    const served = await serveDevframePlugin(probe.devframe)
    expect(await call(served.client, 'probe:greet', {})).toEqual({text: 'hello world'})
    expect(await call(served.client, 'probe:greet', {name: 'conciv', loud: true})).toEqual({text: 'HELLO CONCIV'})
    await served.close()
  }, 10_000)

  it('refuses input that fails the schema before the handler runs', async () => {
    const served = await serveDevframePlugin(probe.devframe)
    await expect(call(served.client, 'probe:greet', {name: 3})).rejects.toThrow()
    await served.close()
  }, 10_000)

  it('rebuilds a coded error with its code and data on a node client', async () => {
    const served = await serveDevframePlugin(probe.devframe)
    await expect(call(served.client, 'probe:fail', {})).rejects.toMatchObject({
      name: 'ConcivError',
      code: 'NOT_FOUND',
      message: 'nothing here',
      data: {id: 7},
    })
    await served.close()
  }, 10_000)

  it('runs a session function under the explicit session and falls back to the host', async () => {
    const served = await serveDevframePlugin(probe.devframe)
    expect(await call(served.client, 'probe:session', {sessionId: 'conciv_explicit'})).toEqual({
      sessionId: 'conciv_explicit',
    })
    expect(await call(served.client, 'probe:session', {})).toEqual({sessionId: 'conciv_test'})
    await served.close()
  }, 10_000)

  it('serves the same function over the sse transport', async () => {
    const served = await serveDevframePlugin(probe.devframe)
    const sse = nodeClient({url: served.url, transport: 'sse'})
    expect(await call(sse, 'probe:greet', {name: 'sse'})).toEqual({text: 'hello sse'})
    sse.close()
    await served.close()
  }, 10_000)

  it('reports the connection status from idle through connected and down to disconnected', async () => {
    const served = await serveDevframePlugin(probe.devframe)
    const statuses: string[] = [served.client.connection.status()]
    served.client.connection.onStatus((status) => statuses.push(status))
    await served.client.connection.ready()
    await served.hub.close()
    await until(() => statuses.includes('disconnected'))
    expect(statuses.slice(0, 4)).toEqual(['idle', 'connecting', 'connected', 'disconnected'])
    await served.close()
  }, 10_000)

  it('rejects a pending call and ends an open stream with DISCONNECTED when the connection drops', async () => {
    const served = await serveDevframePlugin(probe.devframe)
    const pending = call(served.client, 'probe:hold', {})
    const stream = served.client.connection.stream(async function* () {
      yield 'first'
      await new Promise(() => {})
    })
    const iterator = stream[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toBe('first')
    const ended = iterator.next()
    await served.hub.close()
    await expect(pending).rejects.toMatchObject({code: 'DISCONNECTED'})
    await expect(ended).rejects.toMatchObject({code: 'DISCONNECTED'})
    await served.close()
  }, 10_000)
})
