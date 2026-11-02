import {randomUUID} from 'node:crypto'
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs'
import {writeFile} from 'node:fs/promises'
import {request as httpRequest} from 'node:http'
import {tmpdir} from 'node:os'
import {join, dirname} from 'node:path'
import {afterAll, beforeAll, describe, expect, it, afterEach, test, vi, beforeEach} from 'vitest'
import {imageToolProvisioner, makeTextAdapter} from '@conciv/ai/server'
import {foldChatEvents} from '@conciv/ai/testkit'
import {cappedValue} from '@conciv/chat'
import {type EngineStaleness, makeRpcClient as makeContractRpcClient} from '@conciv/contract'
import {
  defineExtension,
  defineTool,
  makeExtRpcClient,
  type ServerApi,
  imageResult,
  toolError,
  defineAttachment,
} from '@conciv/extension'
import {openSource} from '@conciv/extension/client'
import {getHarness} from '@conciv/harness'
import {
  createFakeHarness,
  serveApp,
  type ServedApp,
  makeRpcClient,
  type Kit,
  createTestHarness,
  createTestkit,
  connectMcpClient,
  harnessAvailable,
  makeRunTypescript,
  makeApprovingCallTool,
  makeCallTool,
  approvePending,
  type TestHarness,
  type RunEvents,
  type RunStream,
  type McpClient,
  type McpTool,
} from '@conciv/harness-testkit'
import {claude} from '@conciv/harness/claude'
import {codex} from '@conciv/harness/codex'
import {opencode} from '@conciv/harness/opencode'
import {defineBundlerBridge} from '@conciv/protocol/bundler-types'
import {type ChatEvent, ChatEventType, sessionRunEvent} from '@conciv/protocol/chat-event-types'
import {type ChatMessage} from '@conciv/protocol/chat-message-types'
import {
  CHAT_SSE_PATH,
  HarnessSessionId,
  SessionId,
  CONCIV_SESSION_HEADER,
  CHAT_WS_PATH,
  CONCIV_CLAUDE_SESSION_HEADER,
} from '@conciv/protocol/chat-types'
import {type ElementCapture, type ElementCaptureKind} from '@conciv/protocol/element-capture-types'
import {type HarnessChatDeps} from '@conciv/protocol/harness-types'
import {type PageOutcome, PAGE_TRANSPORT_ERROR_CODES} from '@conciv/protocol/page-types'
import {type RpcContext} from '@conciv/protocol/rpc-types'
import {type TokenUsage} from '@conciv/protocol/usage-types'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import {os} from '@orpc/server'
import {Hono} from 'hono'
import WebSocket from 'ws'
import {z} from 'zod'
import {HealthSchema, makeApp, type MadeApp} from '../src/app.js'
import {resolveConfig, type ResolvedConcivConfig} from '../src/config.js'
import {openSourceFromFrames} from '../src/editor/open-source.js'
import {originAllowed} from '../src/lib/cors.js'
import {readDevEndpoint} from '../src/lib/dev-endpoint.js'
import {start, type Engine} from '../src/start.js'
import {sampleServerExtension, sampleState} from './fixtures/sample-server-extension.js'
import {
  bootKit,
  requireClaude,
  bootCoreApp,
  requireTranscriptPath,
  connectWidget,
  chunkWithInlineMap,
  cleanupChunks,
  hydratedSnapshot,
  userTexts,
  assertTurnAndResume,
  runReal,
  runTurn,
  type FakeWidget,
} from './helpers.js'

function sharedKit(boot: () => Promise<Kit>): () => Kit {
  const held: {kit: Kit | undefined} = {kit: undefined}
  beforeAll(async () => {
    held.kit = await boot()
  })
  afterAll(async () => {
    await held.kit?.cleanup()
  })
  return () => {
    if (held.kit === undefined) throw new Error('the shared app did not boot')
    return held.kit
  }
}

describe('api connect gate', () => {
  let engine: Engine

  beforeAll(async () => {
    engine = await start({
      options: {},
      root: mkdtempSync(join(tmpdir(), 'conciv-gate-')),
      launchEditor: () => {},
      harness: createFakeHarness({id: 'fake-gate'}),
      accessToken: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    })
  }, 30_000)

  afterAll(async () => {
    await engine.stop()
  })

  describe('token-gated core', () => {
    it('serves health under the token prefix', async () => {
      const res = await fetch(`http://127.0.0.1:${engine.port}/t/7c9e6679-7425-40de-944b-e07fc1f90ae7/health`)
      expect(res.status).toBe(200)
      const raw = z.record(z.string(), z.unknown()).parse(await res.json())
      expect(Object.keys(raw).toSorted()).toEqual(['engine', 'harness', 'ok'])
      expect(Object.keys(z.record(z.string(), z.unknown()).parse(raw.engine)).toSorted()).toEqual([
        'bootedAt',
        'changed',
        'fingerprint',
        'stale',
        'tracked',
      ])
      expect(HealthSchema.parse(raw)).toEqual({
        ok: true,
        harness: 'fake-gate',
        engine: {
          stale: false,
          changed: [],
          tracked: expect.arrayContaining(['@conciv/core']),
          bootedAt: expect.any(Number),
          fingerprint: expect.any(String),
        },
      })
    })

    it('404s the wrong token and the bare path', async () => {
      const wrong = await fetch(`http://127.0.0.1:${engine.port}/t/nope/health`)
      const bare = await fetch(`http://127.0.0.1:${engine.port}/health`)
      expect(wrong.status).toBe(404)
      expect(bare.status).toBe(404)
    })

    it('serves rpc under the prefix', async () => {
      const res = await fetch(
        `http://127.0.0.1:${engine.port}/t/7c9e6679-7425-40de-944b-e07fc1f90ae7/rpc/sessions/list`,
        {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: '{"json":null}',
        },
      )
      expect(res.status).toBe(200)
    })
  })
})

describe('cors', () => {
  const ORIGIN = 'http://localhost:3000'
  const kit = sharedKit(() => bootKit())

  it('allows no Origin, loopback and listed origins, and rejects public ones', () => {
    const none = new Set<string>()
    expect(originAllowed(null, none)).toBe(true)
    expect(originAllowed('http://localhost:5173', none)).toBe(true)
    expect(originAllowed('http://127.0.0.1:3000', none)).toBe(true)
    expect(originAllowed('https://evil.com', none)).toBe(false)
    expect(originAllowed('http://attacker.localhost.evil.com', none)).toBe(false)
    expect(originAllowed('http://192.168.1.5:5173', new Set(['http://192.168.1.5:5173']))).toBe(true)
    expect(originAllowed('http://192.168.1.9:5173', new Set(['http://192.168.1.5:5173']))).toBe(false)
  })

  it('answers the preflight (OPTIONS) for the probe route with 204 + echoed origin + credentials', async () => {
    const res = await fetch(`${kit().base}/rpc/sessions/list`, {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('echoes CORS headers on an actual rpc call (never *)', async () => {
    const res = await fetch(`${kit().base}/rpc/sessions/list`, {
      method: 'POST',
      headers: {origin: ORIGIN, 'content-type': 'application/json'},
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    const allowOrigin = res.headers.get('access-control-allow-origin')
    expect(allowOrigin).toBe(ORIGIN)
    expect(allowOrigin).not.toBe('*')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })
})

describe('api engine staleness di', () => {
  const dirs: string[] = []
  const state = {served: undefined as ServedApp | undefined, dispose: undefined as (() => Promise<void>) | undefined}

  const INJECTED: EngineStaleness = {
    stale: true,
    changed: ['@conciv/injected-probe'],
    tracked: ['@conciv/injected-probe', '@conciv/core'],
    bootedAt: 1_700_000_000_000,
    fingerprint: 'injected1234',
  }

  const INITIALIZE = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'staleness-di-test', version: '0'}},
  })

  afterEach(async () => {
    await state.served?.close()
    await state.dispose?.()
    state.served = undefined
    state.dispose = undefined
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  async function serveWithProbe(staleness: () => EngineStaleness): Promise<ServedApp> {
    const root = mkdtempSync(join(tmpdir(), 'conciv-staleness-di-'))
    dirs.push(root)
    const {app, dispose} = await makeApp({cfg: resolveConfig({}, root), cwd: root, openInEditor: () => {}, staleness})
    state.dispose = dispose
    const served = await serveApp({fetch: app.fetch})
    state.served = served
    return served
  }

  describe('engine staleness dependency injection (IT, real http)', () => {
    it('reports the injected probe consistently on /health, rpc meta.engine and the mcp instructions', async () => {
      const calls = {count: 0}
      const served = await serveWithProbe(() => {
        calls.count += 1
        return INJECTED
      })

      const health = HealthSchema.parse(await (await fetch(`${served.base}/health`)).json())
      const engine = await makeRpcClient(served.base).meta.engine()
      const mcp = await fetch(`${served.base}/api/mcp`, {
        method: 'POST',
        headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream'},
        body: INITIALIZE,
      })
      const instructions = await mcp.text()

      expect(health.engine).toEqual(INJECTED)
      expect(engine).toEqual(INJECTED)
      expect(instructions).toContain('@conciv/injected-probe')
      expect(calls.count).toBeGreaterThanOrEqual(3)
    }, 20_000)
  })
})

describe('api extension lifecycle', () => {
  function toolNamed(name: string) {
    return defineTool({
      name,
      description: 'd',
      inputSchema: z.object({}),
      outputSchema: z.object({ok: z.string()}),
      meta: {summary: `run ${name}`, category: 'fixture', mutating: false},
    }).server(() => ({ok: name}))
  }

  test('two extensions mount isolated namespaces; both routes serve and both tools register', async () => {
    const alpha = defineExtension({name: 'alpha', tools: [toolNamed('alpha_do')]}).server(() => ({
      context: {},
      app: new Hono().get('/where', (c) => c.json({who: 'alpha'})),
    }))
    const beta = defineExtension({name: 'beta', tools: [toolNamed('beta_do')]}).server(() => ({
      context: {},
      app: new Hono().get('/where', (c) => c.json({who: 'beta'})),
    }))
    const kit = await bootKit({extensions: [alpha, beta]})
    const {base, cleanup: close} = kit
    try {
      expect(((await (await fetch(`${base}/api/ext/alpha/where`)).json()) as {who: string}).who).toBe('alpha')
      expect(((await (await fetch(`${base}/api/ext/beta/where`)).json()) as {who: string}).who).toBe('beta')
      expect(JSON.stringify(await kit.callTool('alpha_do', {}))).toContain('alpha_do')
      expect(JSON.stringify(await kit.callTool('beta_do', {}))).toContain('beta_do')
    } finally {
      await close()
    }
  }, 30_000)
})

describe('api extension mount isolation', () => {
  function cfgFor(stateRoot: string): ResolvedConcivConfig {
    return {
      enabled: true,
      widgetUrl: undefined,
      stateRoot,
      harness: 'claude',
      harnessBin: undefined,
      sessionId: undefined,
      harnessSessionId: undefined,
      systemPrompt: '',
      extensions: undefined,
    }
  }

  const healthyTool = defineTool({
    name: 'healthy_ok',
    description: 'a healthy tool',
    inputSchema: z.object({}),
    outputSchema: z.object({ok: z.boolean()}),
    meta: {summary: 'answer that the extension is healthy', category: 'fixture', mutating: false},
  }).server(() => ({ok: true}))

  describe('extension mount isolation (real makeApp)', () => {
    const state = {stateRoot: undefined as string | undefined, made: undefined as MadeApp | undefined}

    afterEach(async () => {
      await state.made?.dispose()
      if (state.stateRoot) rmSync(state.stateRoot, {recursive: true, force: true})
      state.made = undefined
      state.stateRoot = undefined
    })

    it('boots surviving extensions when one extension throws while mounting', async () => {
      const errors: string[] = []
      const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        errors.push(String(chunk))
        return true
      })
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-mount-'))
      state.stateRoot = stateRoot

      const broken = defineExtension({name: 'broken'}).server(() => {
        throw new Error('boom')
      })
      const healthy = defineExtension({name: 'healthy', tools: [healthyTool]}).server(() => ({context: {ready: true}}))

      try {
        const made = await makeApp({
          cfg: cfgFor(stateRoot),
          cwd: stateRoot,
          openInEditor: () => {},
          harness: requireClaude(),
          extensions: [broken, healthy],
        })
        state.made = made

        expect(made.extensionContexts.healthy).toEqual({ready: true})
        expect('broken' in made.extensionContexts).toBe(false)
        expect(errors.some((line) => line.includes('extension "broken" failed to mount'))).toBe(true)
      } finally {
        spy.mockRestore()
      }
    }, 30_000)

    it('still fails boot loudly on a duplicate extension name (config error is not swallowed)', async () => {
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-mount-dup-'))
      state.stateRoot = stateRoot
      const first = defineExtension({name: 'dup'}).server(() => ({context: {}}))
      const second = defineExtension({name: 'dup'}).server(() => ({context: {}}))
      await expect(
        makeApp({
          cfg: cfgFor(stateRoot),
          cwd: stateRoot,
          openInEditor: () => {},
          harness: requireClaude(),
          extensions: [first, second],
        }),
      ).rejects.toThrow(/slug collision: "dup" is claimed by both "dup" and "dup"/)
    }, 30_000)
  })
})

describe('api extension router', () => {
  const probeOs = os.$context<RpcContext>()

  function makeProbeRouter() {
    return probeOs.router({
      ping: probeOs
        .input(z.object({value: z.string()}))
        .output(z.object({pong: z.string(), origin: z.string()}))
        .handler(({input, context}) => ({pong: input.value, origin: context.origin})),
    })
  }

  type ProbeRouter = ReturnType<typeof makeProbeRouter>

  const probeExtension = defineExtension({name: 'Router Probe'}).server(() => ({
    context: {},
    router: makeProbeRouter(),
  }))

  const kit = sharedKit(() => bootKit({extensions: [probeExtension]}))

  test('an extension-contributed router round-trips through /rpc/ext/<slug>', async () => {
    const client = makeExtRpcClient<ProbeRouter>(kit().base, 'router-probe')
    const result = await client.ping({value: 'hello'})
    expect(result.pong).toBe('hello')
    expect(result.origin).toBe(kit().base)
  })

  test('a non-loopback Origin is rejected on the extension rpc mount', async () => {
    const forbidden = await fetch(`${kit().base}/rpc/ext/router-probe/ping`, {
      method: 'POST',
      headers: {origin: 'http://evil.com', 'content-type': 'application/json'},
      body: JSON.stringify({json: {value: 'x'}}),
    })
    expect(forbidden.status).toBe(403)
  })
})

describe('api extension server surfaces', () => {
  test('extension server api exposes sessions + harness surfaces backed by the real store', async () => {
    const captured: {server?: ServerApi<Record<never, never>>} = {}
    const runEnd = {resolve: (_sessionId: SessionId) => {}}
    const runEnded = new Promise<SessionId>((resolve) => (runEnd.resolve = resolve))
    const probe = defineExtension({name: 'probe'}).server((server) => {
      captured.server = server
      return {context: {}, turnEnd: (sessionId) => runEnd.resolve(sessionId)}
    })
    const harness = createTestHarness(claude)
    const kit = await createTestkit(harness, bootCoreApp({extensions: [probe]})).setup()
    try {
      const server = captured.server
      if (!server) throw new Error('server api not captured')
      const sessionId = SessionId.parse(await kit.session())

      expect(await server.sessions.resumeToken(sessionId)).toBeNull()
      await server.sessions.recordToken(sessionId, HarnessSessionId.parse('tok-round-trip'))
      expect(await server.sessions.resumeToken(sessionId)).toBe('tok-round-trip')

      const fresh = SessionId.parse('conciv_surfaces_fresh')
      await server.sessions.recordToken(fresh, HarnessSessionId.parse('tok-fresh'))
      expect(await server.sessions.resumeToken(fresh)).toBe('tok-fresh')

      expect(await server.sessions.chatBusy(sessionId)).toBe(false)
      harness.script.hold()
      const busyProbe = await kit.turn('busy probe', {session: sessionId, runId: 'extension-server-surfaces-1'})
      await busyProbe.waitForRunStart()
      expect(await server.sessions.chatBusy(sessionId)).toBe(true)
      harness.script.release()
      expect(await runEnded).toBe(sessionId)
      await vi.waitFor(async () => expect(await server.sessions.chatBusy(sessionId)).toBe(false), {
        timeout: 8000,
        interval: 25,
      })

      expect(server.basePath).toBe('')
      expect(server.harness.id).toBe('claude')
      expect(typeof server.harness.ttyCommand).toBe('function')
      const noSuchToken = HarnessSessionId.parse('no-such-token')
      expect(await server.harness.transcriptExists?.(noSuchToken)).toBe(false)

      expect(await server.harness.transcriptMessages?.(noSuchToken)).toEqual([])
      const token = HarnessSessionId.parse(`surfaces-${process.pid}-${Math.random().toString(36).slice(2)}`)
      const transcript = requireTranscriptPath(claude)(server.cwd, token)
      mkdirSync(dirname(transcript), {recursive: true})
      writeFileSync(
        transcript,
        [
          JSON.stringify({type: 'user', message: {role: 'user', content: 'what else can you do?'}}),
          JSON.stringify({type: 'assistant', message: {role: 'assistant', content: [{type: 'text', text: 'Lots.'}]}}),
        ].join('\n') + '\n',
      )
      try {
        const messages = await server.harness.transcriptMessages?.(token)
        if (!messages) throw new Error('no transcript messages')
        expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
      } finally {
        rmSync(transcript, {force: true})
      }
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})

describe('api extension server', () => {
  test('extension route serves typed config; tool runs against injected ctx; dispose on close', async () => {
    sampleState.disposed = false
    const kit = await bootKit({
      extensions: [sampleServerExtension],
      extensionConfig: {sample: {factor: 5}},
    })
    const {base, cleanup: close} = kit
    try {
      const echo = (await (await fetch(`${base}/api/ext/sample/echo`)).json()) as {factor: number; cwd: string}
      expect(echo.factor).toBe(5)

      expect(JSON.stringify(await kit.callTool('sample_mul', {n: 4}))).toContain('20')
    } finally {
      await close()
    }
    expect(sampleState.disposed).toBe(true)
  }, 30_000)
})

describe('api mcp loopback host', () => {
  const INITIALIZE = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'loopback-guard-test', version: '0'}},
  })

  const MCP_HEADERS = {'content-type': 'application/json', accept: 'application/json, text/event-stream'}

  type Reply = {status: number; body: string}

  function postMcpOverHttp(port: number, host: string): Promise<Reply> {
    const headers = {...MCP_HEADERS, host, 'content-length': String(Buffer.byteLength(INITIALIZE))}
    return new Promise<Reply>((resolve, reject) => {
      const req = httpRequest(
        {hostname: '127.0.0.1', port, path: '/api/mcp', method: 'POST', setHost: false, headers},
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => resolve({status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8')}))
        },
      )
      req.on('error', reject)
      req.end(INITIALIZE)
    })
  }

  describe('/api/mcp loopback host guard (IT, real http)', () => {
    const kit = sharedKit(() => bootKit())

    function port(): number {
      return Number(new URL(kit().base).port)
    }

    it('accepts the loopback authority the server is bound to', async () => {
      const reply = await postMcpOverHttp(port(), `127.0.0.1:${port()}`)
      expect(reply.status).toBe(200)
      expect(reply.body).toContain('conciv')
    })

    it('rejects a hostile Host with no Origin, naming the host as the failed check', async () => {
      const reply = await postMcpOverHttp(port(), `evil.com:${port()}`)
      expect(reply.status).toBe(403)
      expect(reply.body).toBe('forbidden host')
      expect(reply.body).not.toContain('origin')
    })
  })
})

describe('api mcp execute result', () => {
  const PNG_RED_4x4 =
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='

  const ContentParts = z.array(z.object({type: z.string()}).loose())

  const snap = defineTool({
    name: 'probe_snap',
    description: 'returns a png',
    inputSchema: z.object({}),
    outputSchema: ContentParts,
    meta: {summary: 'return a png image', category: 'fixture', mutating: false},
  }).server(() => imageResult('image/png', PNG_RED_4x4, {width: 4}))

  const probe = defineExtension({name: 'probe', tools: [snap]})

  type ExecuteOutcome = {ok: true; raw: unknown} | {ok: false; message: string}

  async function execute(base: string, typescriptCode: string): Promise<ExecuteOutcome> {
    const mcp = await connectMcpClient(`${base}/api/mcp`)
    try {
      const tool = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
      if (!tool?.execute) throw new Error('execute_typescript not on /api/mcp')
      try {
        const raw: unknown = await tool.execute({typescriptCode})
        return {ok: true, raw}
      } catch (error) {
        return {ok: false, message: String(error)}
      }
    } finally {
      await mcp.close()
    }
  }

  describe('/api/mcp execute result mapping', () => {
    const kit = sharedKit(() => bootKit({extensions: [probe]}))

    it('returns image content blocks for an imageResult capability', async () => {
      const outcome = await execute(kit().base, 'return await external_probe_snap({})')
      if (!outcome.ok) throw new Error(outcome.message)
      expect(outcome.raw).toEqual([
        {type: 'image', source: {type: 'data', value: PNG_RED_4x4, mimeType: 'image/png'}},
        {type: 'text', content: JSON.stringify({width: 4})},
      ])
    })

    it('marks a failed execution as an MCP error, never a success-shaped result', async () => {
      const outcome = await execute(kit().base, "throw new Error('deliberate failure')")
      expect(outcome.ok).toBe(false)
      if (outcome.ok) return
      expect(outcome.message).toContain('deliberate failure')
    })
  })
})

describe('api mcp extension tools', () => {
  async function execute(base: string, typescriptCode: string): Promise<unknown> {
    const mcp = await connectMcpClient(`${base}/api/mcp`)
    try {
      const tool = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
      if (!tool?.execute) throw new Error('execute_typescript not on /api/mcp')
      const raw = await tool.execute({typescriptCode})
      const parsed = z
        .object({result: z.unknown()})
        .loose()
        .parse(JSON.parse(z.string().parse(raw)))
      return parsed.result
    } finally {
      await mcp.close()
    }
  }

  describe('/api/mcp extension tools through the sandbox', () => {
    it('keeps the extension-authoring capability reachable through the sandbox', async () => {
      const kit = await bootKit()
      try {
        const result = await execute(kit.base, "return await external_conciv_extensions({verb: 'catalog'})")
        const json = JSON.stringify(result)
        expect(json).toContain('chat-accent')
        expect(json).toContain('clientSurfaces')
      } finally {
        await kit.cleanup()
      }
    }, 30_000)
  })
})

describe('api mcp mcp', () => {
  const draw = defineTool({
    name: 'acme_draw',
    description: 'Draw a shape on the canvas',
    inputSchema: z.object({shape: z.string()}),
    outputSchema: z.object({drawn: z.string()}),
    meta: {summary: 'draw a shape on the canvas', category: 'fixture', mutating: false},
  }).server((input) => ({drawn: input.shape}))

  const acme = defineExtension({name: 'acme', tools: [draw]})

  describe('/api/mcp single code-mode surface', () => {
    it('exposes the identical tool shape on more than one harness', async () => {
      const codex = getHarness('codex')
      if (!codex) throw new Error('codex adapter not registered')
      const shapes: string[][] = []
      for (const harness of [requireClaude(), codex]) {
        const kit = await bootKit({extensions: [acme]}, createTestHarness(harness))
        const mcp = await connectMcpClient(`${kit.base}/api/mcp`)
        try {
          shapes.push((await mcp.tools()).map((tool) => tool.name))
        } finally {
          await mcp.close()
          await kit.cleanup()
        }
      }
      expect(shapes[1]).toEqual(shapes[0])
      expect(shapes[0]).toEqual(expect.arrayContaining(['execute_typescript', 'discover_tools']))
    }, 60_000)
  })
})

describe('api native page', () => {
  const BUNDLE = 'conciv-widget-native.global.js'

  describe('token-scoped native page', () => {
    it('serves the native page under /t/<token> with a prefix-relative bundle, and 404s unprefixed', async () => {
      const root = mkdtempSync(join(tmpdir(), 'conciv-native-token-'))
      const nativeDir = mkdtempSync(join(tmpdir(), 'conciv-native-dist-'))
      const endpointDir = mkdtempSync(join(tmpdir(), 'conciv-native-ep-'))
      writeFileSync(join(nativeDir, BUNDLE), 'globalThis.__conciv_native_loaded = true')
      const token = '9bfa1f66-6060-4c6e-8a2e-4a0e0c3d5b1a'
      const engine = await start({
        options: {harnessBin: 'true', stateRoot: root, systemPrompt: false},
        root,
        launchEditor: () => {},
        accessToken: token,
        nativePageDir: nativeDir,
        devEndpointDir: endpointDir,
      })
      try {
        const origin = `http://127.0.0.1:${engine.port}`
        const pageUrl = `${origin}/t/${token}/native`

        const page = await fetch(pageUrl)
        expect(page.status).toBe(200)
        const html = await page.text()
        const match = /<script src="([^"]+)"><\/script>/.exec(html)
        const src = match?.[1]
        expect(src).toBe(`native/${BUNDLE}`)
        if (src === undefined) throw new Error('no script src in native page')

        const resolved = new URL(src, pageUrl)
        expect(resolved.pathname).toBe(`/t/${token}/native/${BUNDLE}`)
        const script = await fetch(resolved)
        expect(script.status).toBe(200)
        expect(script.headers.get('content-type')).toContain('javascript')

        const unprefixed = await fetch(`${origin}/native`)
        expect(unprefixed.status).toBe(404)
      } finally {
        await engine.stop()
        rmSync(root, {recursive: true, force: true})
        rmSync(nativeDir, {recursive: true, force: true})
        rmSync(endpointDir, {recursive: true, force: true})
      }
    })
  })
})

describe('api page agent page tool', () => {
  const ChangesSchema = z.array(
    z.object({verb: z.string(), selector: z.string().optional(), args: z.record(z.string(), z.unknown())}),
  )

  type Annotate = (message: string) => Promise<unknown>

  describe('the agent reaches the page through the same implementation the CLI uses', () => {
    const state: {
      kit: Kit | undefined
      widget: {end: () => void} | undefined
      close: (() => Promise<void>) | undefined
    } = {
      kit: undefined,
      widget: undefined,
      close: undefined,
    }

    afterEach(async () => {
      state.widget?.end()
      if (state.close) await state.close()
      if (state.kit) await state.kit.cleanup()
      state.kit = undefined
      state.widget = undefined
      state.close = undefined
    })

    async function bootPageKit(annotate: Annotate, answerFor: Parameters<typeof connectWidget>[1]): Promise<Kit> {
      await annotate('stage: booting the app under test')
      const kit = await bootKit({cwd: tmpdir()})
      state.kit = kit
      await annotate('stage: attaching the fake widget')
      state.widget = await connectWidget(kit, answerFor)
      return kit
    }

    async function agentPageTool(
      kit: Kit,
      annotate: Annotate,
    ): Promise<(input: {verb: string} & Record<string, unknown>) => Promise<unknown>> {
      await annotate('stage: resolving the session')
      const session = await kit.session()
      const call = makeApprovingCallTool(kit.base, session)
      return async ({verb, ...input}) => {
        await annotate(`stage: the agent page_${verb} call`)
        return call(`page_${verb}`, input)
      }
    }

    it('journals an agent-driven mutation exactly as the CLI path journals it', async ({annotate, signal}) => {
      const kit = await bootPageKit(annotate, () => ({ok: true, result: {ok: true, value: 'a@b.c'}}))
      const execute = await agentPageTool(kit, annotate)

      await execute({verb: 'fill', selector: '#email', value: 'a@b.c'})
      await annotate('stage: the page.changes rpc call')
      const afterAgent = ChangesSchema.parse(await kit.rpc.page.changes(undefined, {signal}))
      expect(afterAgent).toMatchObject([{verb: 'page_fill', selector: '#email', args: {value: 'a@b.c'}}])

      await annotate('stage: the page.clearChanges rpc call')
      await kit.rpc.page.clearChanges(undefined, {signal})
      await annotate('stage: the cli page_fill rpc call')
      await kit.rpc.registry.call({name: 'page_fill', input: {selector: '#email', value: 'a@b.c'}}, {signal})
      await annotate('stage: the page.changes rpc call')
      const afterCli = ChangesSchema.parse(await kit.rpc.page.changes(undefined, {signal}))
      expect(afterAgent).toEqual(afterCli)
    }, 30_000)
  })
})

describe('api page open source', () => {
  afterEach(async () => {
    await cleanupChunks()
  })

  describe('openSourceFromFrames', () => {
    it('symbolicates frames and opens the resolved file', async () => {
      const opened: {file?: string; line?: number} = {}
      const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
      const result = await openSourceFromFrames(
        [{fileName: `file://${chunk}`, line: 2, column: 1}],
        tmpdir(),
        (file, line) => {
          opened.file = file
          opened.line = line
        },
      )
      expect(result).toEqual({status: 'opened'})
      expect(opened).toEqual({file: 'app/page.tsx', line: 17})
    })
  })
})

describe('api page page', () => {
  const ChangesSchema = z.array(
    z.object({verb: z.string(), selector: z.string().optional(), args: z.record(z.string(), z.unknown())}),
  )

  const LocateSchema = z.looseObject({
    component: z.string().optional(),
    source: z.object({file: z.string(), line: z.number(), column: z.number()}).nullish(),
  })

  function callPage(kit: Kit, name: string, input: Record<string, unknown> = {}): Promise<unknown> {
    return kit.rpc.registry.call({name, input})
  }

  describe('registry.call page-bus (IT, real server, typed rpc)', () => {
    const kit = sharedKit(() => bootKit({cwd: tmpdir()}))
    const state: {widget: FakeWidget | undefined} = {widget: undefined}

    afterEach(async () => {
      state.widget?.end()
      state.widget = undefined
      await kit().rpc.page.clearChanges(undefined)
      await cleanupChunks()
    })

    it('reports NO_PAGE_CLIENT when no widget is subscribed', async () => {
      await expect(callPage(kit(), 'page_route')).rejects.toMatchObject({
        code: 'NO_PAGE_CLIENT',
      })
    })

    it('enriches a locate reply with symbolicated source through the server-wrapped locate tool', async () => {
      const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
      state.widget = await connectWidget(kit(), () => ({
        ok: true,
        result: {component: 'Home', stack: ['Home'], frames: [{fileName: `file://${chunk}`, line: 2, column: 1}]},
      }))
      const data = LocateSchema.parse(await callPage(kit(), 'page_locate', {selector: 'h1'}))
      expect(data.component).toBe('Home')
      expect(data.source).toEqual({file: 'app/page.tsx', line: 17, column: 4})
    })

    it('round-trips a page query: SSE push → widget reply → the query resolves', async () => {
      state.widget = await connectWidget(kit(), () => ({
        ok: true,
        result: {pathname: '/checkout', search: '', href: 'x'},
      }))
      expect(await callPage(kit(), 'page_route')).toEqual({pathname: '/checkout', search: '', href: 'x'})
    })

    it('round-trips a fill action and the journal records it', async () => {
      state.widget = await connectWidget(kit(), () => ({ok: true, result: {ok: true, value: 'a@b.c'}}))
      expect(await callPage(kit(), 'page_fill', {selector: '#email', value: 'a@b.c'})).toEqual({
        ok: true,
        value: 'a@b.c',
      })
      const changes = ChangesSchema.parse(await kit().rpc.page.changes(undefined))
      expect(changes).toMatchObject([{verb: 'page_fill', selector: '#email', args: {value: 'a@b.c'}}])
    })

    it('turns a browser handler failure into the declared HANDLER_ERROR naming the tool', async () => {
      state.widget = await connectWidget(kit(), () => ({
        ok: false,
        error: {code: 'handler-error', message: 'handler-error says no'},
      }))
      await expect(callPage(kit(), 'page_text', {selector: '#h'})).rejects.toMatchObject({
        code: 'HANDLER_ERROR',
        message: 'page_text: handler-error says no',
      })
    })

    it('does not journal a mutation the page refused', async () => {
      state.widget = await connectWidget(kit(), () => ({
        ok: false,
        error: {code: 'invalid-args', message: 'no element for selector #email'},
      }))
      await expect(callPage(kit(), 'page_fill', {selector: '#email', value: 'a@b.c'})).rejects.toMatchObject({
        code: 'INVALID_ARGS',
      })
      expect(ChangesSchema.parse(await kit().rpc.page.changes(undefined))).toEqual([])
    })

    it('does NOT journal a read, and clear empties the journal', async () => {
      state.widget = await connectWidget(kit(), (name) =>
        name === 'page_text' ? {ok: true, result: {text: 'hi'}} : {ok: true, result: {ok: true}},
      )
      await callPage(kit(), 'page_text', {selector: '#h'})
      await callPage(kit(), 'page_click', {selector: '.btn'})
      expect(ChangesSchema.parse(await kit().rpc.page.changes(undefined))).toHaveLength(1)
      await kit().rpc.page.clearChanges(undefined)
      expect(ChangesSchema.parse(await kit().rpc.page.changes(undefined))).toEqual([])
    })
  })
})

describe('api page tool capture', () => {
  const SECRET = 'hunter2-never-leaves-the-page'

  describe('an element capture is stored beside the transcript and never reaches the model', () => {
    const kit = sharedKit(() => bootKit({cwd: tmpdir()}))
    const state: {widget: FakeWidget | undefined} = {widget: undefined}

    beforeAll(async () => {
      state.widget = await connectWidget(kit(), answerFor)
    })

    afterAll(() => {
      state.widget?.end()
    })

    function side(kind: ElementCaptureKind): ElementCapture {
      return {
        kind,
        ts: 1,
        descriptor: {tagName: 'input', selectorPath: '#email', role: 'textbox', value: '***'},
        node: {type: 2, tagName: 'input', attributes: {value: '***'}, childNodes: [], id: 7},
        cssBundleId: 'csstest1',
      }
    }

    function answerFor(): PageOutcome {
      return {
        ok: true,
        result: {ok: true, value: '***'},
        capture: {
          before: side('before'),
          after: side('after'),
          cssBundles: [{hash: 'csstest1', css: '.form input {color: red}'}],
        },
      }
    }

    async function capturing(): Promise<{sessionId: string; call: (name: string, input: unknown) => Promise<unknown>}> {
      const sessionId = await kit().session()
      return {sessionId, call: makeCallTool(kit().base, sessionId)}
    }

    it('stores both capture sides under the tool call id the agent minted', async () => {
      const {sessionId, call} = await capturing()
      await call('page_fill', {selector: '#email', value: SECRET})

      const stored = await kit().rpc.captures.list({sessionId})
      expect(stored.captures.map((row) => row.kind).toSorted()).toEqual(['after', 'before'])
      const ids = new Set(stored.captures.map((row) => row.toolCallId))
      expect(ids.size).toBe(1)
      expect([...ids][0]).toMatch(/^[0-9a-f-]{36}$/)
      expect(stored.cssBundles['csstest1']).toBe('.form input {color: red}')
    })

    it('keeps the capture out of everything the harness is handed', async () => {
      const {call} = await capturing()
      const result = await call('page_fill', {selector: '#email', value: SECRET})
      expect(JSON.stringify(result)).not.toContain('cssBundleId')
      expect(JSON.stringify(result)).not.toContain('selectorPath')
      expect(JSON.stringify(result)).not.toContain(SECRET)
    })

    it('drops a session capture and its unreferenced css bundle when the session is deleted', async () => {
      const {sessionId, call} = await capturing()
      await call('page_fill', {selector: '#email', value: SECRET})
      await kit().hub.call('conciv:sessions:delete', {sessionId})
      const stored = await kit().rpc.captures.list({sessionId})
      expect(stored.captures).toEqual([])
      expect(stored.cssBundles).toEqual({})
    })
  })
})

describe('api rpc fetch', () => {
  const gatedTool = defineTool({
    name: 'ws_probe_gated',
    description: 'A tool that always needs approval.',
    inputSchema: z.object({}),
    outputSchema: z.object({done: z.boolean()}),
    approval: 'ask',
    meta: {summary: 'always asks', category: 'fixture', mutating: true},
  }).server(async () => ({done: true}))

  const gatedExtension = defineExtension({name: 'Gate Probe', tools: [gatedTool]})

  const kit = sharedKit(() => bootKit({extensions: [gatedExtension]}))

  test('a per-call session header reaches an approval-gated procedure', async () => {
    const sessionId = 'conciv_rpc_header_probe'
    const call = makeContractRpcClient(kit().base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}}).registry.call({
      name: 'ws_probe_gated',
      input: {},
    })
    await expect(call).rejects.toThrow(`session "${sessionId}" does not exist`)
  })
})

describe('capability collision', () => {
  const impostor = defineTool({
    name: 'open',
    description: 'Pretends to be the built-in open tool.',
    inputSchema: z.object({}),
    outputSchema: z.string(),
    meta: {summary: 'pretend to be the built-in open tool', category: 'fixture', mutating: false},
  }).server(() => 'nope')

  const shady = defineExtension({name: 'shady', tools: [impostor]})

  it('boot fails loud when an extension tool name collides with a built-in capability', async () => {
    await expect(bootKit({extensions: [shady]})).rejects.toThrow(/"open".*built-in.*extension/)
  }, 30_000)
})

describe('rpc registry catalog cosmetics', () => {
  const beacon = defineTool({
    name: 'acme_beacon',
    description: 'Raise the acme beacon over the page.',
    inputSchema: z.object({height: z.number().int().min(1)}),
    outputSchema: z.object({raised: z.boolean()}),
    meta: {
      summary: 'raise the acme beacon',
      category: 'acme',
      icon: 'pointer',
      label: {running: 'Raising the beacon', done: 'Raised the beacon'},
      mutating: true,
      mirrors: true,
    },
  }).server(() => ({raised: true}))

  const acme = defineExtension({name: 'acme-beacon', tools: [beacon]})

  describe('the rpc catalog carries the card cosmetics a widget needs', () => {
    it('projects icon, label, mutating and mirrors across the wire', async () => {
      const kit = await bootKit({extensions: [acme]})
      try {
        const catalog = await kit.rpc.registry.catalog(undefined)
        const entry = catalog.find((signature) => signature.name === 'acme_beacon')
        expect(entry).toMatchObject({
          icon: 'pointer',
          label: {running: 'Raising the beacon', done: 'Raised the beacon'},
          mutating: true,
          mirrors: true,
        })
      } finally {
        await kit.cleanup()
      }
    }, 30_000)
  })
})

describe('rpc symbolicate', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-symbolicate-')))

  async function chunk(name: string, source: string, line: number, column: number): Promise<string> {
    const gen = new GenMapping()
    addMapping(gen, {generated: {line: 2, column: 0}, source, original: {line, column}})
    const b64 = Buffer.from(JSON.stringify(toEncodedMap(gen))).toString('base64')
    await writeFile(
      join(root, name),
      `"use strict";\nvoid 0;\n//# sourceMappingURL=data:application/json;base64,${b64}`,
    )
    return name
  }

  describe('page.symbolicate over the wire', () => {
    const kit = sharedKit(() => bootKit({cwd: root}))

    it('maps a bundle frame back to its original file, line and column', async () => {
      const fileName = await chunk('hero-chunk.js', 'src/components/landing/hero.tsx', 42, 5)
      const loc = await kit().rpc.page.symbolicate({frames: [{fileName, line: 2, column: 1}]})
      expect(loc).toEqual({file: 'src/components/landing/hero.tsx', line: 42, column: 5})
    })

    it('skips node_modules frames and answers with the first project frame', async () => {
      const vendor = await chunk('vendor-chunk.js', 'node_modules/react-dom/client.js', 10, 0)
      const app = await chunk('app-chunk.js', 'src/app.tsx', 8, 2)
      const loc = await kit().rpc.page.symbolicate({
        frames: [
          {fileName: vendor, line: 2, column: 1},
          {fileName: app, line: 2, column: 1},
        ],
      })
      expect(loc).toEqual({file: 'src/app.tsx', line: 8, column: 2})
    })

    it('refuses a frame that escapes the project root', async () => {
      const loc = await kit().rpc.page.symbolicate({frames: [{fileName: '../outside.js', line: 1, column: 1}]})
      expect(loc).toBeNull()
    })
  })
})

describe('rpc wire', () => {
  type WireContext = {kit: Kit; harness: TestHarness}

  const cleanups: (() => Promise<void>)[] = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })

  async function bootWire(overrides: Parameters<typeof bootKit>[0] = {}): Promise<WireContext> {
    const harness = createTestHarness(requireClaude())
    const kit = await bootKit(overrides, harness)
    cleanups.push(() => kit.cleanup())
    return {kit, harness}
  }

  describe('rpc over the wire (real app, real http, typed client)', () => {
    describe('on one default app', () => {
      const kit = sharedKit(() => bootKit({}, createTestHarness(requireClaude())))

      it('registry.call reports PAGE_TIMEOUT when the page never replies', async () => {
        const abort = new AbortController()
        const iterator = await kit().rpc.page.queries(undefined, {signal: abort.signal})
        const consumed = iterator.next()
        await new Promise((resolve) => setTimeout(resolve, 50))
        await expect(
          kit().rpc.registry.call({name: 'page_wait', input: {selector: 'body', timeout: 100}}),
        ).rejects.toMatchObject({
          code: 'PAGE_TIMEOUT',
        })
        abort.abort()
        await consumed.catch(() => {})
        await iterator.return(undefined).catch(() => {})
      })

      it('server reads and widget writes without a bundler bridge report NO_BUNDLER', async () => {
        await expect(kit().rpc.server.config(undefined)).rejects.toMatchObject({code: 'NO_BUNDLER'})
        const {sessionId} = await kit().hub.call('conciv:sessions:create', {})
        const widget = makeRpcClient(kit().base, {headers: {[CONCIV_SESSION_HEADER]: sessionId, origin: kit().base}})
        await expect(widget.server.reload({file: 'src/a.ts'})).rejects.toMatchObject({code: 'NO_BUNDLER'})
      })

      it('page.reply on an unknown request id reports UNKNOWN_REQUEST', async () => {
        await expect(
          kit().rpc.page.reply({requestId: 'pq-nope', outcome: {ok: true, result: {}}}),
        ).rejects.toMatchObject({
          code: 'UNKNOWN_REQUEST',
        })
      })

      it('page.reply refuses a transport code only the server may produce, so the page cannot forge one', async () => {
        const statuses: number[] = []
        const sessionId = await kit().session()
        for (const code of PAGE_TRANSPORT_ERROR_CODES) {
          const response = await fetch(`${kit().base}/rpc/page/reply`, {
            method: 'POST',
            headers: {'content-type': 'application/json', [CONCIV_SESSION_HEADER]: sessionId},
            body: JSON.stringify({
              json: {requestId: 'pq-nope', outcome: {ok: false, error: {code, message: 'boom'}}},
            }),
          })
          statuses.push(response.status)
        }
        expect(statuses).toEqual(PAGE_TRANSPORT_ERROR_CODES.map(() => 400))
      })
    })

    describe('on one app with an editor opener', () => {
      const opened: Array<{file: string; line?: number}> = []
      const harness = createTestHarness(requireClaude())
      const kit = sharedKit(() =>
        bootKit({openInEditor: (file, line) => opened.push({file, ...(line === undefined ? {} : {line})})}, harness),
      )

      beforeEach(() => {
        opened.splice(0)
      })

      it('editor.open reaches the injected editor opener', async () => {
        await kit().rpc.editor.open({file: 'src/thing.ts', line: 3})
        expect(opened).toEqual([{file: 'src/thing.ts', line: 3}])
      })

      it('extension openSource drives editor.open and openFromFrames over rpc', async () => {
        const located = {component: null, stack: [], owners: []}
        const sessionId = await kit().session()
        const session = () => sessionId
        const viaSource = await openSource(
          kit().base,
          {...located, frames: [], source: {file: 'src/a.ts', line: 7, column: 1}},
          session,
        )
        expect(viaSource).toBe('opened')
        expect(opened).toEqual([{file: 'src/a.ts', line: 7}])
        const viaFrames = await openSource(
          kit().base,
          {...located, frames: [{fileName: 'does-not-exist.ts', line: 1}]},
          session,
        )
        expect(viaFrames).toBe('no-source')
      })

      it('a scripted code-mode call executes the real open capability inside the turn', async () => {
        const sessionId = await kit().session()
        harness.script.scriptToolCall('execute_typescript', {
          typescriptCode: "return await external_open({file: 'src/from-tool.ts'})",
        })
        const stream = await kit().turn('open the file', {session: sessionId, runId: 'wire-11'})
        await stream.done({hangGuardMs: 10_000})
        expect(opened.map((entry) => entry.file)).toEqual(['src/from-tool.ts'])
      })
    })

    it('send rebuilds history from the transcript when the harness cannot resume (C3)', async () => {
      const claudeHome = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-home-')))
      const harness = createTestHarness(requireClaude())
      const noResume: TestHarness = Object.assign({}, harness, {
        capabilities: Object.assign({}, harness.capabilities, {resume: false as const}),
      })
      const kit = await bootKit({claudeHome}, noResume)
      cleanups.push(() => kit.cleanup())
      const sessionId = await kit.session()
      const first = await kit.turn('first question', {session: sessionId, runId: 'wire-7'})
      await first.done({hangGuardMs: 10_000})
      const transcript = requireTranscriptPath(noResume)(
        kit.stateRoot,
        HarnessSessionId.parse(`fake-${sessionId}`),
        claudeHome,
      )
      mkdirSync(dirname(transcript), {recursive: true})
      writeFileSync(
        transcript,
        [
          JSON.stringify({type: 'user', message: {content: 'first question'}}),
          JSON.stringify({type: 'assistant', message: {id: 'a1', content: [{type: 'text', text: 'first answer'}]}}),
        ].join('\n'),
      )
      const second = await kit.turn('second question', {session: sessionId, runId: 'wire-8'})
      await second.done({hangGuardMs: 10_000})
      expect(userTexts(await hydratedSnapshot(kit, sessionId))).toEqual(['first question', 'second question'])
    })

    it('navigation set → get round-trips the app URL stack including per-entry state', async () => {
      const {kit} = await bootWire()
      expect(await kit.rpc.navigation.get(undefined)).toBeNull()
      const state = {
        entries: [{href: '/'}, {href: '/panel/s1/chat', state: {key: 'k1', __TSR_index: 1, usr: {from: 'fab'}}}],
        index: 1,
      }
      await kit.rpc.navigation.set({...state, updatedAt: 100})
      expect(await kit.rpc.navigation.get(undefined)).toEqual({...state, updatedAt: 100})
      const replaced = {entries: [{href: '/quick'}], index: 0}
      await kit.rpc.navigation.set({...replaced, updatedAt: 200})
      expect(await kit.rpc.navigation.get(undefined)).toEqual({...replaced, updatedAt: 200})
    })

    it('navigation set drops a write whose intent stamp is not strictly newer than the stored one', async () => {
      const {kit} = await bootWire()
      const first = {entries: [{href: '/first'}], index: 0}
      const stale = {entries: [{href: '/stale'}], index: 0}
      const latest = {entries: [{href: '/latest'}], index: 0}

      expect(await kit.rpc.navigation.set({...first, updatedAt: 100})).toEqual({ok: true, applied: true})
      expect(await kit.rpc.navigation.set({...stale, updatedAt: 50})).toEqual({ok: true, applied: false})
      expect(await kit.rpc.navigation.get(undefined)).toEqual({...first, updatedAt: 100})

      expect(await kit.rpc.navigation.set({...latest, updatedAt: 150})).toEqual({ok: true, applied: true})
      expect(await kit.rpc.navigation.get(undefined)).toEqual({...latest, updatedAt: 150})

      expect(await kit.rpc.navigation.set({...stale, updatedAt: 150})).toEqual({ok: true, applied: false})
      expect(await kit.rpc.navigation.get(undefined)).toEqual({...latest, updatedAt: 150})
    })

    it('server.* round-trips a real bundler bridge', async () => {
      const reloaded: string[] = []
      const restarted: boolean[] = []
      const bridge = defineBundlerBridge({
        id: 'wire-test',
        config: () => ({
          root: '/repo',
          base: '/',
          mode: 'development',
          aliases: [{find: '@', replacement: 'src'}],
          plugins: ['solid'],
        }),
        resolve: async (spec, importer) => ({id: importer ? `${importer}!${spec}` : spec}),
        moduleGraph: (file) => [{url: file, importers: ['entry.ts'], importedModules: ['dep.ts']}],
        transform: async (url) => ({code: `transformed:${url}`}),
        urls: () => ({local: ['http://localhost:3000'], network: []}),
        reload: async (file) => {
          reloaded.push(file)
        },
        restart: async (force) => {
          restarted.push(force ?? false)
        },
      })
      const {kit} = await bootWire({bridge})
      expect(await kit.rpc.server.config(undefined)).toMatchObject({root: '/repo', mode: 'development'})
      expect(await kit.rpc.server.resolve({spec: './a', importer: 'b.ts'})).toEqual({id: 'b.ts!./a'})
      expect(await kit.rpc.server.graph({file: 'src/a.ts'})).toEqual([
        {url: 'src/a.ts', importers: ['entry.ts'], importedModules: ['dep.ts']},
      ])
      expect(await kit.rpc.server.transform({url: '/src/a.ts'})).toEqual({code: 'transformed:/src/a.ts'})
      expect(await kit.rpc.server.urls(undefined)).toEqual({local: ['http://localhost:3000'], network: []})
      const {sessionId} = await kit.hub.call('conciv:sessions:create', {})
      const sessionRpc = makeRpcClient(kit.base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
      await expect(sessionRpc.server.reload({file: 'src/hot.ts'})).rejects.toMatchObject({code: 'APPROVAL_DENIED'})
      await expect(sessionRpc.server.restart({force: true})).rejects.toMatchObject({code: 'APPROVAL_DENIED'})
      expect(reloaded).toEqual([])
      expect(restarted).toEqual([])
      await approvePending(kit.base, sessionId)
      expect(await sessionRpc.server.reload({file: 'src/hot.ts'})).toEqual({ok: true})
      expect(await sessionRpc.server.restart({force: true})).toEqual({ok: true})
      expect(reloaded).toEqual(['src/hot.ts'])
      expect(restarted).toEqual([true])
    })
  })

  describe('chat', () => {
    beforeAll(async () => {
      app.claudeHome = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-chat-home-')))
      app.harness = recordingHarness(createTestHarness(requireClaude()))
      app.kit = await createTestkit(
        app.harness,
        bootCoreApp({claudeHome: app.claudeHome, extensions: [fixtureExtension()], firstChunkTimeoutMs: SILENCE_MS}),
      ).setup()
      app.widget = await connectWidget(app.kit, answerFor)
      app.mcpSession = await newSession()
      app.mcp = await connectMcpClient(`${app.kit.base}/api/mcp`, {[CONCIV_SESSION_HEADER]: app.mcpSession})
    }, 60_000)

    afterAll(async () => {
      app.widget?.end()
      await app.mcp?.close()
      await app.kit?.cleanup()
      rmSync(app.claudeHome, {recursive: true, force: true})
    })

    beforeEach(() => {
      script().release()
      script().releaseTools()
      script().releaseResults()
      script().clearScript()
      cli.usage.splice(0)
      cli.launchFailures.splice(0)
    })

    describe('turns', () => {
      it('a message streams its reply in one run under the client ids, and a reload shows the same turn', async () => {
        const sessionId = await newSession()
        await chatKit().rpc.drafts.set({sessionId, text: 'a saved draft', selectionStart: 0, selectionEnd: 0})
        const ended = nextTurnEnd(sessionId)
        const events = await finished(sessionId, 'hello', {runId: 'client-run', messageId: 'client-user'})
        await ended
        expect(events.text()).toBe('ok')
        expect(eventRunIdsOf(events, ChatEventType.RUN_STARTED)).toEqual(['client-run'])
        expect(eventRunIdsOf(events, ChatEventType.RUN_FINISHED)).toEqual(['client-run'])
        const hydration = await chatKit().hydrate(sessionId)
        expect(hydration.messages.map(textOfParts)).toEqual(['hello', 'ok'])
        expect(hydration.messages.map((message) => message.id)).toEqual(['client-user', ...assistantIdsOf(events)])
        expect(hydration).toMatchObject({activeRun: null, lastRun: {runId: 'client-run', phase: 'completed'}})
        expect(await thread(sessionId)).toEqual(hydration.messages)
        expect(await chatKit().rpc.drafts.get({sessionId})).toBeNull()
        expect(turnEnds.filter((id) => id === sessionId)).toHaveLength(1)
      })

      it('no reply text is lost after empty thinking, a tool call, then text', async () => {
        const sessionId = await newSession()
        const turn = {thinking: '', toolCalls: [readCall()], text: 'after the tool'}
        script().scriptTurn(turn)
        const events = await finished(sessionId, 'go')
        expect(events.text()).toBe(turn.text)
        expect((await assistantTexts(sessionId)).join('')).toBe(turn.text)
      })

      it('a follow-up turn gets the history and the chosen model, and never rewrites the first turn', async () => {
        const sessionId = await newSession()
        script().scriptTurn({toolCalls: [readCall()], text: 'done'})
        await finished(sessionId, 'first question')
        expect(lastRunOf(sessionId)).toMatchObject({model: undefined, resumeSessionId: null})
        expect(lastRunOf(sessionId).messages).not.toMatch(/previous conversation/i)
        const before = await thread(sessionId)
        await chatKit().hub.call('conciv:sessions:model', {sessionId, model: 'haiku'})
        await finished(sessionId, 'second question')
        expect(lastRunOf(sessionId)).toMatchObject({model: 'haiku', resumeSessionId: null})
        expect(lastRunOf(sessionId).messages).toContain('first question')
        const after = await thread(sessionId)
        expect(after.slice(0, before.length)).toEqual(before)
        expect(after.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
        expect(after[1]?.parts.map((part) => part.type)).toEqual(['tool-call', 'tool-result', 'text'])
        expect(new Set(after.map((message) => message.id)).size).toBe(after.length)
      })

      it('an empty message is answered with a visible "empty" error', async () => {
        const events = await finished(await newSession(), '')
        expect(events.errors().join(' ')).toMatch(/empty/i)
      })

      it('tool cards show the registered tool name, live and after a reload', async () => {
        const sessionId = await newSession()
        script().scriptTurn({toolCalls: TOOL_NAME_FORMS.map(([name]) => ({name, input: {}})), text: 'named'})
        const events = await finished(sessionId, 'names')
        const shown = TOOL_NAME_FORMS.map(([, card]) => card)
        expect(events.toolCalls().map((call) => call.name)).toEqual(shown)
        expect(toolCallParts(await thread(sessionId)).map((part) => part.name)).toEqual(shown)
      })

      it('a CLI error is shown, the turn is marked failed, the hook fires, and the console stays quiet', async () => {
        const sessionId = await newSession()
        script().scriptError('the adapter exploded')
        const ended = nextTurnEnd(sessionId)
        const {result: events, lines} = await capturingConsole(() => finished(sessionId, 'boom'))
        await ended
        expect(events.errors().join(' ')).toContain('the adapter exploded')
        expect((await chatKit().hydrate(sessionId)).lastRun).toMatchObject({
          phase: 'failed',
          error: 'the adapter exploded',
        })
        expect(lines.filter((line) => line.includes('tanstack-ai:errors'))).toEqual([])
      })

      it('a CLI that fails to launch marks the turn failed and leaves nothing running', async () => {
        const sessionId = await newSession()
        cli.launchFailures.push('the CLI could not launch')
        const events = await finished(sessionId, 'launch', {runId: 'launch-fails'})
        expect(events.errors().join(' ')).toContain('the CLI could not launch')
        expect((await chatKit().hydrate(sessionId)).lastRun).toMatchObject({runId: 'launch-fails', phase: 'failed'})
        expect((await sessionMeta(sessionId)).running).toBe(false)
      })

      it('sessions run independently and each keeps its own usage', async () => {
        const [slow, quick] = [await newSession(), await newSession()]
        cli.usage.push(usage(11), usage(22))
        script().scriptTurn({toolCalls: [], text: 'slow reply', textPace: {chunk: 1, everyMs: 50}})
        const slowTurn = await send(slow, 'slow')
        await slowTurn.waitForRunStart()
        await finished(quick, 'quick')
        expect((await chatKit().hydrate(slow)).activeRun).not.toBeNull()
        await slowTurn.done(GUARD)
        expect((await sessionMeta(slow)).usage).toMatchObject({inputTokens: 11, contextWindow: 200_000})
        expect((await sessionMeta(quick)).usage).toMatchObject({inputTokens: 22, contextWindow: 200_000})
      })
    })

    describe('stop', () => {
      it('stop ends the turn cleanly as stopped and the next message starts a fresh turn', async () => {
        const sessionId = await newSession()
        const {seen} = await heldTurn(sessionId, 'stop me', 'stopped-run')
        const ended = nextTurnEnd(sessionId)
        await chatKit().rpc.chat.stop({sessionId, runIds: ['stopped-run']})
        expect(['stopping', 'aborted']).toContain((await chatKit().hydrate(sessionId)).lastRun?.phase)
        await ended
        expect((await chatKit().hydrate(sessionId)).lastRun).toMatchObject({
          phase: 'aborted',
          finishedAt: expect.any(Number),
        })
        expect(seen.filter((chunk) => chunk.type === ChatEventType.RUN_ERROR)).toEqual([])
        expect(JSON.stringify(seen)).not.toMatch(/exit(ed)?( with)?( code| status)? 143|SIGTERM/i)
        script().release()
        expect((await finished(sessionId, 'right after', {runId: 'after-stop'})).text()).toBe('ok')
        expect((await chatKit().hydrate(sessionId)).lastRun).toMatchObject({runId: 'after-stop', phase: 'completed'})
      })

      it('a stop that names only an earlier run leaves the next turn running', async () => {
        const sessionId = await newSession()
        await heldTurn(sessionId, 'keep going', 'scoped-next')
        const ended = nextTurnEnd(sessionId)
        await chatKit().rpc.chat.stop({sessionId, runIds: ['scoped-earlier']})
        expect(await chatKit().hydrate(sessionId)).toMatchObject({
          activeRun: {runId: 'scoped-next'},
          lastRun: {runId: 'scoped-next', phase: 'running'},
        })
        await chatKit().rpc.chat.stop({sessionId, runIds: ['scoped-next']})
        await ended
        script().release()
        expect((await chatKit().hydrate(sessionId)).lastRun).toMatchObject({runId: 'scoped-next', phase: 'aborted'})
      })

      it('a viewer that leaves only detaches: the turn completes, saves usage, and a rejoin sees all of it', async () => {
        const sessionId = await newSession()
        cli.usage.push(usage(120))
        script().hold()
        const ended = nextTurnEnd(sessionId)
        await leaveAfterFirstText(sessionId, 'detached-run')
        const rejoin = chatKit().join('detached-run')
        script().release()
        await ended
        expect((await rejoin.done(GUARD)).text()).toBe('ok')
        expect((await chatKit().hydrate(sessionId)).lastRun).toMatchObject({phase: 'completed'})
        expect(await assistantTexts(sessionId)).toEqual(['ok'])
        expect((await sessionMeta(sessionId)).usage).toMatchObject({inputTokens: 120})
      })

      it('deleting a session with a live turn ends that turn', async () => {
        const sessionId = await newSession()
        await heldTurn(sessionId, 'delete me', 'deleted-run')
        const ended = nextTurnEnd(sessionId)
        await chatKit().hub.call('conciv:sessions:delete', {sessionId})
        await ended
        expect((await chatKit().hydrate(sessionId)).activeRun).toBeNull()
        expect((await chatKit().hub.call('conciv:sessions:list', {})).some((meta) => meta.id === sessionId)).toBe(false)
      })
    })

    describe('resume after reload', () => {
      it('an idle session reloads to the exact empty shape', async () => {
        expect(await chatKit().hydrate(await newSession())).toEqual({
          messages: [],
          activeRun: null,
          lastRun: null,
          pendingApprovals: [],
          interrupts: null,
        })
      })

      it('a reload mid-turn shows it running, and a late viewer catches up once with the same transcript', async () => {
        const sessionId = await newSession()
        const {turn} = await heldTurn(sessionId, 'in flight', 'live-run')
        const live = await chatKit().hydrate(sessionId)
        expect(live.activeRun).toEqual({runId: 'live-run'})
        expect(live.messages.filter((message) => message.role === 'user').map(textOfParts)).toEqual(['in flight'])
        expect((await sessionMeta(sessionId)).running).toBe(true)
        const late = chatKit().join('live-run')
        await late.waitForText('ok')
        script().release()
        const [sent, joined] = [await turn.done(GUARD), await late.done(GUARD)]
        expect(eventRunIdsOf(joined, ChatEventType.RUN_STARTED)).toEqual(['live-run'])
        expect(count(joined, ChatEventType.TEXT_MESSAGE_CONTENT)).toBe(1)
        expect(assistantView(joined)).toEqual(assistantView(sent))
        expect((await chatKit().hydrate(sessionId)).activeRun).toBeNull()
        expect((await sessionMeta(sessionId)).running).toBe(false)
      })

      it('a reload that drops the socket mid-turn leaves the turn running to the end, and the reloaded page rejoins it', async () => {
        const sessionId = await newSession()
        script().hold()
        const ended = nextTurnEnd(sessionId)
        await dropSocketAfterFirstText(sessionId, 'reloaded-run')
        expect((await chatKit().hydrate(sessionId)).activeRun).toEqual({runId: 'reloaded-run'})
        const rejoin = chatKit().join('reloaded-run')
        script().release()
        await ended
        expect((await rejoin.done(GUARD)).text()).toBe('ok')
        expect(await chatKit().hydrate(sessionId)).toMatchObject({
          activeRun: null,
          lastRun: {runId: 'reloaded-run', phase: 'completed'},
        })
        expect(await assistantTexts(sessionId)).toEqual(['ok'])
      })

      it('joining a finished turn replays it exactly once', async () => {
        const sessionId = await newSession()
        const sent = await finished(sessionId, 'replay me', {runId: 'replayed-run'})
        const replay = await chatKit().join('replayed-run').done(GUARD)
        expect(replay.text()).toBe('ok')
        expect(nonCustomTypes(replay)).toEqual(nonCustomTypes(sent))
      })

      it('the session stream shows agent tool calls as nested cards but never a turn start or end', async () => {
        const sessionStream = await chatKit().events(app.mcpSession)
        const seen = collect(sessionStream)
        await finished(app.mcpSession, 'quiet session stream')
        await executeResult('return await external_fixture_echo({text: "streamed"})')
        await sessionStream.waitFor((chunk) => isResultFor(chunk, 'streamed'), GUARD)
        const cards = toolCallParts(foldChatEvents(seen))
        const execute = cards.findLast((part) => part.name === 'execute_typescript')
        expect(cardMetadata(cards.findLast((part) => part.name === 'fixture_echo'))).toMatchObject({
          parentToolCallId: execute?.id,
        })
        expect(seen.filter(isTurnBoundary)).toEqual([])
      })

      it('the CLI resumes its own session while its transcript exists, and starts fresh when it does not', async () => {
        const resumable = await newSession()
        await finished(resumable, 'remember this')
        writeTranscript(fakeNativeId(resumable), transcriptTurn('remember this', 'ok', 1))
        await finished(resumable, 'resume')
        expect(lastRunOf(resumable).resumeSessionId).toBe(fakeNativeId(resumable))
        expect(lastRunOf(resumable).messages).not.toContain('remember this')
        expect((await sessionMeta(resumable)).native?.nativeId).toBe(fakeNativeId(resumable))
        const stale = await newSession()
        await finished(stale, 'no transcript')
        await finished(stale, 'still none')
        expect(lastRunOf(stale).resumeSessionId).toBeNull()
      })

      it('a turn id runs once: resending a finished one resumes it, and two sends at once start one turn', async () => {
        const reused = await newSession()
        await finished(reused, 'original', {runId: 'reused-run'})
        expect((await finished(reused, 'retry', {runId: 'reused-run'})).text()).toBe('ok')
        const twin = await newSession()
        script().hold()
        const sends = [await send(twin, 'twin', {runId: 'twin-run'}), await send(twin, 'twin', {runId: 'twin-run'})]
        script().release()
        await Promise.all(sends.map((turn) => turn.done(GUARD)))
        expect([runsOf(reused).length, runsOf(twin).length]).toEqual([1, 1])
        expect([await threadUserTexts(reused), await threadUserTexts(twin)]).toEqual([['original'], ['twin']])
      })
    })

    describe('approvals', () => {
      it('only tools declared to ask ever ask: mutating and read tools run straight through the sandbox', async () => {
        const sessionId = await newSession()
        codeTurn(TOOLS_WITHOUT_ASK_SCRIPT)
        const events = await finished(sessionId, 'run tools')
        expect(events.custom('approval-requested')).toEqual([])
        expect(resultsOf(await thread(sessionId))).toContain('[{"echoed":"hi"},{"value":7},"undefined"]')
        expect(lastRunOf(sessionId).tools).toContain('fixture_ask')
      })

      it('a risky tool is refused until approved, a denial re-runs the turn refused once, and a one-time approval runs once', async () => {
        const sessionId = await newSession()
        const ran = toolRuns.ask
        const asked = await askTurn(sessionId, 'ask-run')
        expect(JSON.stringify(asked.all)).toContain('needs the user')
        expect(asked.all.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
        expect((await chatKit().hydrate(sessionId)).pendingApprovals).toEqual([pendingAsk('ask-run')])
        expect((await chatKit().join('ask-run').done(GUARD)).custom('approval-requested')).toHaveLength(1)
        await expect(decide(sessionId, ASK_ID, false)).resolves.toEqual({ok: true, startsTurn: true})
        expect((await chatKit().hydrate(sessionId)).pendingApprovals).toEqual([])
        const refused = await askTurn(sessionId)
        expect(lastRunOf(sessionId).denials).toEqual([ASK_ID])
        expect(refused.custom('approval-requested')).toEqual([])
        expect(JSON.stringify(refused.all)).toContain('denied')
        expect(toolRuns.ask).toBe(ran)
        expect((await chatKit().hydrate(sessionId)).pendingApprovals).toEqual([])
        expect((await askTurn(sessionId)).custom('approval-requested')).toHaveLength(1)
        expect(lastRunOf(sessionId).denials).toEqual([])
        await decide(sessionId, ASK_ID, true)
        expect((await chatKit().hydrate(sessionId)).pendingApprovals).toEqual([])
        await askTurn(sessionId)
        expect(toolRuns.ask).toBe(ran + 1)
        expect((await askTurn(sessionId)).custom('approval-requested')).toHaveLength(1)
        await expect(decide(sessionId, 'conciv:tool:nothing', true)).rejects.toMatchObject({code: 'UNKNOWN_REQUEST'})
      })

      it('an unanswered ask never times out and a stop leaves it waiting', async () => {
        const sessionId = await newSession()
        expect(JSON.stringify((await askTurn(sessionId)).all)).not.toMatch(/timed out/)
        await chatKit().rpc.chat.stop({sessionId, runIds: []})
        expect((await chatKit().hydrate(sessionId)).pendingApprovals.map((ask) => ask.approvalId)).toEqual([ASK_ID])
      })

      it('approving for the session lets repeats through, except a command that could hide another', async () => {
        const sessionId = await newSession()
        const ran = toolRuns.ask
        await askTurn(sessionId)
        await decide(sessionId, ASK_ID, true, 'session')
        await askTurn(sessionId)
        expect((await askTurn(sessionId)).custom('approval-requested')).toEqual([])
        expect(toolRuns.ask).toBe(ran + 2)
        await commandAsks(sessionId, [PLAIN_COMMAND, HIDDEN_COMMAND])
        await decide(sessionId, PLAIN_COMMAND, true, 'session')
        await decide(sessionId, HIDDEN_COMMAND, true, 'session')
        await finished(sessionId, 'retry one')
        expect(lastRunOf(sessionId).approvals).toEqual(expect.arrayContaining([PLAIN_COMMAND, HIDDEN_COMMAND]))
        await finished(sessionId, 'retry two')
        expect(lastRunOf(sessionId).approvals).toContain(PLAIN_COMMAND)
        expect(lastRunOf(sessionId).approvals).not.toContain(HIDDEN_COMMAND)
      })

      it('the widget calling a tool is the approval, while agents and malformed callers are refused', async () => {
        const ran = toolRuns.ask
        const browserRpc = widgetRpc(app.mcpSession)
        await expect(browserRpc.registry.call({name: 'fixture_ask', input: {target: 'w'}})).resolves.toEqual({
          done: 'w',
        })
        await expect(browserRpc.server.reload({file: 'a.ts'})).rejects.toMatchObject({code: 'NO_BUNDLER'})
        await expect((await mcpTool('fixture_ask')).execute({target: 'agent'})).rejects.toThrow(/needs the user/)
        expect(toolRuns.ask).toBe(ran + 1)
        await expect(callerWithout().registry.call({name: 'fixture_read', input: {}})).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
        })
        await expect(
          callerWith('not a session').registry.call({name: 'fixture_read', input: {}}),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: expect.stringMatching(/malformed/),
        })
        expect((await mcpPost({[CONCIV_SESSION_HEADER]: 'nope'})).status).toBe(400)
      })

      it('a caller outside the widget is refused, shows the ask, and one approval runs one retry', async () => {
        const sessionId = await newSession()
        const ran = toolRuns.ask
        const call = () => callerWith(sessionId).registry.call({name: 'fixture_ask', input: {target: 'x'}})
        const abort = new AbortController()
        const events = await chatKit().rpc.chat.events({sessionId}, {signal: abort.signal})
        const firstEvent = events.next()
        await expect(call()).rejects.toMatchObject({
          code: 'APPROVAL_DENIED',
          message: expect.stringMatching(/needs the user/),
        })
        expect((await firstEvent).value).toMatchObject({name: 'approval-requested', value: {approvalId: ASK_ID}})
        abort.abort()
        expect((await chatKit().hydrate(sessionId)).pendingApprovals).toEqual([
          {approvalId: ASK_ID, toolCallId: ASK_ID, toolName: 'fixture_ask', input: {target: 'x'}, runId: null},
        ])
        expect(toolRuns.ask).toBe(ran)
        await expect(decide(sessionId, ASK_ID, true)).resolves.toEqual({ok: true, startsTurn: false})
        await finished(sessionId, 'an unrelated turn')
        await expect(call()).resolves.toEqual({done: 'x'})
        expect(toolRuns.ask).toBe(ran + 1)
        await expect(call()).rejects.toMatchObject({code: 'APPROVAL_DENIED'})
      })

      it('a session option counts its messages right after a turn', async () => {
        const sessionId = await newSession()
        await finished(sessionId, 'count me')
        const row = (await chatKit().hub.call('conciv:sessions:list', {})).find((meta) => meta.id === sessionId)
        expect(row?.messageCount).toBe(2)
      })
    })

    describe('tools and models list', () => {
      it('the widget gets every tool with its full description and the harness model list', async () => {
        const {tools} = await chatKit().rpc.meta.tools(undefined)
        expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(FIXTURE_TOOLS))
        expect(tools.every((tool) => tool.description.length > 0)).toBe(true)
        expect(tools.find((tool) => tool.name === 'fixture_echo')?.description).toBe(ECHO_DESCRIPTION)
        const models = await chatKit().rpc.meta.models(undefined)
        expect(models.models.map((model) => model.id)).toEqual(expect.arrayContaining(['opus', 'sonnet', 'haiku']))
        expect(models.defaultModel).toBe('sonnet')
      })
    })

    describe('attachments and images', () => {
      it('an attachment is stored as sent, expanded once for the model only, and the CLI gets the expansion', async () => {
        const sessionId = await newSession()
        await finished(sessionId, {content: attachmentParts()})
        const sent = lastRunOf(sessionId).messages
        expect(sent.indexOf('fixture-expanded')).toBeGreaterThan(sent.indexOf(FIXTURE_MIME))
        expect(sent).toContain('[attachment could not be processed]')
        const user = (await thread(sessionId)).find((message) => message.role === 'user')
        expect(user?.parts.filter((part) => part.type === 'document')).toHaveLength(3)
        expect(user?.parts.filter(isExpansion)).toEqual([EXPANSION_PART])
      })

      it('an image is stored exactly as sent, ignores the draft, and stays in history for later turns', async () => {
        const sessionId = await newSession()
        await chatKit().rpc.drafts.set({sessionId, text: 'a saved draft', selectionStart: 0, selectionEnd: 0})
        await finished(sessionId, {content: [{type: 'text', content: 'what color?'}, IMAGE]})
        await finished(sessionId, 'and the shape?')
        const messages = await thread(sessionId)
        expect(messages.find((message) => message.role === 'user')?.parts).toEqual([
          {type: 'text', content: 'what color?'},
          IMAGE,
        ])
        expect(await threadUserTexts(sessionId)).toEqual(['what color?', 'and the shape?'])
        expect(messages.flatMap((message) => message.parts).filter((part) => part.type === 'image')).toHaveLength(1)
        expect(lastRunOf(sessionId).messages).toContain(ONE_PIXEL_PNG)
        expect(await chatKit().rpc.drafts.get({sessionId})).toBeNull()
      })
    })

    describe('compaction', () => {
      it('compact runs as its own turn, never overlaps another, marks the boundary and keeps the history', async () => {
        const sessionId = await newSession()
        await finished(sessionId, 'one')
        await finished(sessionId, 'two')
        const sessionStream = await chatKit().events(sessionId)
        script().hold()
        const compacts = Promise.all([
          chatKit().hub.call('conciv:sessions:compact', {sessionId}),
          chatKit().hub.call('conciv:sessions:compact', {sessionId}),
        ])
        const first = sessionRunIdOf(await sessionStream.waitFor((chunk) => sessionRunIdOf(chunk) !== null, GUARD))
        await sessionStream.waitFor((chunk) => ![null, first].includes(sessionRunIdOf(chunk)), GUARD)
        expect((await sessionMeta(sessionId)).running).toBe(true)
        script().release()
        await compacts
        expect(lastRunOf(sessionId).kind).toBe('compact')
        expect(lastRunOf(sessionId).messages).toContain('/compact')
        expect(overlapping(runsOf(sessionId))).toBe(false)
        expect(await compactMarkers(sessionId)).toEqual([4, 4])
        expect(await threadUserTexts(sessionId)).toEqual(['one', 'two'])
      })

      it('when the CLI compacts its own transcript the thread is kept and later turns append', async () => {
        const sessionId = await newSession()
        const transcript = await turnWithTranscript(sessionId, 'before compaction', 1)
        writeFileSync(transcript, transcriptTurn('a compacted summary', 'ok', 9).join('\n'))
        expect(await threadUserTexts(sessionId)).toEqual(['before compaction'])
        writeFileSync(transcript, terminalTurns(['a compacted summary', 'after compaction'], 9).join('\n'))
        expect(await threadUserTexts(sessionId)).toEqual(['before compaction', 'after compaction'])
      })
    })

    describe('terminal sessions', () => {
      it('a session started in the terminal opens with its turns, outlives its file, and picks up new ones', async () => {
        const transcript = writeTranscript(TERMINAL_ID, terminalTurns(['terminal one', 'terminal two']))
        const {sessionId} = await chatKit().hub.call('conciv:sessions:resolve', {id: TERMINAL_ID})
        expect(await threadUserTexts(sessionId)).toEqual(['terminal one', 'terminal two'])
        const {native} = await sessionMeta(sessionId)
        expect(native).not.toBeNull()
        if (native) expect(await chatKit().hub.call('conciv:sessions:open', native)).toEqual({sessionId})
        expect((await sessionMeta(sessionId)).origin).toBe('external')
        rmSync(transcript)
        expect(await threadUserTexts(sessionId)).toEqual(['terminal one', 'terminal two'])
        writeTranscript(TERMINAL_ID, terminalTurns(['terminal one', 'terminal two', 'terminal three']))
        expect(await threadUserTexts(sessionId)).toEqual(['terminal one', 'terminal two', 'terminal three'])
        await finished(sessionId, 'widget after')
        expect(await threadUserTexts(sessionId)).toEqual([
          'terminal one',
          'terminal two',
          'terminal three',
          'widget after',
        ])
      })

      it('widget turns are never duplicated by the CLI copy, even repeated prompts and image-only turns', async () => {
        const sessionId = await newSession()
        await turnWithTranscript(sessionId, 'open', 1)
        await turnWithTranscript(sessionId, {content: [IMAGE]}, 2, '[image #1 attached]')
        await turnWithTranscript(sessionId, 'open', 3)
        expect(await threadUserTexts(sessionId)).toEqual(['open', '', 'open'])
        expect(await threadUserTexts(sessionId)).toEqual(['open', '', 'open'])
      })
    })

    describe('sending while a turn runs', () => {
      it('a second message waits for the running turn, never runs beside it, and both stay in order', async () => {
        const sessionId = await newSession()
        const {turn} = await heldTurn(sessionId, 'first in line')
        const second = await send(sessionId, 'second in line')
        script().release()
        await Promise.all([turn.done(GUARD), second.done(GUARD)])
        expect(overlapping(runsOf(sessionId))).toBe(false)
        expect(await threadUserTexts(sessionId)).toEqual(['first in line', 'second in line'])
      })

      it('a new message ends the running turn before its own turn starts', async () => {
        const sessionId = await newSession()
        const {turn} = await heldTurn(sessionId, 'interrupted', 'steer-first')
        const second = await send(sessionId, 'resent', {runId: 'steer-second'})
        const first = await turn.done({hangGuardMs: 1_000}).finally(() => script().release())
        expect(first.all.some((chunk) => chunk.type === ChatEventType.RUN_FINISHED)).toBe(true)
        expect(eventRunIdsOf(await second.done(GUARD), ChatEventType.RUN_STARTED)).toContain('steer-second')
      })
    })

    describe('silent CLI', () => {
      it('a CLI that says nothing fails the turn with "no output", tells the viewer, and fires the hook', async () => {
        const sessionId = await newSession()
        script().holdTools()
        const ended = nextTurnEnd(sessionId)
        const turn = await send(sessionId, 'silence', {runId: 'silent-run'})
        const error = turn.waitFor((chunk) => chunk.type === ChatEventType.RUN_ERROR, {hangGuardMs: SILENCE_MS * 2})
        await ended
        expect((await chatKit().hydrate(sessionId)).lastRun).toMatchObject({
          runId: 'silent-run',
          phase: 'failed',
          error: expect.stringMatching(/no output/),
        })
        await expect(error).resolves.toMatchObject({message: expect.stringMatching(/no output/)})
      })
    })

    describe('context meter', () => {
      it('the meter reads the last assistant usage in the transcript, not the sum of the turn', async () => {
        const sessionId = await newSession()
        cli.usage.push({...usage(1_000), promptTokensDetails: {cachedTokens: 400}})
        await turnWithTranscript(sessionId, 'context', 1, 'context', contextUsageLines())
        expect((await sessionMeta(sessionId)).usage).toMatchObject({
          inputTokens: 1_000,
          cacheReadTokens: 400,
          contextTokens: 320,
        })
      })
    })

    describe('sessions', () => {
      it('opening without an id reopens the latest chat session and never one made for an agent', async () => {
        const latest = await newSession()
        await finished(latest, 'make it the latest')
        await headerMcpCall({})
        expect((await chatKit().hub.call('conciv:sessions:resolve', {})).sessionId).toBe(latest)
      })

      it('opening by id keeps ours, creates an unknown one, and adopts a CLI or agent session exactly once', async () => {
        const ours = await newSession()
        expect((await chatKit().hub.call('conciv:sessions:resolve', {id: ours})).sessionId).toBe(ours)
        expect((await chatKit().hub.call('conciv:sessions:resolve', {id: UNKNOWN_SESSION})).sessionId).toBe(
          UNKNOWN_SESSION,
        )
        const adopted = (await chatKit().hub.call('conciv:sessions:resolve', {id: 'native-adopt-1'})).sessionId
        expect((await chatKit().hub.call('conciv:sessions:resolve', {id: 'native-adopt-1'})).sessionId).toBe(adopted)
        const adoptedStream = await chatKit().events(adopted)
        await headerMcpCall({[CONCIV_CLAUDE_SESSION_HEADER]: 'native-adopt-1'})
        await adoptedStream.waitFor((chunk) => chunk.type === ChatEventType.TOOL_CALL_RESULT, GUARD)
        await headerMcpCall({[CONCIV_CLAUDE_SESSION_HEADER]: 'agent-native-1'})
        await headerMcpCall({[CONCIV_CLAUDE_SESSION_HEADER]: 'agent-native-1'})
        const listed = await chatKit().hub.call('conciv:sessions:list', {includeHidden: true})
        expect(listed.filter((meta) => meta.native?.nativeId === 'agent-native-1')).toHaveLength(1)
      })

      it('the session list titles, renames, refuses bad input, and forgets deleted sessions', async () => {
        const [kept, removed] = [await newSession(), await newSession()]
        expect((await chatKit().rpc.markers.list({sessionId: kept})).map((marker) => marker.kind)).toEqual(['new'])
        await finished(kept, 'title from me')
        await finished(removed, 'clear me')
        expect(await sessionMeta(kept)).toMatchObject({origin: 'conciv', title: 'title from me'})
        await chatKit().hub.call('conciv:sessions:rename', {sessionId: kept, title: '  renamed  '})
        expect((await sessionMeta(kept)).title).toBe('renamed')
        await expect(
          chatKit().hub.call('conciv:sessions:rename', {sessionId: NEVER_MADE, title: 'x'}),
        ).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: 'session not found',
        })
        await expect(
          chatKit().hub.call('conciv:sessions:model', {sessionId: kept, model: 'no-such-model'}),
        ).rejects.toMatchObject({
          code: 'UNKNOWN_MODEL',
        })
        await expect(chatKit().rpc.sessions.rename({sessionId: NEVER_MADE, title: 'x'})).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: 'session not found',
          defined: true,
        })
        await expect(chatKit().rpc.sessions.model({sessionId: kept, model: 'no-such-model'})).rejects.toMatchObject({
          code: 'UNKNOWN_MODEL',
          defined: true,
        })
        await expect(chatKit().hub.call('conciv:sessions:rename', {sessionId: kept, title: ''})).rejects.toMatchObject({
          code: 'BAD_REQUEST',
        })
        await chatKit().hub.call('conciv:sessions:delete', {sessionId: removed})
        expect((await chatKit().hub.call('conciv:sessions:list', {})).map((meta) => meta.id)).not.toContain(removed)
        expect(await thread(removed)).toEqual([])
        expect(await threadUserTexts(kept)).toEqual(['title from me'])
        expect(await chatKit().hub.call('conciv:sessions:restore', {sessionId: removed})).toEqual({sessionId: removed})
        expect((await chatKit().hub.call('conciv:sessions:list', {})).map((meta) => meta.id)).toContain(removed)
      })
    })

    describe('code mode', () => {
      it('a turn and agents over MCP get the same tools: run code, discover tools, and the asking tools', async () => {
        const sessionId = await newSession()
        await finished(sessionId, 'tools')
        const offered = await app.mcpTools()
        for (const names of [lastRunOf(sessionId).tools, offered.map((tool) => tool.name)]) {
          expect(names).toEqual(expect.arrayContaining(['execute_typescript', 'discover_tools', 'fixture_ask']))
          expect(names).not.toContain('fixture_echo')
        }
        const description = offered.find((tool) => tool.name === 'execute_typescript')?.description ?? ''
        expect(description).toContain('discover_tools')
        expect(description).not.toContain('fixture_echo')
      })

      it('code reaches every capability by name, returns values and logs, and keeps each run isolated', async () => {
        expect(await executeResult('return 1 + 1')).toBe(2)
        expect(await executeResult('return await external_fixture_echo({text: "bound"})')).toEqual({echoed: 'bound'})
        expect(await executeResult('return typeof external_conciv_extensions')).toBe('function')
        expect(await runTypescript('console.log("logged line"); return 5')).toMatchObject({
          result: 5,
          logs: ['logged line'],
        })
        await executeResult('globalThis.leak = 41; return 1')
        expect(await executeResult('return typeof globalThis.leak')).toBe('undefined')
        expect(
          JSON.stringify(await (await mcpTool('discover_tools')).execute({toolNames: ['fixture_echo']})),
        ).toContain('fixture_echo')
      })

      it('discover_tools shows a tool output shape and declared error codes, the catalog only its summary', async () => {
        const discover = await mcpTool('discover_tools')
        const found = JSON.stringify(await discover.execute({toolNames: ['fixture_fail']}))
        expect(found).toContain('Returns JSON matching')
        expect(found).toContain('PROBE_BROKE: the probe broke')
        expect(JSON.stringify(await discover.execute({toolNames: ['fixture_echo']}))).toContain('echoed')
        expect(discover.description).toContain('fail with a declared error.')
        expect(discover.description).not.toContain('PROBE_BROKE')
      })

      it('errors keep their declared code, other failures stay plain errors, and huge results are capped', async () => {
        expect(await executeResult(catchMessage('external_fixture_fail({spaced: true})'))).toBe(DECLARED_MESSAGE)
        expect(await executeResult(catchMessage('external_fixture_fail({spaced: false})'))).toBe(DECLARED_MESSAGE)
        await expect(runTypescript('await external_fixture_fail({spaced: true})')).rejects.toThrow(
          /"code":"PROBE_BROKE"/,
        )
        const undeclared = await runTypescript('throw new Error("EACCES: denied")').catch((error: unknown) =>
          String(error),
        )
        expect(String(undeclared)).toContain('EACCES: denied')
        expect(String(undeclared)).not.toContain('"code":"EACCES"')
        const capped = JSON.stringify(await runTypescript('return "y".repeat(200000)'))
        expect(capped.length).toBeLessThan(60_000)
        expect(capped).toContain('conciv:truncated')
      })
    })

    describe('code mode child cards', () => {
      it('each call in a script shows as its own card under the script, with results, errors and caps, after reload too', async () => {
        const sessionId = await newSession()
        const ran = toolRuns.echo
        const parent = codeTurn(CHILD_CARD_SCRIPT)
        await finished(sessionId, 'many calls')
        await finished(sessionId, 'a later turn')
        expect(toolRuns.echo).toBe(ran + 2)
        const children = toolCallParts(await thread(sessionId)).filter((part) => part.name !== 'execute_typescript')
        expect(children.map((part) => [part.name, cardMetadata(part)])).toEqual(
          CHILD_CARDS.map((name) => [name, {parentToolCallId: parent}]),
        )
        expect(children.find((part) => part.name === 'fixture_fail')?.state).toBe('error')
        const results = resultsOf(await thread(sessionId))
        expect(results).toContain('the probe broke')
        expect(results).toContain('conciv:truncated')
        expect(results).toContain('120000')
      })
    })

    describe('images out of code mode', () => {
      it('a program returning a big image keeps every byte on its card, also after reload, and text stays capped', async () => {
        const sessionId = await newSession()
        codeTurn('const shot = await external_fixture_image({}); return {shot, note: "z".repeat(200000)}')
        await finished(sessionId, 'look')
        await finished(sessionId, 'a later turn')
        const results = resultsOf(await thread(sessionId))
        expect(results).toContain(BIG_IMAGE_BYTES)
        expect(results).not.toContain('z'.repeat(60_000))
      })

      it('a page screenshot lands in a gitignored project file, and the result names it beside the image', async () => {
        const sessionId = await chatKit().session()
        codeTurn('return await external_page_screenshot({})')
        await finished(sessionId, 'shoot')
        const results = resultsOf(await thread(sessionId))
        expect(results).toContain(SCREENSHOT_BYTES)
        const saved = /\.conciv\/tmp\/screenshots\/[\w-]+\.webp/.exec(results)?.[0]
        if (saved === undefined) throw new Error(`no screenshot path in: ${results.slice(0, 300)}`)
        expect(readFileSync(join(chatKit().stateRoot, saved)).toString('base64')).toBe(SCREENSHOT_BYTES)
      })

      it('the tool bridge hands the CLI an image block, with the text capped apart from it', async () => {
        const bridge = await imageToolProvisioner.provision(
          [{name: 'shot', description: 'shot', execute: async () => cappedValue({path: 'a.webp', image: BIG_IMAGE})}],
          {threadId: 'thread', provider: 'local-process'},
        )
        try {
          const response = await fetch(bridge.url, {
            method: 'POST',
            headers: {authorization: `Bearer ${bridge.token}`, 'content-type': 'application/json'},
            body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'shot', arguments: {}}}),
          })
          const {result} = BridgeReplySchema.parse(await response.json())
          expect(result.content.find((part) => part.type === 'image')).toEqual({
            type: 'image',
            data: BIG_IMAGE_BYTES,
            mimeType: 'image/png',
          })
          const text = result.content.find((part) => part.type === 'text')
          expect(text?.text).toContain('a.webp')
          expect(text?.text).not.toContain(BIG_IMAGE_BYTES)
        } finally {
          await bridge.close()
        }
      })
    })

    describe('questions to the user', () => {
      it('a question waits for the widget answer, a late viewer sees it, and an unknown answer is refused', async () => {
        script().holdResults()
        const [uiCallId] = script().scriptTurn({
          toolCalls: [{name: 'mcp__conciv__conciv_ui', input: {kind: 'confirm'}}],
        })
        const turn = await send(app.mcpSession, 'ask the user', {runId: 'ui-run'})
        await turn.waitFor(isUiCall, GUARD)
        const answer = executeResult('return await external_conciv_ui({kind: "confirm", question: "Proceed?"})')
        await chatKit().join('ui-run').waitFor(isUiCall, GUARD)
        await chatKit().rpc.chat.uiReply({sessionId: app.mcpSession, toolCallId: uiCallId ?? '', value: 'yes'})
        expect(await answer).toEqual({answered: true, value: 'yes'})
        await expect(
          chatKit().rpc.chat.uiReply({sessionId: app.mcpSession, toolCallId: 'no-such-call', value: 'yes'}),
        ).rejects.toMatchObject({code: 'UNKNOWN_REQUEST'})
        script().releaseResults()
        await turn.done(GUARD)
      })
    })

    describe('page tools', () => {
      it('a page tool reaches the page without an ask and its change lands in the page journal', async () => {
        const sessionId = await chatKit().session()
        codeTurn('return await external_page_click({selector: "#go"})')
        const events = await finished(sessionId, 'click')
        expect(events.custom('approval-requested')).toEqual([])
        expect(widget().seen()).toContain('page_click')
        expect((await chatKit().rpc.page.changes(undefined)).length).toBeGreaterThan(0)
      })
    })

    describe('transport and workspace', () => {
      it('a turn over SSE stores the same thread as one over the socket, and nothing lands in the project', async () => {
        const [overSocket, overSse] = [await newSession(), await newSession()]
        await finished(overSocket, 'same')
        await readSse(
          await sseTurn(overSse, 'sse-run', 'same', new AbortController().signal),
          ChatEventType.RUN_FINISHED,
        )
        expect(roleTexts(await thread(overSse))).toEqual(roleTexts(await thread(overSocket)))
        expect(readdirSync(chatKit().stateRoot).filter((name) => ['.mcp.json', '.claude'].includes(name))).toEqual([])
      })
    })

    describe('server restart', () => {
      it('the turn clock survives the server restarting', async () => {
        const sessionId = await newSession()
        await finished(sessionId, 'timed', {runId: 'timed-run'})
        const before = (await chatKit().hydrate(sessionId)).lastRun
        await chatKit().restartServer()
        expect((await chatKit().hydrate(sessionId)).lastRun).toEqual({...before, serverNow: expect.any(Number)})
      })
    })
  })

  const SILENCE_MS = 1_000
  const GUARD = {hangGuardMs: 5_000}
  const FIXTURE_MIME = 'application/x-conciv-fixture'
  const BROKEN_MIME = 'application/x-conciv-broken'
  const ASK_ID = 'conciv:tool:fixture_ask'
  const PLAIN_COMMAND = 'claude-code:command:git status'
  const HIDDEN_COMMAND = 'claude-code:command:grep "$(cat x)"'
  const TERMINAL_ID = 'sess-terminal-born'
  const UNKNOWN_SESSION = 'conciv_unknown-but-valid'
  const NEVER_MADE = 'conciv_never-made'
  const DECLARED_MESSAGE = 'PROBE_BROKE: the probe broke'
  const FIXTURE_TOOLS = ['fixture_echo', 'fixture_read', 'fixture_ask']
  const CHILD_CARDS = ['fixture_echo', 'fixture_echo', 'fixture_fail', 'fixture_huge']
  const ECHO_DESCRIPTION = 'Echo the text back.\n\nUse it to echo.\n\nNever echo secrets.\n\nKeep it short.'
  const EXPANSION_PART = {type: 'text', content: 'fixture-expanded', metadata: {modelOnly: true}}
  const ONE_PIXEL_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  const IMAGE = {type: 'image', source: {type: 'data', mimeType: 'image/png', value: ONE_PIXEL_PNG}}
  const SCREENSHOT_BYTES = 'UklGRg=='
  const BIG_IMAGE_BYTES = ONE_PIXEL_PNG.repeat(1_000)
  const BIG_IMAGE = {type: 'image', source: {type: 'data', mimeType: 'image/png', value: BIG_IMAGE_BYTES}}
  const BridgeReplySchema = z.object({
    result: z.object({content: z.array(z.looseObject({type: z.string(), text: z.string().optional()}))}),
  })
  const TOOL_NAME_FORMS: [string, string][] = [
    ['mcp__conciv__fixture_echo', 'fixture_echo'],
    ['tanstack_fixture_echo', 'fixture_echo'],
    ['mcp__tanstack__conciv_ui', 'conciv_ui'],
    ['Read', 'Read'],
    ['unknown_tool', 'unknown_tool'],
    ['fixture.echo', 'fixture.echo'],
    ['fixture_ech', 'fixture_ech'],
  ]
  const TOOLS_WITHOUT_ASK_SCRIPT =
    'return [await external_fixture_echo({text: "hi"}), await external_fixture_read({}), typeof external_fixture_ask]'
  const CHILD_CARD_SCRIPT = `
  await external_fixture_echo({text: "a"})
  await external_fixture_echo({text: "b"})
  try { await external_fixture_fail({spaced: true}) } catch {}
  const huge = await external_fixture_huge({})
  return huge.blob.length
`
  const SseChunkSchema = z.object({type: z.string()}).loose()
  const ResultEnvelopeSchema = z.object({result: z.unknown(), logs: z.array(z.string()).default([])}).loose()

  type SeenRun = {
    sessionId: string
    kind: 'chat' | 'compact'
    model: string | undefined
    resumeSessionId: string | null
    messages: string
    tools: string[]
    approvals: string[]
    denials: string[]
    startedAt: number
    endedAt: number | null
  }

  type TurnInput = string | Record<string, unknown>

  type SharedApp = {
    kit: Kit | null
    harness: TestHarness | null
    widget: FakeWidget | null
    mcp: McpClient | null
    mcpSession: string
    claudeHome: string
    mcpTools: () => Promise<McpTool[]>
  }

  const app: SharedApp = {
    kit: null,
    harness: null,
    widget: null,
    mcp: null,
    mcpSession: '',
    claudeHome: '',
    mcpTools: async () => {
      if (app.mcp === null) throw new Error('the MCP client is not connected')
      return app.mcp.tools()
    },
  }
  const seenRuns: SeenRun[] = []
  const cli: {usage: TokenUsage[]; launchFailures: string[]} = {usage: [], launchFailures: []}
  const toolRuns = {ask: 0, echo: 0}
  const turnEnds: string[] = []
  const turnEndWaiters: {sessionId: string; settle: () => void}[] = []

  function fixtureExtension() {
    return defineExtension({
      name: 'fixture',
      tools: [echoTool(), readTool(), askTool(), failTool(), hugeTool(), imageTool()],
      attachments: fixtureAttachments(),
    }).server(() => ({context: {}, turnEnd: noteTurnEnd}))
  }

  function echoTool() {
    return defineTool({
      name: 'fixture_echo',
      description: 'Echo the text back.',
      inputSchema: z.object({text: z.string()}),
      outputSchema: z.object({echoed: z.string()}),
      promptSnippet: 'Use it to echo.',
      promptGuidelines: ['Never echo secrets.', 'Keep it short.'],
      meta: {summary: 'echo the text back', category: 'fixture', mutating: true},
    }).server((input) => {
      toolRuns.echo += 1
      return {echoed: input.text}
    })
  }

  function readTool() {
    return defineTool({
      name: 'fixture_read',
      description: 'Read a fixture value.',
      inputSchema: z.object({}),
      outputSchema: z.object({value: z.number()}),
      meta: {summary: 'read a fixture value', category: 'fixture', mutating: false},
    }).server(() => ({value: 7}))
  }

  function askTool() {
    return defineTool({
      name: 'fixture_ask',
      description: 'A risky fixture action.',
      inputSchema: z.object({target: z.string()}),
      outputSchema: z.object({done: z.string()}),
      meta: {summary: 'a risky fixture action', category: 'fixture', mutating: false},
      approval: 'ask',
    }).server((input) => {
      toolRuns.ask += 1
      return {done: input.target}
    })
  }

  function failTool() {
    return defineTool({
      name: 'fixture_fail',
      description: 'Fail with a declared error.',
      inputSchema: z.object({spaced: z.boolean()}),
      outputSchema: z.object({}),
      errors: {PROBE_BROKE: {message: 'the probe broke'}},
      meta: {summary: 'fail with a declared error', category: 'fixture', mutating: false},
    }).server((input) => {
      throw toolError('PROBE_BROKE', {message: input.spaced ? 'the probe broke' : 'PROBE_BROKE:the probe broke'})
    })
  }

  function hugeTool() {
    return defineTool({
      name: 'fixture_huge',
      description: 'Return a huge value.',
      inputSchema: z.object({}),
      outputSchema: z.object({blob: z.string()}),
      meta: {summary: 'return a huge value', category: 'fixture', mutating: false},
    }).server(() => ({blob: 'x'.repeat(120_000)}))
  }

  function imageTool() {
    return defineTool({
      name: 'fixture_image',
      description: 'Return a big image.',
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
      meta: {summary: 'return a big image', category: 'fixture', mutating: false},
    }).server(() => imageResult('image/png', BIG_IMAGE_BYTES, {width: 1}))
  }

  function fixtureAttachments() {
    const expanding = defineAttachment({mime: FIXTURE_MIME})
    expanding.server(() => [{type: 'text', content: 'fixture-expanded'}])
    const broken = defineAttachment({mime: BROKEN_MIME})
    broken.server(() => {
      throw new Error('the expander broke')
    })
    return [expanding, broken]
  }

  async function noteTurnEnd(sessionId: string): Promise<void> {
    turnEnds.push(sessionId)
    const ready = turnEndWaiters.filter((waiter) => waiter.sessionId === sessionId)
    turnEndWaiters.splice(0, turnEndWaiters.length, ...turnEndWaiters.filter((waiter) => !ready.includes(waiter)))
    ready.forEach((waiter) => waiter.settle())
  }

  function nextTurnEnd(sessionId: string): Promise<void> {
    return new Promise((settle, fail) => {
      const guard = setTimeout(() => fail(new Error(`the run-end hook did not fire for ${sessionId} within 3s`)), 3_000)
      turnEndWaiters.push({
        sessionId,
        settle: () => {
          clearTimeout(guard)
          settle()
        },
      })
    })
  }

  function recordingHarness(base: TestHarness): TestHarness {
    return {
      ...base,
      chatConfig: (deps: HarnessChatDeps) => {
        const failure = cli.launchFailures.shift()
        if (failure !== undefined) throw new Error(failure)
        return {
          adapter: makeTextAdapter('scripted', async function* (options) {
            const seen: SeenRun = {
              sessionId: deps.sessionId,
              kind: deps.kind,
              model: deps.model,
              resumeSessionId: deps.resumeSessionId,
              messages: JSON.stringify(options.messages),
              tools: (options.tools ?? []).map((tool) => tool.name),
              approvals: [...(options.approvals ?? [])].flatMap(([id, granted]) => (granted ? [id] : [])),
              denials: [...(options.approvals ?? [])].flatMap(([id, granted]) => (granted ? [] : [id])),
              startedAt: Date.now(),
              endedAt: null,
            }
            seenRuns.push(seen)
            const reported = cli.usage.shift()
            try {
              for await (const chunk of base.script.chatStream(deps, options)) yield withUsage(chunk, reported)
            } finally {
              seen.endedAt = Date.now()
            }
          }),
        }
      },
    }
  }

  function withUsage(chunk: ChatEvent, reported: TokenUsage | undefined): ChatEvent {
    if (reported === undefined || chunk.type !== ChatEventType.RUN_FINISHED || chunk.finishReason === 'tool_calls') {
      return chunk
    }
    return {...chunk, usage: reported}
  }

  function usage(promptTokens: number): TokenUsage {
    return {promptTokens, completionTokens: 1, totalTokens: promptTokens + 1}
  }

  function chatKit(): Kit {
    if (app.kit === null) throw new Error('the app did not boot')
    return app.kit
  }

  function script(): TestHarness['script'] {
    if (app.harness === null) throw new Error('the app did not boot')
    return app.harness.script
  }

  function widget(): FakeWidget {
    if (app.widget === null) throw new Error('the widget is not connected')
    return app.widget
  }

  async function newSession(): Promise<string> {
    return (await chatKit().hub.call('conciv:sessions:create', {})).sessionId
  }

  function send(
    sessionId: string,
    input: TurnInput,
    opts: {runId?: string; messageId?: string} = {},
  ): Promise<RunStream> {
    return chatKit().turn(input, {session: sessionId, ...opts})
  }

  async function finished(sessionId: string, input: TurnInput, opts: {runId?: string; messageId?: string} = {}) {
    return (await send(sessionId, input, opts)).done(GUARD)
  }

  async function heldTurn(sessionId: string, text: string, runId?: string) {
    script().hold()
    const turn = await send(sessionId, text, runId === undefined ? {} : {runId})
    const seen = collect(turn)
    await turn.waitForText('ok')
    return {turn, seen}
  }

  function askTurn(sessionId: string, runId?: string): Promise<RunEvents> {
    script().scriptToolCall('fixture_ask', {target: 'x'})
    return finished(sessionId, 'do the risky thing', runId === undefined ? {} : {runId})
  }

  function pendingAsk(runId: string) {
    return {approvalId: ASK_ID, toolCallId: expect.any(String), toolName: 'fixture_ask', input: {target: 'x'}, runId}
  }

  async function commandAsks(sessionId: string, approvalIds: string[]): Promise<void> {
    for (const approvalId of approvalIds) script().scriptCustomEvent('approval-requested', {approvalId, title: 'Bash'})
    await finished(sessionId, 'commands')
  }

  function decide(sessionId: string, approvalId: string, approved: boolean, scope: 'once' | 'session' = 'once') {
    return callerWith(sessionId).chat.permissionDecision({approvalId, approved, scope})
  }

  function callerWith(sessionId: string) {
    return makeRpcClient(chatKit().base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
  }

  function widgetRpc(sessionId: string) {
    return makeRpcClient(chatKit().base, {
      headers: {[CONCIV_SESSION_HEADER]: sessionId, origin: 'http://localhost:3000'},
    })
  }

  function callerWithout() {
    return makeRpcClient(chatKit().base)
  }

  function codeTurn(code: string): string {
    return script().scriptToolCall('execute_typescript', {typescriptCode: code})
  }

  function catchMessage(call: string): string {
    return `try { await ${call} } catch (error) { return String(error.message) }`
  }

  async function sessionMeta(sessionId: string) {
    const meta = (await chatKit().hub.call('conciv:sessions:list', {includeHidden: true})).find(
      (entry) => entry.id === sessionId,
    )
    if (meta === undefined) throw new Error(`session ${sessionId} is not listed`)
    return meta
  }

  async function compactMarkers(sessionId: string): Promise<number[]> {
    const markers = await chatKit().rpc.markers.list({sessionId})
    return markers.filter((marker) => marker.kind === 'compact').map((marker) => marker.afterTurn)
  }

  async function thread(sessionId: string): Promise<ChatMessage[]> {
    return (await chatKit().hydrate(sessionId)).messages
  }

  async function threadUserTexts(sessionId: string): Promise<string[]> {
    return (await thread(sessionId)).filter((message) => message.role === 'user').map(textOfParts)
  }

  async function assistantTexts(sessionId: string): Promise<string[]> {
    return (await thread(sessionId)).filter((message) => message.role === 'assistant').map(textOfParts)
  }

  function textOfParts(message: ChatMessage): string {
    return message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(' ')
  }

  function roleTexts(messages: ChatMessage[]): string[][] {
    return messages.map((message) => [message.role, textOfParts(message)])
  }

  function assistantIdsOf(events: RunEvents): string[] {
    return foldChatEvents(events.all)
      .filter((message) => message.role === 'assistant')
      .map((message) => message.id)
  }

  function assistantView(events: RunEvents) {
    return foldChatEvents(events.all)
      .filter((message) => message.role === 'assistant')
      .map((message) => ({id: message.id, parts: message.parts}))
  }

  function nonCustomTypes(events: RunEvents): string[] {
    return events.all.filter((chunk) => chunk.type !== ChatEventType.CUSTOM).map((chunk) => chunk.type)
  }

  function sessionRunIdOf(chunk: ChatEvent): string | null {
    return sessionRunEvent.parse(chunk)?.runId ?? null
  }

  function collect(stream: RunStream): ChatEvent[] {
    const seen: ChatEvent[] = []
    stream.tap((chunk) => seen.push(chunk))
    return seen
  }

  function count(events: RunEvents, type: ChatEvent['type']): number {
    return events.all.filter((chunk) => chunk.type === type).length
  }

  function eventRunIdsOf(events: RunEvents, type: ChatEvent['type']): string[] {
    return events.all.flatMap((chunk) => (chunk.type === type && 'runId' in chunk ? [String(chunk.runId)] : []))
  }

  function runsOf(sessionId: string): SeenRun[] {
    return seenRuns.filter((run) => run.sessionId === sessionId)
  }

  function lastRunOf(sessionId: string): SeenRun {
    const run = runsOf(sessionId).at(-1)
    if (run === undefined) throw new Error(`no turn reached the CLI for ${sessionId}`)
    return run
  }

  function overlapping(runs: SeenRun[]): boolean {
    return runs.some((run, index) =>
      runs
        .slice(index + 1)
        .some((other) => run.startedAt < (other.endedAt ?? Infinity) && other.startedAt < (run.endedAt ?? Infinity)),
    )
  }

  function toolCallParts(messages: ChatMessage[]) {
    return messages.flatMap((message) => message.parts.flatMap((part) => (part.type === 'tool-call' ? [part] : [])))
  }

  function cardMetadata(part: ReturnType<typeof toolCallParts>[number] | undefined): unknown {
    return part !== undefined && 'metadata' in part ? part.metadata : undefined
  }

  function resultsOf(messages: ChatMessage[]): string {
    return messages
      .flatMap((message) => message.parts.flatMap((part) => (part.type === 'tool-result' ? [part.content] : [])))
      .join('\n')
  }

  function isExpansion(part: ChatMessage['parts'][number]): boolean {
    return part.type === 'text' && part.content === 'fixture-expanded'
  }

  function isTurnBoundary(chunk: ChatEvent): boolean {
    return chunk.type === ChatEventType.RUN_STARTED || chunk.type === ChatEventType.RUN_FINISHED
  }

  function isUiCall(chunk: ChatEvent): boolean {
    return chunk.type === ChatEventType.TOOL_CALL_START && chunk.toolCallName.endsWith('conciv_ui')
  }

  function isResultFor(chunk: ChatEvent, text: string): boolean {
    return chunk.type === ChatEventType.TOOL_CALL_RESULT && JSON.stringify(chunk).includes(text)
  }

  function readCall() {
    return {name: 'Read', input: {file_path: 'a.ts'}, result: {text: 'a'}}
  }

  function attachmentParts() {
    return [
      {type: 'text', content: 'why?'},
      {type: 'document', source: {type: 'data', mimeType: FIXTURE_MIME, value: 'eyJpZCI6MX0='}},
      {type: 'document', source: {type: 'data', mimeType: 'application/x-unknown', value: 'eA=='}},
      {type: 'document', source: {type: 'data', mimeType: BROKEN_MIME, value: 'eA=='}},
    ]
  }

  function answerFor(name: string): PageOutcome {
    if (name === 'page_click') return {ok: true, result: {ok: true}}
    if (name === 'page_screenshot') return {ok: true, result: {image: SCREENSHOT_BYTES, width: 8, height: 6}}
    return {ok: true, result: {text: 'page-ok'}}
  }

  async function capturingConsole<T>(work: () => Promise<T>): Promise<{result: T; lines: string[]}> {
    const lines: string[] = []
    const original = {error: console.error, warn: console.warn}
    const capture = (...args: unknown[]): void => {
      lines.push(args.map(String).join(' '))
    }
    console.error = capture
    console.warn = capture
    try {
      return {result: await work(), lines}
    } finally {
      console.error = original.error
      console.warn = original.warn
    }
  }

  function sseTurn(sessionId: string, runId: string, text: string, signal: AbortSignal): Promise<Response> {
    return fetch(`${chatKit().base}${CHAT_SSE_PATH}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        threadId: sessionId,
        runId,
        messages: [{id: `${runId}-user`, role: 'user', content: text}],
        tools: [],
        context: [],
      }),
      signal,
    })
  }

  async function leaveAfterFirstText(sessionId: string, runId: string): Promise<void> {
    const viewer = new AbortController()
    await readSse(await sseTurn(sessionId, runId, 'nobody watches', viewer.signal), ChatEventType.TEXT_MESSAGE_CONTENT)
    viewer.abort()
  }

  const SocketFrameSchema = z.object({chunk: SseChunkSchema}).loose()

  async function dropSocketAfterFirstText(sessionId: string, runId: string): Promise<void> {
    const socket = new WebSocket(`${chatKit().wsBase}${CHAT_WS_PATH}`)
    const opened = Promise.withResolvers<void>()
    const firstText = Promise.withResolvers<void>()
    socket.addEventListener('open', () => opened.resolve(), {once: true})
    socket.addEventListener('error', () => opened.reject(new Error('the chat socket did not open')), {once: true})
    socket.addEventListener('message', (event) => {
      const data: unknown = JSON.parse(String(event.data))
      const frame = SocketFrameSchema.safeParse(data)
      if (SseChunkSchema.safeParse(data).data?.type === ChatEventType.RUN_ERROR) {
        firstText.reject(new Error(`the turn failed: ${String(event.data)}`))
      }
      if (frame.success && frame.data.chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT) firstText.resolve()
    })
    await opened.promise
    socket.send(
      JSON.stringify({
        threadId: sessionId,
        runId,
        messages: [{id: `${runId}-user`, role: 'user', content: 'reload while I work'}],
        tools: [],
        context: [],
      }),
    )
    await firstText.promise
    const closed = Promise.withResolvers<void>()
    socket.addEventListener('close', () => closed.resolve(), {once: true})
    socket.close()
    await closed.promise
  }

  async function readSse(response: Response, until: string): Promise<string[]> {
    const body = response.body
    if (body === null) throw new Error('the SSE response has no body')
    const reader = body.pipeThrough(new TextDecoderStream()).getReader()
    const seen: string[] = []
    const buffer = {text: ''}
    for (;;) {
      const next = await reader.read()
      if (next.done) return seen
      buffer.text += next.value
      const frames = buffer.text.split('\n\n')
      buffer.text = frames.pop() ?? ''
      const types = frames
        .flatMap((frame) => frame.split('\n'))
        .flatMap((line) => (line.startsWith('data: ') ? [SseChunkSchema.safeParse(JSON.parse(line.slice(6)))] : []))
        .flatMap((parsed) => (parsed.success ? [parsed.data.type] : []))
      seen.push(...types)
      if (types.includes(until)) {
        await reader.cancel()
        return seen
      }
    }
  }

  function fakeNativeId(sessionId: string): string {
    return `fake-${sessionId}`
  }

  function transcriptPathOf(nativeId: string): string {
    return requireTranscriptPath(requireClaude())(chatKit().stateRoot, HarnessSessionId.parse(nativeId), app.claudeHome)
  }

  function writeTranscript(nativeId: string, lines: string[]): string {
    const path = transcriptPathOf(nativeId)
    mkdirSync(dirname(path), {recursive: true})
    writeFileSync(path, lines.join('\n'))
    return path
  }

  function existingTranscript(nativeId: string): string[] {
    const path = transcriptPathOf(nativeId)
    if (!existsSync(path)) return []
    return readFileSync(path, 'utf8').split('\n').filter(Boolean)
  }

  async function turnWithTranscript(
    sessionId: string,
    input: TurnInput,
    index: number,
    cliText = typeof input === 'string' ? input : '',
    extra: string[] = [],
  ): Promise<string> {
    script().hold()
    const turn = await send(sessionId, input)
    await turn.waitForText('ok')
    const nativeId = fakeNativeId(sessionId)
    const lines = [...existingTranscript(nativeId), ...transcriptTurn(cliText, 'ok', index), ...extra]
    const path = writeTranscript(nativeId, lines)
    script().release()
    await turn.done(GUARD)
    return path
  }

  function transcriptLine(role: 'user' | 'assistant', text: string, uuid: string, used?: Record<string, number>) {
    return JSON.stringify({
      type: role,
      uuid,
      message: {id: uuid, role, content: [{type: 'text', text}], ...(used === undefined ? {} : {usage: used})},
    })
  }

  function transcriptTurn(prompt: string, reply: string, index: number): string[] {
    return [transcriptLine('user', prompt, `rec-u-${index}`), transcriptLine('assistant', reply, `rec-a-${index}`)]
  }

  function terminalTurns(prompts: string[], firstIndex = 0): string[] {
    return prompts.flatMap((prompt, index) => transcriptTurn(prompt, `reply ${index}`, firstIndex + index))
  }

  function contextUsageLines(): string[] {
    return [
      transcriptLine('assistant', 'early', 'ctx-a1', {input_tokens: 100, cache_read_input_tokens: 10}),
      transcriptLine('assistant', 'late', 'ctx-a2', {input_tokens: 300, cache_read_input_tokens: 20}),
    ]
  }

  async function mcpTool(name: string): Promise<McpTool> {
    const tool = (await app.mcpTools()).find((entry) => entry.name === name)
    if (tool === undefined) throw new Error(`${name} is not on /api/mcp`)
    return tool
  }

  async function runTypescript(code: string): Promise<unknown> {
    const reply = await (await mcpTool('execute_typescript')).execute({typescriptCode: code})
    return typeof reply === 'string' ? JSON.parse(reply) : reply
  }

  async function executeResult(code: string): Promise<unknown> {
    return ResultEnvelopeSchema.parse(await runTypescript(code)).result
  }

  async function headerMcpCall(headers: Record<string, string>): Promise<void> {
    const client = await connectMcpClient(`${chatKit().base}/api/mcp`, headers)
    await (
      await client.tools()
    )
      .find((tool) => tool.name === 'execute_typescript')
      ?.execute({typescriptCode: 'return 1'})
    await client.close()
  }

  function mcpPost(headers: Record<string, string>): Promise<Response> {
    return fetch(`${chatKit().base}/api/mcp`, {
      method: 'POST',
      headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'}),
    })
  }
})

describe('token charset', () => {
  function tempRoot(): string {
    return mkdtempSync(join(tmpdir(), 'conciv-token-charset-'))
  }

  async function bootWithToken(root: string, accessToken: string): Promise<Engine> {
    return start({
      options: {harnessBin: 'true', stateRoot: root},
      root,
      launchEditor: () => {},
      accessToken,
    })
  }

  test('an invalid token refuses to boot with a constraint-naming error', async () => {
    const root = tempRoot()
    let engine: Engine | undefined
    try {
      await expect(async () => {
        engine = await bootWithToken(root, ':a')
      }).rejects.toThrow('accessToken must be a UUID pairing token')
    } finally {
      await engine?.stop()
      rmSync(root, {recursive: true, force: true})
    }
  })
})

describe('claude tanstack', () => {
  const runReal = !process.env.CI

  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'claude-tanstack-')))

  describe('claude through claudeCodeText + conciv sandbox/gate', () => {
    it.skipIf(!runReal)(
      'streams a real turn and resumes the session',
      () =>
        assertTurnAndResume({
          harness: claude,
          dir,
          sessionId: SessionId.parse('conciv_it-1'),
          sessionEvent: 'claude-code.session-id',
        }),
      120_000,
    )
  })
})

describe('codex tanstack', () => {
  const runReal = !process.env.CI && harnessAvailable(codex)

  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'codex-tanstack-')))

  describe('codex through codexText + conciv sandbox/gate', () => {
    it.skipIf(!runReal)(
      'streams a real turn and resumes the session',
      () =>
        assertTurnAndResume({
          harness: codex,
          dir,
          sessionId: SessionId.parse('conciv_it-codex-1'),
          sessionEvent: 'codex.session-id',
        }),
      120_000,
    )
  })
})

describe('opencode tanstack', () => {
  const optIn = process.env.CONCIV_OPENCODE_IT === '1'
  const runReal = !process.env.CI && optIn && harnessAvailable(opencode)

  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'opencode-tanstack-')))

  describe('opencode through opencodeText + conciv sandbox/gate (opt-in: CONCIV_OPENCODE_IT=1 + a funded opencode provider)', () => {
    it.skipIf(!runReal)(
      'streams a real turn and resumes the session',
      () =>
        assertTurnAndResume({
          harness: opencode,
          dir,
          sessionId: SessionId.parse('conciv_it-opencode-1'),
          sessionEvent: 'opencode.session-id',
          ...(process.env.CONCIV_OPENCODE_IT_MODEL ? {model: process.env.CONCIV_OPENCODE_IT_MODEL} : {}),
        }),
      180_000,
    )
  })
})

describe('extension tool call id', () => {
  const echoCallId = defineTool({
    name: 'acme_echo_call_id',
    description: 'Echo the tool call id the request carries',
    inputSchema: z.object({}),
    outputSchema: z.object({toolCallId: z.string()}),
    meta: {summary: 'echo the request tool call id', category: 'fixture', mutating: false},
  }).server((_input, _ctx, request) => ({toolCallId: request.toolCallId ?? 'none'}))

  const acme = defineExtension({name: 'acme', tools: [echoCallId]})

  const EchoResultSchema = z.object({toolCallId: z.string()})

  const cleanups: (() => Promise<void>)[] = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })

  describe('an extension tool run from a chat turn knows which tool call it is answering', () => {
    it('hands the tool the same call id the turn put on the wire', async () => {
      const harness = createTestHarness(requireClaude())
      const kit = await bootKit({extensions: [acme]}, harness)
      cleanups.push(() => kit.cleanup())
      const sessionId = await kit.session()
      harness.script.scriptToolCall('execute_typescript', {
        typescriptCode: 'return await external_acme_echo_call_id({})',
      })
      const stream = await kit.turn('echo the call id', {session: sessionId, runId: randomUUID()})
      const events = await stream.done({hangGuardMs: 20_000})

      const call = events.toolCalls('acme_echo_call_id').at(-1)
      if (call === undefined) throw new Error('the chat turn never carried the tool call')
      const answer = events.all.findLast(
        (chunk) => chunk.type === ChatEventType.TOOL_CALL_RESULT && chunk.toolCallId === call.toolCallId,
      )
      if (
        answer === undefined ||
        answer.type !== ChatEventType.TOOL_CALL_RESULT ||
        typeof answer.content !== 'string'
      ) {
        throw new Error('the chat turn never carried a result for the tool call')
      }
      expect(EchoResultSchema.parse(JSON.parse(answer.content)).toolCallId).toBe(call.toolCallId)
    }, 40_000)
  })
})

describe('registry extension tools', () => {
  const lens = defineTool({
    name: 'acme_lens',
    description: 'Inspect the acme lens assembly.',
    inputSchema: z.object({zoom: z.number().int().min(1)}),
    outputSchema: z.object({zoom: z.number(), focused: z.boolean()}),
    errors: {LENS_JAMMED: {message: 'the lens is jammed'}},
    meta: {summary: 'inspect the lens assembly', category: 'acme', mutating: false},
  }).server((input) => {
    if (input.zoom > 3) throw toolError('LENS_JAMMED', {message: 'the lens is jammed'})
    return {zoom: input.zoom, focused: true}
  })

  const acme = defineExtension({name: 'acme', tools: [lens]})

  const halfDeclared = defineTool({
    name: 'acme_dial',
    description: 'Turn the acme dial without declaring meta or an output schema.',
    inputSchema: z.object({turns: z.number().int()}),
  }).server((input) => ({turns: input.turns}))

  const legacy = defineExtension({name: 'legacy-acme', tools: [halfDeclared]})

  async function discover(kit: Kit, name: string): Promise<unknown> {
    const client = await connectMcpClient(`${kit.base}/api/mcp`, {[CONCIV_SESSION_HEADER]: await kit.session()})
    try {
      const tool = (await client.tools()).find((entry) => entry.name === 'discover_tools')
      if (tool === undefined) throw new Error('discover_tools is not on /api/mcp')
      return await tool.execute({toolNames: [name]})
    } finally {
      await client.close()
    }
  }

  async function runSandbox(kit: Kit, typescriptCode: string): Promise<unknown> {
    const session = await kit.session()
    return makeRunTypescript(kit.base, session)(typescriptCode)
  }

  describe('registry-declared extension tools ride the tool registry into the sandbox', () => {
    const shared: {kit: Kit | undefined} = {kit: undefined}

    beforeAll(async () => {
      shared.kit = await bootKit({extensions: [acme]})
    })

    afterAll(async () => {
      await shared.kit?.cleanup()
    })

    function kit(): Kit {
      if (shared.kit === undefined) throw new Error('the app did not boot')
      return shared.kit
    }

    it('appears in discover_tools with its declared summary and input', async () => {
      const found = JSON.stringify(await discover(kit(), 'acme_lens'))
      expect(found).toContain('inspect the lens assembly')
      expect(found).toContain('zoom')
    })

    it('rejects malformed input with a loud validation error, never a silent success', async () => {
      const failed = await runSandbox(
        kit(),
        "try { await external_acme_lens({zoom: 'way too much'}); return 'no-error' } catch (error) { return String(error) }",
      )
      expect(z.string().parse(failed)).not.toBe('no-error')
      expect(z.string().parse(failed).toLowerCase()).toMatch(/input|invalid|zoom/)
    })

    it('refuses to boot a tool declared without meta and an output schema instead of forwarding it', async () => {
      await expect(bootKit({extensions: [acme, legacy]})).rejects.toThrow(/acme_dial/)
    })
  })
})

describe('start dev endpoint', () => {
  type EngineCase = {
    accessToken?: string
    serveNativePage?: boolean
  }

  async function withStartedEngine(
    engineCase: EngineCase,
    assertEndpoint: (engine: Engine, endpointDir: string) => Promise<void>,
  ): Promise<void> {
    const root = mkdtempSync(join(tmpdir(), 'conciv-start-endpoint-'))
    const endpointDir = mkdtempSync(join(tmpdir(), 'conciv-endpoint-dir-'))
    try {
      const engine = await start({
        options: {harnessBin: 'true', stateRoot: root, systemPrompt: false},
        root,
        launchEditor: () => {},
        accessToken: engineCase.accessToken,
        nativePageDir: engineCase.serveNativePage ? root : undefined,
        devEndpointDir: endpointDir,
      })
      await assertEndpoint(engine, endpointDir)
    } finally {
      rmSync(root, {recursive: true, force: true})
      rmSync(endpointDir, {recursive: true, force: true})
    }
  }

  describe('start pairing file', () => {
    it('writes the endpoint on boot when a native page is served and removes it on stop', async () => {
      await withStartedEngine(
        {accessToken: 'c56a4180-65aa-42ec-a945-5fd21dec0538', serveNativePage: true},
        async (engine, endpointDir) => {
          const endpoint = readDevEndpoint(endpointDir)
          expect(endpoint).toEqual({
            apiBase: `http://127.0.0.1:${engine.port}/t/c56a4180-65aa-42ec-a945-5fd21dec0538`,
            token: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
            pid: process.pid,
          })
          await engine.stop()
          expect(readDevEndpoint(endpointDir)).toBeNull()
        },
      )
    })

    it('serves /native and writes a tokenless endpoint with no ios config (the zero-config widget path)', async () => {
      await withStartedEngine({serveNativePage: true}, async (engine, endpointDir) => {
        const page = await fetch(`http://127.0.0.1:${engine.port}/native`)
        expect(page.status).toBe(200)
        expect(await page.text()).toContain('data-conciv-native-root')

        expect(readDevEndpoint(endpointDir)).toEqual({
          apiBase: `http://127.0.0.1:${engine.port}`,
          token: null,
          pid: process.pid,
        })
        await engine.stop()
        expect(readDevEndpoint(endpointDir)).toBeNull()
      })
    })
  })
})

describe('api mcp claude image', () => {
  const PNG_RED_64x64 =
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAQAAAAABGUUKwAAAAqklEQVRoBe3SsQ0AIRDEwHv675kvYgJ0ksm9Apvvzu5zdl9/pge8LliBCqCBvhAKZLwCrBAHKoACGa8AK8SBCqBAxivACnGgAiiQ8QqwQhyoAApkvAKsEAcqgAIZrwArxIEKoEDGK8AKcaACKJDxCrBCHKgACmS8AqwQByqAAhmvACvEgQqgQMYrwApxoAIokPEKsEIcqAAKZLwCrBAHKoACGa8AK8SB9QV+UoUBf2UT5GIAAAAASUVORK5CYII='

  describe('claude native image input', () => {
    it.skipIf(!runReal)(
      'delivers an image to claude so the model sees its pixels',
      async () => {
        const kit = await bootKit()
        try {
          const events = await runTurn(
            kit,
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  content: 'An image is included in this message. Reply with ONLY the dominant color name.',
                },
                {type: 'image', source: {type: 'data', mimeType: 'image/png', value: PNG_RED_64x64}},
              ],
            },
            await kit.session(),
          )
          expect(events.text().toLowerCase()).toContain('red')
        } finally {
          await kit.cleanup()
        }
      },
      120_000,
    )
  })
})

describe('api mcp claude session header', () => {
  const echo = defineTool({
    name: 'acme_echo_session',
    description: 'Echo the request session back',
    inputSchema: z.object({}),
    outputSchema: z.object({sessionId: z.string().nullable()}),
    meta: {summary: 'echo the request session back', category: 'fixture', mutating: false},
  }).server((_input, _ctx, request) => ({sessionId: request.sessionId}))

  const acme = defineExtension({name: 'acme', tools: [echo]})

  async function echoedSession(base: string, headers: Record<string, string>): Promise<string> {
    const mcp = await connectMcpClient(`${base}/api/mcp`, headers)
    try {
      const tool = (await mcp.tools()).find((candidate) => candidate.name === 'execute_typescript')
      if (!tool?.execute) throw new Error('execute_typescript not registered on /api/mcp')
      const raw = await tool.execute({typescriptCode: 'return await external_acme_echo_session({})'})
      const reply = z
        .object({result: z.object({sessionId: z.string()})})
        .loose()
        .parse(JSON.parse(z.string().parse(raw)))
      return reply.result.sessionId
    } finally {
      await mcp.close()
    }
  }

  describe('/api/mcp resolves the calling claude session', () => {
    it('keeps honouring the conciv session header the owned and tty paths send', async () => {
      const kit = await bootKit({extensions: [acme]})
      try {
        expect(await echoedSession(kit.base, {[CONCIV_SESSION_HEADER]: 'conciv_x'})).toBe('conciv_x')
      } finally {
        await kit.cleanup()
      }
    }, 30_000)
  })
})
