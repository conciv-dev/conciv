import {until} from '@conciv/harness-testkit/until'
import {makeJournal, makePageBus} from '../src/page/page-bus.js'
import {makePageQueues} from '../src/page/page-queue.js'
import {
  rmSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
  existsSync,
  readFileSync,
  readdirSync,
  utimesSync,
  symlinkSync,
  renameSync,
  chmodSync,
} from 'node:fs'
import {createHash, randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {once} from 'node:events'
import {open, readFile, writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {createServer, request as httpRequest} from 'node:http'
import {DatabaseSync} from 'node:sqlite'
import {crc32, deflateSync} from 'node:zlib'
import {tmpdir} from 'node:os'
import {basename, join, dirname} from 'node:path'
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  afterEach,
  onTestFailed,
  onTestFinished,
  test,
  vi,
  beforeEach,
} from 'vitest'
import {createMCPClient, imageToolProvisioner, makeTextAdapter} from '@conciv/ai/server'
import {foldChatEvents} from '@conciv/ai/testkit'
import {
  abortableFetch,
  browserRpcConnection,
  cappedValue,
  codeExecuteReply,
  makeBrowserRpcClient,
  PluginExperimentalBundleSchema,
  SOCKET_TRUST_FRAME,
  type EngineStaleness,
} from '@conciv/contract'
import {
  defineExtension,
  defineTool,
  makeExtRpcClient,
  type ServerApi,
  type ToolMiddleware,
  imageResult,
  defineAttachment,
} from '@conciv/extension'
import {toolError} from '@conciv/protocol/tool-call-types'
import {openSource} from '@conciv/extension/client'
import {getHarness, type HarnessAdapter} from '@conciv/harness'
import {createHubConnections} from '@conciv/harness-init/hub'
import {
  anchorKey,
  chatMetadata,
  chatRuns,
  concivHome,
  listEngines,
  migrations,
  openDb,
  recordHubConnection,
  registerEngine,
  removeHubConnection,
  sessions,
  TRANSCRIPT_NAMESPACE,
  withHomeDb,
} from '@conciv/db'
import {asc, eq} from 'drizzle-orm'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {isEqual, uniq} from 'es-toolkit'
import {
  createFakeHarness,
  type FakeHarness,
  serveApp,
  type ServedApp,
  makeRpcClient,
  type Kit,
  createTestHarness,
  createTestkit,
  connectMcpClient,
  makeCallTool,
  approvePending,
  type FixtureSession,
  type TestHarness,
  type RunEvents,
  type RunStream,
  type McpClient,
  type McpTool,
  type RpcClient,
} from '@conciv/harness-testkit'
import {Plugin, Rpc as PluginRpc, type RpcRegistration} from '@conciv/plugin'
import {evaluatePluginBundle} from '@conciv/plugin/experimental/host'
import {InstructionEntry, Location, PluginHost, Session} from '@conciv/plugin-host'
import {claude} from '@conciv/harness/claude'
import {codex as codexHarness} from '@conciv/harness/codex'
import {pi as piHarness} from '@conciv/harness/pi'
import * as Bundler from '@conciv/plugin/schema/bundler'
import {
  readApprovalAsk,
  type ChatEvent,
  ChatEventType,
  pageQueueEvent,
  runLifecycleEvent,
  sessionRunEvent,
} from '@conciv/protocol/chat-event-types'
import {fetchServerSentEvents, webSocket} from '@conciv/ai/client'
import {type ChatMessage} from '@conciv/protocol/chat-message-types'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {
  CHAT_SSE_PATH,
  HarnessSessionId,
  SessionId,
  CONCIV_SESSION_HEADER,
  CHAT_WS_PATH,
  CONCIV_CLAUDE_SESSION_HEADER,
  CONCIV_CLIENT_HEADER,
  CONCIV_NAMED_TAB_HEADER,
  CONCIV_ORIGIN_HEADER,
  type HubAccess,
  TabOpenSchema,
  TabsSchema,
  type ReasoningEffort,
} from '@conciv/protocol/chat-types'
import {type TtyCommand} from '@conciv/protocol/terminal-types'
import {revokeBrowsers} from '@conciv/protocol/engine-trust'
import {concivStateDir} from '@conciv/protocol/state-types'
import {
  type ElementCapture,
  type ElementCaptureKind,
  SessionCapturesSchema,
} from '@conciv/protocol/element-capture-types'
import {
  type HarnessChatDeps,
  type HarnessConnectContext,
  type HarnessListCursor,
  type HarnessModel,
} from '@conciv/protocol/harness-types'
import {PageQueueResultSchema, PAGE_TRANSPORT_ERROR_CODES} from '@conciv/protocol/page-types'
import {RPC_WS_PATH, type RpcContext} from '@conciv/protocol/rpc-types'
import {type TokenUsage} from '@conciv/protocol/usage-types'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import {RPCLink as WebsocketRpcLink} from '@orpc/client/websocket'
import {onError, ORPCError, os, type RouterClient} from '@orpc/server'
import WebSocket from 'ws'
import {Effect, ManagedRuntime, Schema} from 'effect'
import * as Page from '@conciv/plugin-page/rpc'
import {pageTabs, type PageReply, type PageTab} from '@conciv/plugin-page-testkit/page-tabs'
import {z} from 'zod'
import {makeApp, type MadeApp} from '../src/app.js'
import {callTrace} from '../src/api/call-trace.js'
import {resolveConfig} from '../src/config.js'
import {originAllowed} from '../src/lib/cors.js'
import {provideSessions} from '../src/runtime/plugin-sessions.js'
import {provideServersSource} from '../src/runtime/servers-source.js'
import {createSessionSearch} from '../src/sessions/session-search.js'
import {start, type Engine} from '../src/start.js'
import {sampleServerExtension, sampleState} from './fixtures/sample-server-extension.js'
import corePackage from '../package.json' with {type: 'json'}
import {
  bootKit,
  bootMadeApp,
  requireClaude,
  bootCoreApp,
  requireTranscriptPath,
  chunkWithInlineMap,
  hydratedSnapshot,
  runTurn,
  userTexts,
} from './helpers.js'
import {tempDir} from '@conciv/vitest-config/temp-dir'

function groupAlive(group: number): boolean {
  try {
    process.kill(-group, 0)
    return true
  } catch {
    return false
  }
}

async function nextEvent<Value extends {readonly type: string}>(
  events: AsyncIterator<Value, unknown>,
): Promise<IteratorResult<Value, unknown>> {
  const next = await events.next()
  if (next.done !== true && next.value.type === 'server.heartbeat') return nextEvent(events)
  return next
}

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

const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const ONE_PIXEL_WEBP =
  'UklGRh4CAABXRUJQVlA4WAoAAAAgAAAAAAAAAAAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggMAAAAPABAJ0BKgEAAQABQCYloAJ0ugH4AAUhAAD+y7f/2ln6ln6ln+PL/5sCua59zQAAAA=='

function pageSuccess(
  value: Page.Result['value'],
  more: Omit<z.input<typeof Page.Result>, 'value' | 'files'> = {},
): PageReply {
  return {type: 'success', result: {value, files: [], ...more}}
}

async function executeOverMcp(base: string, headers: Record<string, string>, typescriptCode: string): Promise<unknown> {
  const mcp = await connectMcpClient(`${base}/api/mcp`, headers)
  try {
    const tool = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
    if (!tool?.execute) throw new Error('execute_typescript not on /api/mcp')
    return await tool.execute({typescriptCode})
  } finally {
    await mcp.close()
  }
}

function sseTurn(
  base: string,
  sessionId: string,
  runId: string,
  text: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${base}${CHAT_SSE_PATH}`, {
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

function sseStream(response: Response) {
  const body = response.body
  if (body === null) throw new Error('the SSE response has no body')
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  const read = {text: ''}
  const ended = async (): Promise<string> => {
    const next = await reader.read()
    if (next.done) return read.text
    read.text += next.value
    return ended()
  }
  const reach = async (marker: string): Promise<string> => {
    if (read.text.includes(marker)) return marker
    const next = await reader.read()
    if (next.done) return read.text
    read.text += next.value
    return reach(marker)
  }
  const cancel = () => reader.cancel()
  return {reach, ended, cancel}
}

async function readSse(response: Response, stopType: string): Promise<void> {
  const stream = sseStream(response)
  await stream.reach(`"type":"${stopType}"`)
  await stream.cancel()
}

function registryCall(base: string, sessionId: string) {
  return (name: string, input: Record<string, unknown>) =>
    makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}}).registry.call({name, input})
}

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

  it('echoes CORS headers on an actual rpc call (never *)', async () => {
    const res = await fetch(`${kit().base}/rpc/sessions/list`, {
      method: 'POST',
      headers: {origin: ORIGIN, 'content-type': 'application/json'},
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
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

  afterEach(async () => {
    await state.served?.close()
    await state.dispose?.()
    state.served = undefined
    state.dispose = undefined
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  async function serveWithProbe(staleness: () => EngineStaleness): Promise<ServedApp> {
    const root = tempDir('conciv-staleness-di-')
    dirs.push(root)
    const {fetch, dispose, agentToken} = await makeApp({
      cfg: resolveConfig({}, root),
      cwd: root,
      openInEditor: () => {},
      staleness,
    })
    state.dispose = dispose
    const served = await serveApp(fetch)
    state.served = served
    return {...served, base: `${served.base}/t/${agentToken}`}
  }

  describe('engine staleness dependency injection (IT, real http)', () => {
    const staleNotice = 'WARNING: this engine is running outdated code'

    async function executeTool(base: string) {
      const mcp = await connectMcpClient(`${base}/api/mcp`)
      try {
        const tools = await mcp.tools()
        const tool = tools.find((entry) => entry.name === 'execute_typescript')
        const discover = tools.find((entry) => entry.name === 'discover_tools')
        if (!discover) throw new Error('discover_tools not on /api/mcp')
        if (!tool) throw new Error('execute_typescript not on /api/mcp')
        const listed = await tool.execute({
          typescriptCode: 'return Object.keys(globalThis).filter((key) => key.startsWith("external_"))',
        })
        const sandboxNames = z.object({result: z.array(z.string())}).parse(JSON.parse(String(listed))).result
        const version = mcp.serverVersion()
        return {description: tool.description, discoverDescription: discover.description, sandboxNames, version}
      } finally {
        await mcp.close()
      }
    }

    it('reports the injected probe on /health with or without the token, rpc meta.engine and the execute tool description, and the core version', async () => {
      const calls = {count: 0}
      const served = await serveWithProbe(() => {
        calls.count += 1
        return INJECTED
      })

      const health = await Promise.all(
        [served.base, `http://127.0.0.1:${served.port}`].map(async (base): Promise<unknown> =>
          (await fetch(`${base}/health`)).json(),
        ),
      )
      const engine = await makeRpcClient(served.base).meta.engine()
      const {description, discoverDescription, sandboxNames, version} = await executeTool(served.base)

      expect(version).toBe(corePackage.version)
      const liveness = {ok: true, harness: expect.any(String), engine: {stale: INJECTED.stale}, id: expect.any(String)}
      expect(health).toEqual([liveness, liveness])
      expect(engine).toEqual(INJECTED)
      expect(description.slice(0, staleNotice.length)).toBe(staleNotice)
      expect(description).toContain('@conciv/injected-probe')
      expect(description).toContain('Rules of the sandbox:')
      expect(description.length).toBeLessThanOrEqual(4096)
      expect(description).toContain('## Code Mode tools (call only inside `execute_typescript`)')
      expect(description).toContain('The catalog is partial.')
      expect(description).toContain('- server (6 tools')
      expect(sandboxNames).toContain('external_server_transform')
      expect(sandboxNames.filter((name) => name.startsWith('external_page_'))).toEqual([])
      expect(
        sandboxNames.filter((name) => !description.includes(`- ${name.slice('external_'.length).split('_', 1)[0]} (`)),
      ).toEqual([])
      expect(discoverDescription.length).toBeLessThanOrEqual(4096)
      expect(discoverDescription).not.toContain('external_server_transform')
      expect(calls.count).toBeGreaterThanOrEqual(3)
    }, 20_000)

    it('bounds the staleness notice and the names list so a huge changed list keeps the description within budget', async () => {
      const changed = Array.from({length: 2000}, (_, index) => `@conciv/changed-package-${index}`)
      const served = await serveWithProbe(() => ({...INJECTED, changed}))
      const {description, sandboxNames} = await executeTool(served.base)

      expect(description.length).toBeLessThanOrEqual(4096)
      expect(sandboxNames.filter((name) => !description.includes(name)).length).toBeGreaterThan(0)
      expect(description.slice(0, staleNotice.length)).toBe(staleNotice)
      expect(description).toContain('@conciv/changed-package-0')
      expect(description).toMatch(/, and \d+ more\)\. Restart the dev server/)
      expect(description).toContain('Run TypeScript in a secure sandbox wired to this project.')
      expect(description).toContain('Rules of the sandbox:')
      expect(description).toContain('find it with the global `search(...)` function')
    }, 20_000)

    it('the execute tool description says nothing about staleness while the engine matches the code on disk', async () => {
      const served = await serveWithProbe(() => ({...INJECTED, stale: false, changed: []}))
      const {description} = await executeTool(served.base)
      expect(description).toContain('Rules of the sandbox:')
      expect(description).not.toContain(staleNotice)
    }, 20_000)
  })
})

describe('api extension mount isolation', () => {
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
      const stateRoot = tempDir('conciv-mount-')
      state.stateRoot = stateRoot

      const broken = defineExtension({name: 'broken'}).server(() => {
        throw new Error('boom')
      })
      const healthy = defineExtension({name: 'healthy', tools: [healthyTool]}).server(() => ({context: {ready: true}}))

      try {
        const env = {stateRoot, cwd: stateRoot, harness: requireClaude(), print: () => {}}
        const made = await bootMadeApp(env, {extensions: [broken, healthy]})
        state.made = made

        expect(made.extensionContexts.healthy).toEqual({ready: true})
        expect('broken' in made.extensionContexts).toBe(false)
        expect(errors.some((line) => line.includes('extension "broken" failed to mount'))).toBe(true)
      } finally {
        spy.mockRestore()
      }
    }, 30_000)

    it('still fails boot loudly on a duplicate extension name (config error is not swallowed)', async () => {
      const stateRoot = tempDir('conciv-mount-dup-')
      state.stateRoot = stateRoot
      const first = defineExtension({name: 'dup'}).server(() => ({context: {}}))
      const second = defineExtension({name: 'dup'}).server(() => ({context: {}}))
      const env = {stateRoot, cwd: stateRoot, harness: requireClaude(), print: () => {}}
      await expect(bootMadeApp(env, {extensions: [first, second]})).rejects.toThrow(
        /slug collision: "dup" is claimed by both "dup" and "dup"/,
      )
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
    expect(result.origin).toBe(kit().origin)
  })
})

describe('api extension server surfaces', () => {
  test('extension server api exposes sessions + harness surfaces backed by the real store', async () => {
    const captured: {server?: ServerApi<Record<never, never>, {fontSize: number}>} = {}
    const runEnd = {resolve: (_sessionId: SessionId) => {}}
    const runEnded = new Promise<SessionId>((resolve) => (runEnd.resolve = resolve))
    const probe = defineExtension({
      name: 'probe',
      settings: z.object({fontSize: z.number().default(13)}),
    }).server((server) => {
      captured.server = server
      return {context: {}, turnEnd: (sessionId) => runEnd.resolve(sessionId)}
    })
    const harness = createTestHarness(claude)
    const kit = await createTestkit(harness, bootCoreApp({extensions: [probe]})).setup()
    try {
      const server = captured.server
      if (!server) throw new Error('server api not captured')
      const sessionId = SessionId.parse(await kit.session())

      expect(await server.settings.all()).toEqual({fontSize: 13})
      await server.scope('probe').settings.project.set('fontSize', 18)
      expect(await server.settings.all()).toEqual({fontSize: 18})
      await server.scope('probe').settings.project.set('fontSize', 'large')
      expect(await server.settings.all()).toEqual({fontSize: 13})

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

      expect(server.basePath).toMatch(/^\/t\/[0-9a-f-]{36}$/)
      const surface = await server.harness(sessionId)
      expect(surface.id).toBe('claude')
      expect(typeof surface.ttyCommand).toBe('function')
      const noSuchToken = HarnessSessionId.parse('no-such-token')
      expect(await surface.transcriptExists?.(noSuchToken)).toBe(false)

      expect(await surface.transcriptMessages?.(noSuchToken)).toEqual([])
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
        const messages = await surface.transcriptMessages?.(token)
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

describe('api installed harnesses', () => {
  const saved = {PATH: process.env.PATH, HOME: process.env.HOME}

  afterEach(() => {
    process.env.PATH = saved.PATH
    process.env.HOME = saved.HOME
  })

  it('offers a harness for switching only when its binary is on PATH, not for a config directory alone', async () => {
    const root = tempDir('conciv-installed-harnesses-')
    const bin = join(root, 'bin')
    const home = join(root, 'home')
    mkdirSync(bin)
    mkdirSync(join(home, '.gemini'), {recursive: true})
    writeFileSync(join(bin, 'codex'), '', {mode: 0o755})
    process.env.PATH = bin
    process.env.HOME = home
    const {app, dispose} = await makeApp({cfg: resolveConfig({}, root), cwd: root, openInEditor: () => {}})
    process.env.PATH = saved.PATH
    process.env.HOME = saved.HOME
    const served = await serveApp(app.fetch)
    try {
      const {harnesses} = await makeRpcClient(served.base).meta.harnesses()
      expect(harnesses.map((harness) => harness.id)).toEqual(['claude', 'codex'])
    } finally {
      await served.close()
      await dispose()
      rmSync(root, {recursive: true, force: true})
    }
  })
})

describe('connect hub', () => {
  const root = realpathSync(tempDir('conciv-connect-hub-'))
  const engineHome = join(root, 'engine-home')
  const kit = sharedKit(() => bootKit({home: engineHome}, createFakeHarness({id: 'fake-hub'})))
  const saved = {PATH: process.env.PATH, HOME: process.env.HOME, CONCIV_HOME: process.env.CONCIV_HOME}
  const file = {
    argv: join(root, 'argv'),
    exists: join(root, 'exists'),
    fail: join(root, 'fail'),
    missing: join(root, 'missing'),
  }
  const hubCommand = ['npx', '-y', `@conciv/cli@${corePackage.version}`, 'mcp', 'serve', '--agent', 'claude']

  beforeEach(() => {
    mkdirSync(join(root, 'bin'), {recursive: true})
    mkdirSync(join(root, 'home'))
    const script = [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> '${file.argv}'`,
      `if [ -f '${file.fail}' ]; then echo boom >&2; exit 2; fi`,
      `if [ "$2" = remove ] && [ -f '${file.missing}' ]; then echo 'No MCP server found with name: conciv-hub' >&2; exit 1; fi`,
      `if [ "$2" = remove ]; then /bin/rm -f '${file.exists}'; exit 0; fi`,
      `if [ -f '${file.exists}' ]; then echo 'MCP server conciv-hub already exists in user config' >&2; exit 1; fi`,
    ]
    writeFileSync(join(root, 'bin', 'claude'), script.join('\n'), {mode: 0o755})
    Object.assign(process.env, {PATH: join(root, 'bin'), HOME: join(root, 'home'), CONCIV_HOME: join(root, 'conciv')})
  })

  afterEach(() => {
    Object.assign(process.env, saved)
    if (saved.CONCIV_HOME === undefined) delete process.env.CONCIV_HOME
    rmSync(root, {recursive: true, force: true})
  })

  const hubAgents = async () => {
    const stream = await kit().rpc.meta.hubAgents()
    const first = await stream.next()
    await stream.return?.(undefined)
    if (first.done === true) throw new Error('meta.hubAgents ended before its first snapshot')
    return first.value
  }

  const hubInstalls = async () => (await hubAgents()).installs

  const hubConnections = async () => (await hubAgents()).connections

  const claudeConnection = {harnessId: 'claude', name: 'Claude'}

  const invocations = () => readFileSync(file.argv, 'utf8').trim().split('\n')

  const addLine = [
    'mcp',
    'add',
    '-s',
    'user',
    'conciv-hub',
    '-e',
    `CONCIV_HOME=${engineHome}`,
    '--',
    ...hubCommand,
  ].join(' ')

  it('connectHub runs the harness add command over a trusted connection only, and the harness leaves the list', async () => {
    await expect(makeRpcClient(kit().origin).meta.connectHub({harness: 'claude'})).rejects.toThrow()
    expect(existsSync(file.argv)).toBe(false)
    expect(await kit().rpc.meta.connectHub({harness: 'claude'})).toEqual({ok: true})
    expect(invocations()).toEqual([addLine])
    expect(await hubInstalls()).toEqual([])
  })

  it('connectHub replaces an already-installed hub so it reads this engine home', async () => {
    writeFileSync(file.exists, '')
    expect(await kit().rpc.meta.connectHub({harness: 'claude'})).toEqual({ok: true})
    expect(invocations()).toEqual([addLine, 'mcp remove -s user conciv-hub', addLine])
    expect(await hubInstalls()).toEqual([])
  })

  it("connectHub returns the CLI's message on failure", async () => {
    writeFileSync(file.fail, '')
    expect(await kit().rpc.meta.connectHub({harness: 'claude'})).toEqual({ok: false, message: 'boom'})
    expect(await hubInstalls()).toEqual([{harnessId: 'claude', name: 'Claude'}])
  })

  it('disconnectHub runs the harness remove command and the harness moves back from connected to the list', async () => {
    expect(await kit().rpc.meta.connectHub({harness: 'claude'})).toEqual({ok: true})
    expect(await hubConnections()).toEqual([claudeConnection])
    expect(await kit().rpc.meta.disconnectHub({harness: 'claude'})).toEqual({ok: true})
    expect(invocations()).toEqual([addLine, 'mcp remove -s user conciv-hub'])
    expect(await hubConnections()).toEqual([])
    expect(await hubInstalls()).toEqual([{harnessId: 'claude', name: 'Claude'}])
  })

  it('disconnectHub forgets the connection before the CLI runs: a failing remove still disconnects with a note, a missing server counts as removed, opencode names its leftover entry', async () => {
    expect(await kit().rpc.meta.connectHub({harness: 'claude'})).toEqual({ok: true})
    writeFileSync(file.fail, '')
    expect(await kit().rpc.meta.disconnectHub({harness: 'claude'})).toEqual({
      ok: true,
      note: 'Claude could not remove its conciv-hub entry (boom); conciv refuses it until you reconnect.',
    })
    expect(await hubConnections()).toEqual([])
    rmSync(file.fail)
    expect(await kit().rpc.meta.connectHub({harness: 'claude'})).toEqual({ok: true})
    writeFileSync(file.missing, '')
    expect(await kit().rpc.meta.disconnectHub({harness: 'claude'})).toEqual({ok: true})
    expect(await hubConnections()).toEqual([])
    expect(await kit().rpc.meta.disconnectHub({harness: 'opencode'})).toEqual({
      ok: true,
      note: 'OpenCode keeps its conciv-hub entry in opencode.json; conciv refuses it until you reconnect.',
    })
  })

  it('an agent connected or disconnected outside the engine reaches a meta.hubAgents subscriber', async () => {
    const stream = await kit().rpc.meta.hubAgents()
    onTestFinished(async () => {
      await stream.return?.(undefined)
    })
    const nextConnections = async () => {
      const step = await stream.next()
      if (step.done === true) throw new Error('meta.hubAgents ended while it was watched')
      return step.value.connections
    }
    expect(await nextConnections()).toEqual([])
    withHomeDb(engineHome, (db) => recordHubConnection(db, 'claude', Date.now()))
    expect(await nextConnections()).toEqual([claudeConnection])
    withHomeDb(engineHome, (db) => removeHubConnection(db, 'claude'))
    expect(await nextConnections()).toEqual([])
  })

  it('an outside agent can neither connect nor disconnect agents, and the harness CLI never runs', async () => {
    const outside = makeRpcClient(kit().base, {
      headers: {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: 'terminal'},
    })
    const refusal = "outside agents can't connect or disconnect agents; do it in the tab"
    expect(await outside.meta.connectHub({harness: 'claude'}).then(String, String)).toContain(refusal)
    expect(await outside.meta.disconnectHub({harness: 'claude'}).then(String, String)).toContain(refusal)
    expect(existsSync(file.argv)).toBe(false)
  })

  it('a hub call from a harness with no connection is refused at both doors with the reconnect text, and passes once connected', async () => {
    const as = (client: string) => ({[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: client})
    const refusal =
      'Claude is disconnected from conciv; reconnect it from the conciv widget or run `conciv mcp connect claude`'
    const rpcAs = (client: string) =>
      makeRpcClient(kit().base, {headers: as(client)})
        .meta.harnesses()
        .then(String, String)
    const mcpAs = (client: string) => executeOverMcp(kit().base, as(client), 'return 21 * 2').then(String, String)
    expect(await rpcAs('claude')).toContain(refusal)
    expect(await mcpAs('claude')).toContain(refusal)
    expect(await rpcAs('terminal')).not.toContain('disconnected')
    expect(await mcpAs('terminal')).toContain('42')
    expect(await kit().rpc.meta.connectHub({harness: 'claude'})).toEqual({ok: true})
    expect(await rpcAs('claude')).not.toContain('disconnected')
    expect(await mcpAs('claude')).toContain('42')
  })
})

describe('api codex turns', () => {
  const saved = {PATH: process.env.PATH, HOME: process.env.HOME, CODEX_HOME: process.env.CODEX_HOME}
  const root = tempDir('conciv-codex-turns-')
  const bin = join(root, 'bin')
  const fakeCodex = [
    '#!/bin/sh',
    'prompt=$(cat)',
    'echo "$@" > "$(dirname "$0")/args"',
    `case "$prompt" in *stubborn*) trap '' TERM ;; esac`,
    'case "$prompt" in *"stop me"*) ps -o pgid= -p $$ | tr -d " " > "$(dirname "$0")/group"; sleep 600 ;; esac',
    'count_file="$(dirname "$0")/count"',
    'count=$(( $(cat "$count_file" 2>/dev/null || echo 0) + 1 ))',
    'echo "$count" > "$count_file"',
    `echo '{"type":"thread.started","thread_id":"codex-thread-'"$count"'"}'`,
    `echo '{"type":"item.started","item":{"id":"item_0","type":"command_execution","command":"ls","aggregated_output":"","status":"in_progress"}}'`,
    `echo '{"type":"item.completed","item":{"id":"item_0","type":"command_execution","command":"ls","aggregated_output":"listed","exit_code":0,"status":"completed"}}'`,
    `echo '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"answer '"$count"'"}}'`,
    `echo '{"type":"turn.completed","usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1}}'`,
  ].join('\n')
  beforeAll(() => {
    mkdirSync(bin)
    mkdirSync(join(root, 'home', '.codex'), {recursive: true})
    writeFileSync(
      join(root, 'home', '.codex', 'models_cache.json'),
      JSON.stringify({
        models: [
          {
            slug: 'gpt-fake',
            display_name: 'GPT Fake',
            visibility: 'list',
            priority: 1,
            supported_reasoning_levels: [{effort: 'medium'}, {effort: 'xhigh'}],
          },
        ],
      }),
    )
    writeFileSync(join(bin, 'codex'), fakeCodex, {mode: 0o755})
    process.env.PATH = `${bin}:${saved.PATH ?? ''}`
    process.env.HOME = join(root, 'home')
    process.env.CODEX_HOME = join(root, 'home', '.codex')
  })
  const kit = sharedKit(() => createTestkit(codexHarness, bootCoreApp()).setup())

  afterAll(() => {
    process.env.PATH = saved.PATH
    process.env.HOME = saved.HOME
    process.env.CODEX_HOME = saved.CODEX_HOME
    rmSync(root, {recursive: true, force: true})
  })

  it('keeps every codex reply under its own question although codex numbers its items from item_0 each turn', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    for (const question of ['first question', 'second question', 'third question']) {
      await runTurn(kit(), question, sessionId)
    }
    const snapshot = await hydratedSnapshot(kit(), sessionId)
    const shown = snapshot.messages.map((message) => ({
      role: message.role,
      text: message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(' '),
      toolCalls: message.parts.filter((part) => part.type === 'tool-call').length,
    }))
    expect(shown).toEqual([
      {role: 'user', text: 'first question', toolCalls: 0},
      {role: 'assistant', text: 'answer 1', toolCalls: 1},
      {role: 'user', text: 'second question', toolCalls: 0},
      {role: 'assistant', text: 'answer 2', toolCalls: 1},
      {role: 'user', text: 'third question', toolCalls: 0},
      {role: 'assistant', text: 'answer 3', toolCalls: 1},
    ])
  }, 30_000)

  it('runs codex at the effort picked for the session', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await kit().rpc.sessions.model({sessionId, model: 'gpt-fake'})
    await kit().rpc.sessions.effort({sessionId, effort: 'xhigh'})
    await runTurn(kit(), 'think hard', sessionId)
    expect(readFileSync(join(bin, 'args'), 'utf8')).toContain('model_reasoning_effort="xhigh"')
    await kit().rpc.sessions.effort({sessionId, effort: null})
    await runTurn(kit(), 'think normally', sessionId)
    expect(readFileSync(join(bin, 'args'), 'utf8')).not.toContain('model_reasoning_effort')
  }, 30_000)

  it("stop kills the agent's whole process group, also an agent that ignores SIGTERM after its wrapper died", async () => {
    for (const prompt of ['stop me', 'stop me, stubborn']) {
      const sessionId = (await kit().rpc.sessions.create()).sessionId
      const runId = randomUUID()
      rmSync(join(bin, 'group'), {force: true})
      void (await kit().turn(prompt, {session: sessionId, runId})).done().catch(() => undefined)
      await until(() => existsSync(join(bin, 'group')) && readFileSync(join(bin, 'group'), 'utf8').endsWith('\n'))
      const group = Number(readFileSync(join(bin, 'group'), 'utf8'))
      expect(groupAlive(group)).toBe(true)
      await kit().rpc.chat.stop({sessionId, runIds: [runId]})
      await until(() => !groupAlive(group), {hangGuardMs: 12_000, intervalMs: 50})
    }
  }, 40_000)
})

describe('api claude turns', () => {
  const saved = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CLAUDE_CODE_EFFORT_LEVEL: process.env.CLAUDE_CODE_EFFORT_LEVEL,
    MAX_THINKING_TOKENS: process.env.MAX_THINKING_TOKENS,
  }
  const root = tempDir('conciv-claude-turns-')
  const bin = join(root, 'bin')
  const fakeClaude = [
    '#!/bin/sh',
    'cat > /dev/null',
    'printf "%s\\n" "$@" > "$(dirname "$0")/args"',
    'printf "effort=%s thinking=%s" "$CLAUDE_CODE_EFFORT_LEVEL" "$MAX_THINKING_TOKENS" > "$(dirname "$0")/env"',
    `echo '{"type":"system","subtype":"init","session_id":"claude-native-1","model":"fake","tools":[]}'`,
    `echo '{"type":"result","subtype":"success","result":"ok"}'`,
  ].join('\n')
  beforeAll(() => {
    mkdirSync(bin)
    mkdirSync(join(root, 'home'))
    writeFileSync(join(bin, 'claude'), fakeClaude, {mode: 0o755})
    process.env.PATH = `${bin}:${saved.PATH ?? ''}`
    process.env.HOME = join(root, 'home')
    delete process.env.CLAUDE_CODE_EFFORT_LEVEL
    delete process.env.MAX_THINKING_TOKENS
  })
  const made: {app: MadeApp | null} = {app: null}
  const kit = sharedKit(() =>
    createTestkit(claude, async (env) => {
      const app = await bootMadeApp(env)
      made.app = app
      return {fetch: app.fetch, dispose: app.dispose, agentToken: app.agentToken}
    }).setup(),
  )

  afterAll(() => {
    Object.assign(process.env, saved)
    if (saved.CLAUDE_CODE_EFFORT_LEVEL === undefined) delete process.env.CLAUDE_CODE_EFFORT_LEVEL
    if (saved.MAX_THINKING_TOKENS === undefined) delete process.env.MAX_THINKING_TOKENS
    rmSync(root, {recursive: true, force: true})
  })

  async function cliRun(sessionId: string, model: string, effort: 'high' | null) {
    if (made.app === null) throw new Error('the app did not boot')
    await Effect.runPromise(made.app.chat.db.update(sessions).set({model, effort}).where(eq(sessions.id, sessionId)))
    await runTurn(kit(), `run ${model}`, sessionId)
    const args = readFileSync(join(bin, 'args'), 'utf8').split('\n')
    return {
      model: args[args.indexOf('--model') + 1],
      effortFlags: args.filter((arg) => arg === '--effort').length,
      env: readFileSync(join(bin, 'env'), 'utf8'),
    }
  }

  it('runs claude at the effort picked for the session through one setting, a Claude 5 model and a 4.x model alike', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await runTurn(kit(), 'first', sessionId)
    expect(await cliRun(sessionId, 'claude-opus-5', 'high')).toEqual({
      model: 'claude-opus-5',
      effortFlags: 0,
      env: 'effort=high thinking=',
    })
    expect(await cliRun(sessionId, 'claude-opus-4-7', 'high')).toEqual({
      model: 'claude-opus-4-7',
      effortFlags: 0,
      env: 'effort=high thinking=',
    })
    expect(await cliRun(sessionId, 'claude-opus-5', null)).toEqual({
      model: 'claude-opus-5',
      effortFlags: 0,
      env: 'effort= thinking=',
    })
  }, 30_000)
})

describe('api harness switching', () => {
  type SeenTurn = {harness: string; resumeSessionId: HarnessSessionId | null; model: string | undefined; sent: string}
  const seen: SeenTurn[] = []
  const NATIVE_BETA = HarnessSessionId.parse('beta-native-1')

  function recorded(base: FakeHarness): FakeHarness {
    return {
      ...base,
      chatConfig: (deps: HarnessChatDeps) => ({
        adapter: makeTextAdapter(base.id, async function* (options) {
          seen.push({
            harness: base.id,
            resumeSessionId: deps.resumeSessionId,
            model: deps.model,
            sent: JSON.stringify(options.messages),
          })
          yield* base.script.chatStream(deps, options)
        }),
      }),
    }
  }

  const alpha = recorded(
    createFakeHarness({id: 'alpha', displayName: 'Alpha', resume: true, models: [{id: 'a-model', name: 'A'}]}),
  )
  const betaTranscripts: FixtureSession[] = [
    {id: NATIVE_BETA, derivedTitle: 'a beta session', updatedAt: 5, sizeBytes: 2048},
  ]
  const beta = recorded(
    createFakeHarness({
      id: 'beta',
      displayName: 'Beta',
      resume: true,
      models: [{id: 'b-model', name: 'B'}],
      commands: [{name: 'beta-command', description: 'only beta has it'}],
      history: betaTranscripts,
    }),
  )
  const gamma: FakeHarness = {
    ...createFakeHarness({id: 'gamma', displayName: 'Gamma'}),
    models: () => Promise.reject(new Error('the gamma model probe failed')),
  }
  const made: {app: MadeApp | null} = {app: null}
  const kit = sharedKit(() =>
    createTestkit(alpha, async (env) => {
      const app = await bootMadeApp(env, {harnesses: [beta, gamma]})
      made.app = app
      return {fetch: app.fetch, dispose: app.dispose, agentToken: app.agentToken}
    }).setup(),
  )

  function db() {
    if (made.app === null) throw new Error('the app did not boot')
    return made.app.chat.db
  }

  function row(sessionId: string) {
    return Effect.runPromise(db().select().from(sessions).where(eq(sessions.id, sessionId)).get())
  }

  async function turn(sessionId: string, text: string): Promise<SeenTurn> {
    await (await kit().turn(text, {session: sessionId})).done()
    const last = seen.at(-1)
    if (last === undefined) throw new Error('no turn reached a harness')
    return last
  }

  it('lists every available harness with its models in one answer, a failed model list marked, the boot harness the default', async () => {
    expect(await kit().rpc.meta.harnesses(undefined)).toEqual({
      harnesses: [
        {
          id: 'alpha',
          name: 'Alpha',
          imageInput: false,
          persistentPty: false,
          models: [{id: 'a-model', name: 'A'}],
          defaultModel: 'a-model',
          modelsFailed: false,
        },
        {
          id: 'beta',
          name: 'Beta',
          imageInput: false,
          persistentPty: false,
          models: [{id: 'b-model', name: 'B'}],
          defaultModel: 'b-model',
          modelsFailed: false,
        },
        {
          id: 'gamma',
          name: 'Gamma',
          imageInput: false,
          persistentPty: false,
          models: [],
          defaultModel: null,
          modelsFailed: true,
        },
      ],
      defaultHarness: 'alpha',
    })
  })

  it('a switch that names a model leaves the session on that model and clears the effort, the next turn runs it', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await turn(sessionId, 'first question')
    await Effect.runPromise(db().update(sessions).set({effort: 'high'}).where(eq(sessions.id, sessionId)))

    expect(await kit().rpc.sessions.switchHarness({sessionId, harnessId: 'beta', model: 'b-model'})).toEqual({
      harnessId: 'beta',
    })

    expect(await row(sessionId)).toMatchObject({
      harnessKind: 'beta',
      harnessSessionId: null,
      model: 'b-model',
      effort: null,
    })
    expect(await turn(sessionId, 'second question')).toMatchObject({harness: 'beta', model: 'b-model'})
  })

  it('a switch whose row write fails is refused and leaves the session on its harness', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await turn(sessionId, 'stay on alpha when the write fails')
    const before = await row(sessionId)
    await Effect.runPromise(
      db().$client.unsafe(`CREATE TRIGGER switch_write_fails BEFORE UPDATE OF harness_kind ON sessions
      BEGIN SELECT RAISE(ABORT, 'switch write failed'); END`).raw,
    )
    onTestFinished(async () => {
      await Effect.runPromise(db().$client.unsafe('DROP TRIGGER switch_write_fails').raw)
    })

    await expect(kit().rpc.sessions.switchHarness({sessionId, harnessId: 'beta'})).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })

    expect(await row(sessionId)).toEqual(before)
  })

  it('rejects a switch naming a model the target harness does not list, and changes nothing', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await turn(sessionId, 'stay on alpha')
    const before = await row(sessionId)

    await expect(
      kit().rpc.sessions.switchHarness({sessionId, harnessId: 'beta', model: 'a-model'}),
    ).rejects.toMatchObject({code: 'UNKNOWN_MODEL'})

    expect(await row(sessionId)).toEqual(before)
  })

  it('a switch resets the session, the next turn replays the whole chat, and each reply keeps its harness', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await kit().rpc.sessions.model({sessionId, model: 'a-model'})
    expect(await turn(sessionId, 'first question')).toMatchObject({harness: 'alpha', resumeSessionId: null})
    const native = (await row(sessionId))?.harnessSessionId
    expect(native).toBeTruthy()
    expect(await turn(sessionId, 'second question')).toMatchObject({harness: 'alpha', resumeSessionId: native})
    await Effect.runPromise(
      db()
        .insert(chatMetadata)
        .values({namespace: TRANSCRIPT_NAMESPACE, key: anchorKey(sessionId), valueJson: {nativeId: 'alpha-tail'}}),
    )

    expect(await kit().rpc.sessions.switchHarness({sessionId, harnessId: 'beta'})).toEqual({harnessId: 'beta'})

    expect(await row(sessionId)).toMatchObject({harnessKind: 'beta', harnessSessionId: null, model: null})
    expect(
      await Effect.runPromise(
        db()
          .select()
          .from(chatMetadata)
          .where(eq(chatMetadata.key, anchorKey(sessionId))),
      ),
    ).toEqual([])
    const models = await kit().rpc.meta.models({sessionId})
    expect(models.harness.id).toBe('beta')
    expect(models.models.map((model) => model.id)).toEqual(['b-model'])
    expect((await kit().rpc.meta.commands({sessionId})).commands.map((command) => command.name)).toEqual([
      'beta-command',
    ])
    expect((await kit().rpc.sessions.get({sessionId: SessionId.parse(sessionId)})).harnessKind).toBe('beta')

    const replayed = await turn(sessionId, 'third question')
    expect(replayed).toMatchObject({harness: 'beta', resumeSessionId: null, model: undefined})
    expect(replayed.sent).toContain('first question')
    expect(replayed.sent).toContain('second question')
    expect(await turn(sessionId, 'fourth question')).toMatchObject({
      harness: 'beta',
      resumeSessionId: (await row(sessionId))?.harnessSessionId,
    })

    const hydration = await kit().hydrate(sessionId)
    const assistants = hydration.messages.filter((message) => message.role === 'assistant')
    expect(assistants.map((message) => hydration.messageHarness[message.id])).toEqual([
      'alpha',
      'alpha',
      'beta',
      'beta',
    ])
    const runs = await Effect.runPromise(
      db()
        .select({harnessId: chatRuns.harnessId})
        .from(chatRuns)
        .where(eq(chatRuns.threadId, sessionId))
        .orderBy(asc(chatRuns.startedAt)),
    )
    expect(runs.map((run) => run.harnessId)).toEqual(['alpha', 'alpha', 'beta', 'beta'])
  })

  it('a turn never resumes a native session that belongs to another harness', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await turn(sessionId, 'remember this')
    expect((await row(sessionId))?.harnessSessionId).toBeTruthy()
    await Effect.runPromise(db().update(sessions).set({harnessKind: 'uninstalled'}).where(eq(sessions.id, sessionId)))
    const next = await turn(sessionId, 'and now?')
    expect(next).toMatchObject({harness: 'alpha', resumeSessionId: null})
    expect(next.sent).toContain('remember this')
  })

  it('rejects a switch to an unavailable harness, for an unknown session, and while a run is in progress', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await expect(kit().rpc.sessions.switchHarness({sessionId, harnessId: 'nope'})).rejects.toMatchObject({
      code: 'UNKNOWN_HARNESS',
    })
    await expect(
      kit().rpc.sessions.switchHarness({sessionId: SessionId.parse('conciv_no_such_session'), harnessId: 'beta'}),
    ).rejects.toMatchObject({code: 'NOT_FOUND'})
    alpha.script.hold()
    const running = await kit().turn('hold on', {session: sessionId})
    try {
      await running.waitForRunStart()
      await expect(kit().rpc.sessions.switchHarness({sessionId, harnessId: 'beta'})).rejects.toMatchObject({
        code: 'SESSION_RUNNING',
      })
      expect((await row(sessionId))?.harnessKind).toBe('alpha')
    } finally {
      alpha.script.release()
      await running.done()
    }
  })

  it('switching to the current harness changes nothing', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await turn(sessionId, 'stay')
    const before = await row(sessionId)
    expect(await kit().rpc.sessions.switchHarness({sessionId, harnessId: 'alpha'})).toEqual({harnessId: 'alpha'})
    expect(await row(sessionId)).toEqual(before)
  })

  it('a native transcript a session owned before a switch never lists as a separate session, and never resumes', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await kit().rpc.sessions.switchHarness({sessionId, harnessId: 'beta'})
    await turn(sessionId, 'written into a beta transcript')
    const owned = (await row(sessionId))?.harnessSessionId
    if (!owned) throw new Error('the beta turn recorded no native session')
    betaTranscripts.push({
      id: HarnessSessionId.parse(owned),
      derivedTitle: 'the owned transcript',
      updatedAt: Date.now() + 3_600_000,
      text: 'a skua stole the catch',
    })
    const listings = async (includeHidden: boolean) => {
      const {sessions: listed} = await kit().rpc.sessions.list({includeHidden})
      return {
        owner: listed.filter((meta) => meta.id === sessionId).length,
        phantoms: listed.filter((meta) => meta.id !== sessionId && meta.native?.nativeId === owned).length,
      }
    }

    await kit().rpc.sessions.switchHarness({sessionId, harnessId: 'alpha'})
    expect(await listings(false)).toEqual({owner: 1, phantoms: 0})
    expect((await kit().rpc.sessions.list({limit: 1})).sessions).toHaveLength(1)
    await until(
      async () =>
        (await kit().rpc.sessions.search({term: 'owned transcript'})).sessions.some((meta) => meta.id === sessionId),
      {hangGuardMs: 5_000, intervalMs: 50},
    )
    const skuaHit = async () => {
      const {sessions: hits} = await kit().rpc.sessions.search({term: 'skua'})
      return hits.find((meta) => meta.id === sessionId)
    }
    await until(async () => (await skuaHit()) !== undefined, {hangGuardMs: 5_000, intervalMs: 50})
    const previewOfHit = async () => {
      const preview = (await skuaHit())?.preview
      if (!preview) throw new Error('the skua hit carries no transcript to preview')
      const ask = {harness: preview.harnessKind, nativeId: preview.nativeId, cwd: preview.cwd, before: null}
      const window = await kit().rpc.sessions.preview({...ask, limit: 10})
      return window.messages.flatMap((message) =>
        message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])),
      )
    }
    expect(await previewOfHit()).toEqual(['a skua stole the catch'])
    expect(await turn(sessionId, 'back on alpha')).toMatchObject({harness: 'alpha', resumeSessionId: null})
    expect(await previewOfHit()).toEqual(['a skua stole the catch'])
    await kit().rpc.sessions.switchHarness({sessionId, harnessId: 'beta'})
    const returned = await turn(sessionId, 'back on beta')
    expect(returned).toMatchObject({harness: 'beta', resumeSessionId: null})
    expect(returned.sent).toContain('written into a beta transcript')
    expect(await listings(false)).toEqual({owner: 1, phantoms: 0})

    await kit().rpc.sessions.delete({sessionId})
    expect(await listings(true)).toEqual({owner: 1, phantoms: 0})
    expect((await row(sessionId))?.deletedAt).not.toBeNull()
    expect(await listings(false)).toEqual({owner: 0, phantoms: 0})
    expect(await row(sessionId)).toMatchObject({deletedAt: expect.any(Number)})
    await kit().rpc.sessions.restore({sessionId})
    expect(await row(sessionId)).toMatchObject({deletedAt: null})

    const app = made.app
    if (app === null) throw new Error('the app did not boot')
    const search = createSessionSearch({db: app.chat.db, cwd: app.chat.cwd, harnesses: app.chat.harnesses})
    onTestFinished(() => search.dispose())
    const sessionKey = provideSessions(() => ({
      chat: app.chat,
      runtime: app.runtime,
      search,
      pluginHost: app.pluginHost,
      queues: makePageQueues({bus: makePageBus(), journal: makeJournal(app.chat.db)}),
    }))
    const key = <Success, Failure>(use: (service: Session.Interface) => Effect.Effect<Success, Failure>) =>
      Effect.runPromise(Session.Service.use(use).pipe(Effect.provide(sessionKey)))
    const id = SessionId.parse(sessionId)
    const oldMarkers = (await kit().rpc.markers.list({sessionId})).map((marker) => marker.id)
    expect(oldMarkers).not.toEqual([])
    await key((sessions) => sessions.setMetadata({sessionId: id, metadata: {ticket: 7}}))
    await key((sessions) =>
      sessions.setPermissions({sessionId: id, permissions: [{action: 'bash', resource: '*', effect: 'deny'}]}),
    )
    const old = await key((sessions) => sessions.get(id))
    expect(old).toMatchObject({metadata: {ticket: 7}, permissions: [{action: 'bash', resource: '*', effect: 'deny'}]})
    const entries = (run: (service: InstructionEntry.Interface) => Effect.Effect<unknown, unknown>) =>
      app.pluginHost.runPromise(InstructionEntry.Service.use(run))
    await entries((service) => service.put({sessionId: id, key: 'brief', value: 'the old session'}))
    expect(await entries((service) => service.list(id))).toEqual([{key: 'brief', value: 'the old session'}])
    await key((sessions) => sessions.remove(id))
    const location = Schema.decodeSync(Location.Ref)({directory: app.chat.cwd})
    const refused = await key((sessions) =>
      sessions.create({id, title: 'A new session on an old id', location}).pipe(Effect.flip),
    )
    expect(refused).toMatchObject({_tag: 'Session.NotFoundError', sessionId: id})
    expect((await row(sessionId))?.deletedAt).not.toBeNull()
    expect((await row(sessionId))?.title).not.toBe('A new session on an old id')
    expect(await row(sessionId)).toMatchObject({
      metadata: {ticket: 7},
      permissions: [{action: 'bash', resource: '*', effect: 'deny'}],
    })
    expect(await entries((service) => service.list(id))).toEqual([])
    expect(await key((sessions) => sessions.get(id).pipe(Effect.flip))).toMatchObject({_tag: 'Session.NotFoundError'})
    expect((await kit().rpc.markers.list({sessionId})).map((marker) => marker.id)).toEqual(oldMarkers)
    expect(await listings(false)).toEqual({owner: 0, phantoms: 0})
    expect(await row(sessionId)).toMatchObject({deletedAt: expect.any(Number)})
  })

  it('lists the native sessions of every available harness, labelled by harness', async () => {
    const {sessions: listed} = await kit().rpc.sessions.list(undefined)
    const imported = listed.find((meta) => meta.native?.nativeId === NATIVE_BETA)
    expect(imported).toMatchObject({
      harnessKind: 'beta',
      sizeBytes: 2048,
      native: {harnessKind: 'beta', nativeId: NATIVE_BETA},
    })
  })

  function racedApp() {
    const pendingListings: Array<() => void> = []
    const slow: FakeHarness = {
      ...createFakeHarness({id: 'slow', displayName: 'Slow'}),
      models: () => {
        const listing = Promise.withResolvers<HarnessModel[]>()
        pendingListings.push(() => listing.resolve([{id: 'slow-model', name: 'Slow', efforts: ['high']}]))
        return listing.promise
      },
    }
    const quick = createFakeHarness({id: 'quick', displayName: 'Quick', models: [{id: 'quick-model', name: 'Q'}]})
    const raced: {app: MadeApp | null} = {app: null}
    const racedKit = sharedKit(() =>
      createTestkit(slow, async (env) => {
        const app = await bootMadeApp(env, {harnesses: [quick]})
        raced.app = app
        return {fetch: app.fetch, dispose: app.dispose, agentToken: app.agentToken}
      }).setup(),
    )
    return {
      kit: racedKit,
      row: (sessionId: string) => {
        if (raced.app === null) throw new Error('the app did not boot')
        return Effect.runPromise(raced.app.chat.db.select().from(sessions).where(eq(sessions.id, sessionId)).get())
      },
      whileListingSlowModels: async (change: Promise<unknown>, sessionId: SessionId) => {
        const settled = change.then(
          (value) => ({status: 'fulfilled', value}),
          (reason: unknown) => ({status: 'rejected', reason}),
        )
        await vi.waitFor(() => expect(pendingListings.length).toBe(1), {timeout: 2000, interval: 5})
        await racedKit().rpc.sessions.switchHarness({sessionId, harnessId: 'quick'})
        pendingListings.splice(0).forEach((release) => release())
        return settled
      },
    }
  }

  describe('a model change racing a harness switch', () => {
    const raced = racedApp()
    it('a model validated against the old harness never lands on the new one', async () => {
      const sessionId = (await raced.kit().rpc.sessions.create()).sessionId
      const outcome = await raced.whileListingSlowModels(
        raced.kit().rpc.sessions.model({sessionId, model: 'slow-model'}),
        sessionId,
      )
      expect(outcome).toMatchObject({status: 'rejected', reason: {code: 'UNKNOWN_MODEL'}})
      expect(await raced.row(sessionId)).toMatchObject({harnessKind: 'quick', model: null, effort: null})
    })
  })

  describe('an effort change racing a harness switch', () => {
    const raced = racedApp()
    it('an effort validated against the old harness never lands on the new one', async () => {
      const sessionId = (await raced.kit().rpc.sessions.create()).sessionId
      const outcome = await raced.whileListingSlowModels(
        raced.kit().rpc.sessions.effort({sessionId, effort: 'high'}),
        sessionId,
      )
      expect(outcome).toMatchObject({status: 'rejected', reason: {code: 'UNSUPPORTED_EFFORT'}})
      expect(await raced.row(sessionId)).toMatchObject({harnessKind: 'quick', model: null, effort: null})
    })
  })
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

    it('rejects a hostile Host with no Origin, naming the host as the failed check', async () => {
      const reply = await postMcpOverHttp(port(), `evil.com:${port()}`)
      expect(reply.status).toBe(403)
      expect(reply.body).toBe('forbidden host')
      expect(reply.body).not.toContain('origin')
    })
  })

  describe('/api/mcp engine gate (IT, real http)', () => {
    const kit = sharedKit(() => bootKit())

    it('an MCP client without the agent token is refused with 401', async () => {
      await expect(connectMcpClient(`${new URL(kit().base).origin}/api/mcp`)).rejects.toMatchObject({code: 401})
    })
  })
})

describe('api mcp execute result', () => {
  const PNG_RED_4x4 =
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='

  const snap = defineTool({
    name: 'probe_snap',
    description: 'returns a png',
    inputSchema: z.object({}),
    outputSchema: z.array(z.object({type: z.string()}).loose()),
    meta: {summary: 'return a png image', category: 'fixture', mutating: false},
  }).server(() => imageResult('image/png', PNG_RED_4x4, {width: 4}))

  describe('/api/mcp execute result mapping', () => {
    const kit = sharedKit(() => bootKit({extensions: [defineExtension({name: 'probe', tools: [snap]})]}))
    const execute = (typescriptCode: string) => executeOverMcp(kit().base, {}, typescriptCode)

    it('returns image content blocks for an imageResult capability', async () => {
      expect(await execute('return await external_probe_snap({})')).toEqual([
        {type: 'image', source: {type: 'data', value: PNG_RED_4x4, mimeType: 'image/png'}},
        {type: 'text', content: JSON.stringify({width: 4})},
      ])
    })

    it('marks a failed execution as an MCP error, never a success-shaped result', async () => {
      await expect(execute("throw new Error('deliberate failure')")).rejects.toThrow('deliberate failure')
    })
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
    it('exposes the identical tool shape on more than one harness, over the token path', async () => {
      const codex = getHarness('codex')
      if (!codex) throw new Error('codex adapter not registered')
      const shapes: string[][] = []
      for (const harness of [requireClaude(), codex]) {
        const kit = await bootKit({extensions: [acme]}, createTestHarness(harness))
        expect(new URL(kit.base).pathname).toMatch(/^\/t\/[0-9a-f-]{36}$/)
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
    it('serves the native page under /t/<token> with a prefix-relative bundle and its widget chunks, and unprefixed as an open page', async () => {
      const root = tempDir('conciv-native-token-')
      const nativeDir = tempDir('conciv-native-dist-')
      const endpointDir = tempDir('conciv-native-ep-')
      writeFileSync(join(nativeDir, BUNDLE), 'globalThis.__conciv_native_loaded = true')
      mkdirSync(join(nativeDir, 'widget'))
      writeFileSync(join(nativeDir, 'widget', 'mount-impl-Ab_9.js'), 'export const chunk = 1')
      writeFileSync(join(nativeDir, 'secret.txt'), 'outside the chunk dir')
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
        const match = /<script\b[^>]*\bsrc="([^"]+)"/.exec(html)
        const src = match?.[1]
        expect(src).toBe(`native/${BUNDLE}`)
        if (src === undefined) throw new Error('no script src in native page')

        const resolved = new URL(src, pageUrl)
        expect(resolved.pathname).toBe(`/t/${token}/native/${BUNDLE}`)
        const script = await fetch(resolved)
        expect(script.status).toBe(200)
        expect(script.headers.get('content-type')).toContain('javascript')

        const chunk = await fetch(new URL('widget/mount-impl-Ab_9.js', resolved))
        expect(chunk.status).toBe(200)
        expect(chunk.headers.get('content-type')).toContain('javascript')
        expect(await chunk.text()).toBe('export const chunk = 1')
        expect((await fetch(new URL('widget/..%2Fsecret.txt', resolved))).status).toBe(404)
        expect((await fetch(new URL('widget/missing-chunk.js', resolved))).status).toBe(404)

        const unprefixed = await fetch(`${origin}/native`)
        expect(unprefixed.status).toBe(200)
      } finally {
        await engine.stop()
        rmSync(root, {recursive: true, force: true})
        rmSync(nativeDir, {recursive: true, force: true})
        rmSync(endpointDir, {recursive: true, force: true})
      }
    })
  })
})

describe('api page open source', () => {
  describe('editor.openFromFrames', () => {
    const opened: Array<{file: string; line?: number}> = []
    const record = (file: string, line?: number) => opened.push({file, ...(line === undefined ? {} : {line})})
    const withPage = sharedKit(() => bootKit({cwd: tmpdir(), openInEditor: record}))
    const withoutPage = sharedKit(() => bootKit({cwd: tmpdir(), openInEditor: record, configPlugins: ['-conciv.page']}))

    beforeEach(() => {
      opened.splice(0)
    })

    async function openFrames(kit: Kit, frames: {fileName: string; line: number; column: number}[]) {
      const rpc = makeRpcClient(kit.base, {headers: {[CONCIV_SESSION_HEADER]: await kit.session()}})
      return rpc.editor.openFromFrames({frames})
    }

    it('opens the original source a bundled frame points at', async () => {
      const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
      expect(await openFrames(withPage(), [{fileName: `file://${chunk}`, line: 2, column: 1}])).toEqual({
        status: 'opened',
      })
      expect(opened).toEqual([{file: 'app/page.tsx', line: 17}])
    })

    it('with the page plugin removed by config, opens the frame as the page gave it', async () => {
      const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
      expect(await openFrames(withoutPage(), [{fileName: `file://${chunk}`, line: 2, column: 1}])).toEqual({
        status: 'opened',
      })
      expect(opened).toEqual([{file: `file://${chunk}`, line: 2}])
    })

    it('an open asked while the plugins are still starting opens the original source once they are active', async () => {
      const booted: MadeApp[] = []
      const kit = await createTestkit(requireClaude(), async (env) => {
        const made = await bootMadeApp(env, {cwd: tmpdir(), openInEditor: record})
        booted.push(made)
        return made
      }).setup()
      onTestFinished(() => kit.cleanup())
      const made = booted[0]
      if (made === undefined) throw new Error('the kit booted no app')
      const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
      const asked = openFrames(kit, [{fileName: `file://${chunk}`, line: 2, column: 1}])
      await made.awaitActivation()
      expect(await asked).toEqual({status: 'opened'})
      expect(opened).toEqual([{file: 'app/page.tsx', line: 17}])
    })

    it('a page plugin call from a tab while the plugins are still starting answers once they are active', async () => {
      const entered = Promise.withResolvers<void>()
      const gate = Promise.withResolvers<void>()
      const served = Promise.withResolvers<string>()
      onTestFinished(() => gate.resolve())
      const holder = Plugin.define({
        id: 'activation-holder',
        async setup() {
          entered.resolve()
          await gate.promise
        },
      })
      const setup = createTestkit(requireClaude(), async (env) => {
        const made = await bootMadeApp(env, {cwd: tmpdir(), plugins: [holder]})
        return {
          ...made,
          fetch: (...input: Parameters<MadeApp['fetch']>) => {
            const url = new URL(input[0].url)
            served.resolve(`${url.origin}/t/${made.agentToken}`)
            if (url.pathname.endsWith('/rpc/plugin/call')) gate.resolve()
            return made.fetch(...input)
          },
        }
      }).setup()
      onTestFinished(async () => (await setup).cleanup())
      await entered.promise
      const asked = makeRpcClient(await served.promise).plugin.call({
        rpcId: 'experimental.page',
        method: 'sessions.attached',
        input: {},
      })
      expect(await asked).toEqual([])
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

  describe('page tools through registry.call (IT, real server, typed rpc)', () => {
    const tabs = pageTabs()
    const kit = sharedKit(() => bootKit({cwd: tmpdir(), plugins: [tabs.plugin]}))
    const state: {tab: PageTab | undefined} = {tab: undefined}

    const page = async (method: string, input: Record<string, unknown> = {}): Promise<unknown> =>
      kit().rpc.plugin.call({rpcId: 'experimental.page', method, input: {sessionId: await kit().session(), ...input}})

    const run = async (name: string, input: Record<string, unknown> = {}): Promise<unknown> =>
      registryCall(kit().base, await kit().session())(name, input)

    afterEach(async () => {
      state.tab?.end()
      state.tab = undefined
      await page('clearChanges')
    })

    it('a call its rpc caller aborts drops its page query, so the late reply settles nothing', async () => {
      const sessionId = await kit().session()
      state.tab = await tabs.open(sessionId, () => undefined)
      const calling = new AbortController()
      const called = makeRpcClient(kit().base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}}).registry.call(
        {name: 'page_route', input: {}},
        {signal: calling.signal},
      )
      const requestId = await state.tab.requested()
      calling.abort()
      await expect(called).rejects.toThrow()
      await state.tab.cancelled(requestId)
      await expect(state.tab.command(requestId)).rejects.toThrow('Page request is no longer available.')
    })

    it('run is no page method: an eval through plugin.call is refused as an unknown method and never reaches the tab', async () => {
      const heard: string[] = []
      state.tab = await tabs.open(await kit().session(), ({action}) => {
        heard.push(action.type)
        return pageSuccess({result: 'conciv'})
      })
      await expect(page('run', {action: {type: 'eval', code: 'document.title'}})).rejects.toMatchObject({
        data: {type: 'rpc.method_not_found'},
      })
      expect(heard).toEqual([])
    })

    it('registry.call reports PAGE_TIMEOUT when the page never replies', async () => {
      state.tab = await tabs.open(await kit().session(), () => undefined)
      await expect(run('page_wait', {selector: 'body', timeout: 100})).rejects.toMatchObject({
        code: 'PAGE_TIMEOUT',
        message: expect.stringContaining('page_wait: [page.timeout]'),
      })
    })

    it('reports [page.disconnected] when no tab is attached', async () => {
      await expect(run('page_route')).rejects.toMatchObject({
        code: 'NO_PAGE_CLIENT',
        message: 'page_route: no widget connected to session',
      })
    })

    it('enriches a locate reply with symbolicated source through the server-wrapped locate tool', async () => {
      const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
      state.tab = await tabs.open(await kit().session(), () =>
        pageSuccess({component: 'Home', stack: ['Home'], frames: [{fileName: `file://${chunk}`, line: 2, column: 1}]}),
      )
      const data = LocateSchema.parse(await run('page_locate', {selector: 'h1'}))
      expect(data.component).toBe('Home')
      expect(data.source).toEqual({file: 'app/page.tsx', line: 17, column: 4})
    })

    it("a failed handler raises the action's own error, and a refused mutation is not journaled", async () => {
      state.tab = await tabs.open(await kit().session(), ({action}) =>
        action.type === 'text'
          ? {type: 'failure', code: 'handler-error', message: 'handler-error says no'}
          : {type: 'failure', code: 'invalid-args', message: 'no element for selector #email'},
      )
      await expect(run('page_text', {selector: '#h'})).rejects.toMatchObject({
        code: 'HANDLER_ERROR',
        message: 'page_text: handler-error says no',
      })
      await expect(run('page_fill', {selector: '#email', value: 'a@b.c'})).rejects.toMatchObject({
        code: 'INVALID_ARGS',
        message: 'page_fill: no element for selector #email',
      })
      expect(ChangesSchema.parse(await page('changes'))).toEqual([])
    })

    it('journals a fill with its value but never a read, and clear empties the journal', async () => {
      state.tab = await tabs.open(await kit().session(), ({action}) =>
        action.type === 'text' ? pageSuccess({text: 'hi'}) : pageSuccess({ok: true, value: 'a@b.c'}),
      )
      await run('page_text', {selector: '#h'})
      expect(await run('page_fill', {selector: '#email', value: 'a@b.c'})).toEqual({
        ok: true,
        value: 'a@b.c',
      })
      const changes = ChangesSchema.parse(await page('changes'))
      expect(changes).toMatchObject([{verb: 'page_fill', selector: '#email', args: {value: 'a@b.c'}}])
      await page('clearChanges')
      expect(ChangesSchema.parse(await page('changes'))).toEqual([])
    })
  })
})

describe('api page tool capture', () => {
  const SECRET = 'hunter2-never-leaves-the-page'

  describe('an element capture is stored beside the transcript and never reaches the model', () => {
    const tabs = pageTabs()
    const kit = sharedKit(() => bootKit({cwd: tmpdir(), plugins: [tabs.plugin]}))
    const opened: PageTab[] = []

    afterAll(() => {
      opened.forEach((tab) => tab.end())
    })

    const page = async (method: string, sessionId: string): Promise<unknown> =>
      kit().rpc.plugin.call({rpcId: 'experimental.page', method, input: {sessionId}})

    function side(kind: ElementCaptureKind): ElementCapture {
      return {
        kind,
        ts: 1,
        descriptor: {tagName: 'input', selectorPath: '#email', role: 'textbox', value: '***'},
        node: {type: 2, tagName: 'input', attributes: {value: '***'}, childNodes: [], id: 7},
        cssBundleId: 'csstest1',
      }
    }

    function answerFor(): PageReply {
      return pageSuccess(
        {ok: true, value: '***'},
        {
          capture: {
            before: side('before'),
            after: side('after'),
            cssBundles: [{hash: 'csstest1', css: '.form input {color: red}'}],
          },
        },
      )
    }

    async function capturing(): Promise<{sessionId: string; call: (name: string, input: unknown) => Promise<unknown>}> {
      const sessionId = await kit().session()
      opened.push(await tabs.open(sessionId, answerFor))
      return {sessionId, call: makeCallTool(kit().base, sessionId)}
    }

    it('stores both capture sides under the tool call id the agent minted', async () => {
      const {sessionId, call} = await capturing()
      await call('page_fill', {selector: '#email', value: SECRET})

      const stored = SessionCapturesSchema.parse(await page('captures.list', sessionId))
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

    it('drops a session capture, its unreferenced css bundle, its draft and its page changes when the session is deleted', async () => {
      const {sessionId, call} = await capturing()
      await call('page_fill', {selector: '#email', value: SECRET})
      await kit().rpc.drafts.set({
        sessionId,
        text: 'an unsent draft',
        selectionStart: 0,
        selectionEnd: 0,
        updatedAt: Date.now(),
      })
      expect(await kit().rpc.drafts.get({sessionId})).toMatchObject({text: 'an unsent draft'})
      expect(await page('changes', sessionId)).toContainEqual(
        expect.objectContaining({verb: 'page_fill', selector: '#email'}),
      )

      await kit().rpc.sessions.delete({sessionId})

      const stored = SessionCapturesSchema.parse(await page('captures.list', sessionId))
      expect(stored.captures).toEqual([])
      expect(stored.cssBundles).toEqual({})
      expect(await kit().rpc.drafts.get({sessionId})).toBeNull()
      expect(await page('changes', sessionId)).toEqual([])
    })
  })
})

describe('capability collision', () => {
  const impostor = (name: string) =>
    defineTool({
      name,
      description: `Pretends to be the ${name} tool.`,
      inputSchema: z.object({}),
      outputSchema: z.string(),
      meta: {summary: `pretend to be the ${name} tool`, category: 'fixture', mutating: false},
    }).server(() => 'nope')

  it('boot fails loud when an extension tool name collides with an engine capability', async () => {
    const shady = defineExtension({name: 'shady', tools: [impostor('conciv_ui')]})
    await expect(bootKit({extensions: [shady]})).rejects.toThrow(/"conciv_ui".*conciv assist tool.*extension/)
  }, 30_000)

  it("an extension tool named open boots beside the server plugin's open, and each answers on its own route", async () => {
    const opened: string[] = []
    const shady = defineExtension({name: 'shady', tools: [impostor('open')]})
    const kit = await bootKit({extensions: [shady], openInEditor: (file) => opened.push(file)})
    try {
      expect(await kit.rpc.registry.call({name: 'open', input: {}})).toBe('nope')
      expect(await kit.rpc.plugin.call({rpcId: 'server', method: 'open', input: {file: 'src/a.ts'}})).toEqual({
        ok: true,
        file: 'src/a.ts',
      })
      expect(opened).toEqual(['src/a.ts'])
    } finally {
      await kit.cleanup()
    }
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
    },
  }).server(() => ({raised: true}))

  const acme = defineExtension({name: 'acme-beacon', tools: [beacon]})

  describe('the rpc catalog carries the card cosmetics a widget needs', () => {
    it('projects icon, label and mutating across the wire', async () => {
      const kit = await bootKit({extensions: [acme]})
      try {
        const catalog = await kit.rpc.registry.catalog(undefined)
        const entry = catalog.find((signature) => signature.name === 'acme_beacon')
        expect(entry).toMatchObject({
          icon: 'pointer',
          label: {running: 'Raising the beacon', done: 'Raised the beacon'},
          mutating: true,
        })
      } finally {
        await kit.cleanup()
      }
    }, 30_000)
  })
})

describe('rpc registry without a dev-server reload', () => {
  it('the catalog has no server_reload and calling it answers unknown tool', async () => {
    const kit = await bootKit()
    try {
      expect((await kit.rpc.registry.catalog(undefined)).map((signature) => signature.name)).not.toContain(
        'server_reload',
      )
      const {sessionId} = await kit.rpc.sessions.create(undefined)
      const sessionRpc = makeRpcClient(kit.base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
      await expect(sessionRpc.registry.call({name: 'server_reload', input: {file: 'src/a.ts'}})).rejects.toMatchObject({
        code: 'UNKNOWN_TOOL',
      })
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})

describe('rpc symbolicate', () => {
  const root = realpathSync(tempDir('conciv-symbolicate-'))

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

      it("drafts.set stores the client's updatedAt as sent, so a browser can match the row to the copy it sent", async () => {
        const sessionId = SessionId.parse(await kit().session())
        const updatedAt = 1_700_000_000_000
        await kit().rpc.drafts.set({sessionId, text: 'a stamped draft', selectionStart: 0, selectionEnd: 0, updatedAt})
        expect(await kit().rpc.drafts.get({sessionId})).toMatchObject({text: 'a stamped draft', updatedAt})
      })
    })

    describe('on one app with an editor opener', () => {
      const opened: Array<{file: string; line?: number; column?: number}> = []
      const harness = createTestHarness(requireClaude())
      const kit = sharedKit(() =>
        bootKit(
          {
            openInEditor: (file, line, column) =>
              opened.push({
                file,
                ...(line === undefined ? {} : {line}),
                ...(column === undefined ? {} : {column}),
              }),
          },
          harness,
        ),
      )

      beforeEach(() => {
        opened.splice(0)
      })

      it("extension openSource drives the server plugin's open and openFromFrames over rpc", async () => {
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
        const rpc = makeRpcClient(kit().base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
        opened.splice(0)
        const openFile = (input: unknown) => rpc.plugin.call({rpcId: 'server', method: 'open', input})
        expect(await openFile({file: 'src/b.ts', line: 3, column: 9})).toEqual({ok: true, file: 'src/b.ts', line: 3})
        expect(opened).toEqual([{file: 'src/b.ts', line: 3, column: 9}])
        await openFile({file: 'src/c.ts', column: 4})
        expect(opened).toEqual([{file: 'src/b.ts', line: 3, column: 9}, {file: 'src/c.ts'}])
      })

      it('a scripted code-mode call executes the real open capability inside the turn', async () => {
        const sessionId = await kit().session()
        harness.script.scriptToolCall('execute_typescript', {
          typescriptCode: "return await external_open({file: 'src/from-tool.ts'})",
        })
        const stream = await kit().turn('open the file', {session: sessionId, runId: 'wire-11'})
        await stream.done()
        expect(opened.map((entry) => entry.file)).toEqual(['src/from-tool.ts'])
      })
    })

    it('send rebuilds history from the transcript when the harness cannot resume (C3)', async () => {
      const harness = createTestHarness(requireClaude())
      const noResume: TestHarness = Object.assign({}, harness, {
        capabilities: Object.assign({}, harness.capabilities, {resume: false as const}),
      })
      const kit = await bootKit({}, noResume)
      cleanups.push(() => kit.cleanup())
      const sessionId = await kit.session()
      const first = await kit.turn('first question', {session: sessionId, runId: 'wire-7'})
      await first.done()
      const transcript = requireTranscriptPath(noResume)(kit.stateRoot, HarnessSessionId.parse(`fake-${sessionId}`))
      mkdirSync(dirname(transcript), {recursive: true})
      writeFileSync(
        transcript,
        [
          JSON.stringify({type: 'user', message: {content: 'first question'}}),
          JSON.stringify({type: 'assistant', message: {id: 'a1', content: [{type: 'text', text: 'first answer'}]}}),
        ].join('\n'),
      )
      const second = await kit.turn('second question', {session: sessionId, runId: 'wire-8'})
      await second.done()
      expect(userTexts(await hydratedSnapshot(kit, sessionId))).toEqual(['first question', 'second question'])
    })

    it('navigation set round-trips the URL stack with per-entry state and drops a write that is not strictly newer', async () => {
      const {kit} = await bootWire()
      expect(await kit.rpc.navigation.get(undefined)).toBeNull()
      const first = {
        entries: [{href: '/'}, {href: '/panel/s1/chat', state: {key: 'k1', __TSR_index: 1, usr: {from: 'fab'}}}],
        index: 1,
      }
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
      const restarted: boolean[] = []
      const bridge = Bundler.defineBundlerBridge({
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
        restart: async (force) => {
          restarted.push(force ?? false)
        },
      })
      const {kit} = await bootWire({bridge})
      const server = (method: string, input?: unknown) =>
        kit.rpc.plugin.call({rpcId: 'server', method, ...(input === undefined ? {} : {input})})
      expect(await server('config')).toMatchObject({root: '/repo', mode: 'development'})
      expect(await server('resolve', {spec: './a', importer: 'b.ts'})).toEqual({id: 'b.ts!./a'})
      expect(await server('graph', {file: 'src/a.ts'})).toEqual([
        {url: 'src/a.ts', importers: ['entry.ts'], importedModules: ['dep.ts']},
      ])
      expect(await server('transform', {url: '/src/a.ts'})).toEqual({code: 'transformed:/src/a.ts'})
      expect(await server('urls')).toEqual({local: ['http://localhost:3000'], network: []})
      await expect(server('restart', {force: true})).rejects.toMatchObject({
        status: 400,
        code: 'PLUGIN_RPC',
        message: 'Unknown RPC method: server.restart',
        data: {type: 'rpc.method_not_found', message: 'Unknown RPC method: server.restart'},
      })
      expect(restarted).toEqual([])
    })
  })

  describe('chat', () => {
    const chatTabs = pageTabs()
    beforeAll(async () => {
      app.harness = recordingHarness(createTestHarness(requireClaude()))
      app.kit = await createTestkit(
        app.harness,
        bootCoreApp({extensions: [fixtureExtension()], firstChunkTimeoutMs: SILENCE_MS, plugins: [chatTabs.plugin]}),
      ).setup()
      app.mcpSession = await newSession()
      app.mcp = await connectMcpClient(`${app.kit.base}/api/mcp`, {[CONCIV_SESSION_HEADER]: app.mcpSession})
    }, 60_000)

    afterAll(async () => {
      await app.mcp?.close()
      await app.kit?.cleanup()
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
        await chatKit().rpc.drafts.set({
          sessionId,
          text: 'a saved draft',
          selectionStart: 0,
          selectionEnd: 0,
          updatedAt: Date.now(),
        })
        const ended = nextTurnEnd(sessionId)
        const events = await finished(sessionId, 'hello', {runId: 'client-run', messageId: 'client-user'})
        await ended()
        expect(events.text()).toBe('ok')
        expect(collectEventRunIds(events, ChatEventType.RUN_STARTED)).toEqual(['client-run'])
        expect(collectEventRunIds(events, ChatEventType.RUN_FINISHED)).toEqual(['client-run'])
        const hydration = await chatKit().hydrate(sessionId)
        expect(hydration.messages.map(textOfParts)).toEqual(['hello', 'ok'])
        expect(hydration.messages.map((message) => message.id)).toEqual(['client-user', ...collectAssistantIds(events)])
        expect(hydration).toMatchObject({activeRun: null, lastRun: {runId: 'client-run', phase: 'completed'}})
        expect(await thread(sessionId)).toEqual(hydration.messages)
        expect(await chatKit().rpc.drafts.get({sessionId})).toMatchObject({text: 'a saved draft'})
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
        expect(findLastRun(sessionId)).toMatchObject({model: undefined, resumeSessionId: null})
        expect(findLastRun(sessionId).messages).not.toMatch(/previous conversation/i)
        const before = await thread(sessionId)
        await chatKit().rpc.sessions.model({sessionId, model: 'haiku'})
        await finished(sessionId, 'second question')
        expect(findLastRun(sessionId)).toMatchObject({model: 'haiku', resumeSessionId: null})
        expect(findLastRun(sessionId).messages).toContain('first question')
        const after = await thread(sessionId)
        expect(after.slice(0, before.length)).toEqual(before)
        expect(after.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
        expect(after[1]?.parts.map((part) => part.type)).toEqual(['tool-call', 'tool-result', 'text'])
        expect(new Set(after.map((message) => message.id)).size).toBe(after.length)
      })

      it('the chosen effort reaches the harness, and a model without effort clears it', async () => {
        const sessionId = await newSession()
        const {models} = await chatKit().rpc.meta.models({sessionId})
        const plain = models.find((model) => model.efforts === undefined)
        if (plain === undefined) throw new Error('the chat harness lists no model without effort')
        expect(await chatKit().rpc.sessions.effort({sessionId, effort: 'high'})).toEqual({effort: 'high'})
        expect(await sessionMeta(sessionId)).toMatchObject({effort: 'high'})
        script().scriptTurn({toolCalls: [], text: 'thought hard'})
        await finished(sessionId, 'think about it')
        expect(findLastRun(sessionId)).toMatchObject({model: undefined, effort: 'high'})

        await chatKit().rpc.sessions.effort({sessionId, effort: null})
        script().scriptTurn({toolCalls: [], text: 'default effort'})
        await finished(sessionId, 'again')
        expect(findLastRun(sessionId).effort).toBeUndefined()

        await chatKit().rpc.sessions.effort({sessionId, effort: 'max'})
        await chatKit().rpc.sessions.model({sessionId, model: plain.id})
        expect(await sessionMeta(sessionId)).toMatchObject({model: plain.id, effort: null})
        await expect(chatKit().rpc.sessions.effort({sessionId, effort: 'high'})).rejects.toMatchObject({
          code: 'UNSUPPORTED_EFFORT',
        })
      })

      it('a session that has not run a turn yet takes a model and an effort', async () => {
        const sessionId = SessionId.parse(`conciv_${randomUUID()}`)
        expect(await chatKit().rpc.sessions.effort({sessionId, effort: 'high'})).toEqual({effort: 'high'})
        expect(
          await chatKit().rpc.sessions.model({sessionId: SessionId.parse(`conciv_${randomUUID()}`), model: 'sonnet'}),
        ).toEqual({model: 'sonnet'})
        expect(await sessionMeta(sessionId)).toMatchObject({model: null, effort: 'high'})
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
        await ended()
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
        script().holdResults()
        script().scriptTurn({toolCalls: [{name: 'slow_tool', input: {}}], text: 'slow reply'})
        const slowTurn = await send(slow, 'slow')
        await slowTurn.waitForToolCall('slow_tool')
        await finished(quick, 'quick')
        expect((await chatKit().hydrate(slow)).activeRun).not.toBeNull()
        script().releaseResults()
        await slowTurn.done()
        expect((await sessionMeta(slow)).usage).toMatchObject({inputTokens: 11, contextWindow: 1_000_000})
        expect((await sessionMeta(quick)).usage).toMatchObject({inputTokens: 22, contextWindow: 1_000_000})
      })
    })

    describe('stop', () => {
      it('stop ends the turn cleanly as stopped and the next message starts a fresh turn', async () => {
        const sessionId = await newSession()
        const {seen} = await heldTurn(sessionId, 'stop me', 'stopped-run')
        const ended = nextTurnEnd(sessionId)
        await chatKit().rpc.chat.stop({sessionId, runIds: ['stopped-run']})
        expect(['stopping', 'aborted']).toContain((await chatKit().hydrate(sessionId)).lastRun?.phase)
        await ended()
        expect((await chatKit().hydrate(sessionId)).lastRun).toMatchObject({
          phase: 'aborted',
          finishedAt: expect.any(Number),
        })
        expect(seen.filter((chunk) => chunk.type === ChatEventType.RUN_ERROR)).toEqual([])
        expect(JSON.stringify(seen)).not.toMatch(/exit(ed)?( with)?( code| status)? 143|SIGTERM/i)
        script().release()
        expect((await finished(sessionId, 'right after', {runId: 'after-stop'})).text()).toBe('ok')
        expect((await chatKit().hydrate(sessionId)).lastRun).toMatchObject({runId: 'after-stop', phase: 'completed'})

        const earlySession = await newSession()
        script().hold()
        const early = await send(earlySession, 'stop before any answer', {runId: 'stopped-early'})
        await early.waitForRunStart({runId: 'stopped-early'})
        await chatKit().rpc.chat.stop({sessionId: earlySession, runIds: ['stopped-early']})
        script().release()
        const stopped = await early.done()
        expect(stopped.all.map((chunk) => runLifecycleEvent.parse(chunk)?.phase)).toContain('aborted')
        expect(stopped.all).toContainEqual(
          expect.objectContaining({type: ChatEventType.RUN_FINISHED, runId: 'stopped-early', finishReason: 'stop'}),
        )
        expect(stopped.runs()).toBe(1)
        expect(await chatKit().hydrate(earlySession)).toMatchObject({
          activeRun: null,
          lastRun: {runId: 'stopped-early', phase: 'aborted'},
        })
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
        await ended()
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
        await ended()
        expect((await rejoin.done()).text()).toBe('ok')
        expect((await chatKit().hydrate(sessionId)).lastRun).toMatchObject({phase: 'completed'})
        expect(await assistantTexts(sessionId)).toEqual(['ok'])
        expect((await sessionMeta(sessionId)).usage).toMatchObject({inputTokens: 120})
      })

      it('deleting a session with a live turn ends that turn', async () => {
        const sessionId = await newSession()
        await heldTurn(sessionId, 'delete me', 'deleted-run')
        const ended = nextTurnEnd(sessionId)
        await chatKit().rpc.sessions.delete({sessionId})
        await ended()
        expect((await chatKit().hydrate(sessionId)).activeRun).toBeNull()
        expect((await chatKit().rpc.sessions.list(undefined)).sessions.some((meta) => meta.id === sessionId)).toBe(
          false,
        )
        expect((await chatKit().rpc.sessions.get({sessionId: SessionId.parse(sessionId)})).hidden).toBe(true)
      })
    })

    describe('history paging', () => {
      it('hydrate serves the newest page and walks back page by page to the first message', async () => {
        const sessionId = await newSession()
        for (const text of ['one', 'two', 'three']) await finished(sessionId, text)
        const full = (await chatKit().rpc.chat.hydrate({sessionId})).messages.map((message) => message.id)
        expect(full).toHaveLength(6)

        const newest = await chatKit().rpc.chat.hydrate({sessionId, limit: 4})
        expect(newest.messages.map((message) => message.id)).toEqual(full.slice(2))
        expect(newest.page).toEqual({truncated: true, cursor: full[2]})
        expect(Object.keys(newest.messageHarness).every((id) => full.slice(2).includes(id))).toBe(true)
        expect(newest.lastRun).toMatchObject({phase: 'completed'})

        const older = await chatKit().rpc.chat.hydrate({sessionId, limit: 4, before: full[2]})
        expect(older.messages.map((message) => message.id)).toEqual(full.slice(0, 2))
        expect(older.page).toEqual({truncated: false})
        expect(older.lastRun).toEqual({...newest.lastRun, serverNow: expect.any(Number)})
      })

      it('hydrate refuses a page size that is not a positive integer', async () => {
        const sessionId = await newSession()
        for (const limit of [0, -1, 1.5]) {
          await expect(chatKit().rpc.chat.hydrate({sessionId, limit})).rejects.toMatchObject({code: 'BAD_REQUEST'})
        }
      })
    })

    describe('resume after reload', () => {
      it('an idle session reloads to the exact empty shape', async () => {
        expect(await chatKit().hydrate(await newSession())).toEqual({
          messages: [],
          messageHarness: {},
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
        const [sent, joined] = [await turn.done(), await late.done()]
        expect(collectEventRunIds(joined, ChatEventType.RUN_STARTED)).toEqual(['live-run'])
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
        await ended()
        expect((await rejoin.done()).text()).toBe('ok')
        expect(await chatKit().hydrate(sessionId)).toMatchObject({
          activeRun: null,
          lastRun: {runId: 'reloaded-run', phase: 'completed'},
        })
        expect(await assistantTexts(sessionId)).toEqual(['ok'])
      })

      it('joining a finished turn replays it exactly once', async () => {
        const sessionId = await newSession()
        const sent = await finished(sessionId, 'replay me', {runId: 'replayed-run'})
        const replay = await chatKit().join('replayed-run').done()
        expect(replay.text()).toBe('ok')
        expect(nonCustomTypes(replay)).toEqual(nonCustomTypes(sent))
      })

      it('the session stream shows agent tool calls as nested cards, never the turn itself, a call after it in its own run', async () => {
        const sessionStream = await chatKit().events(app.mcpSession)
        const seen = collect(sessionStream)
        await finished(app.mcpSession, 'quiet session stream')
        await executeResult('return await external_fixture_echo({text: "streamed"})')
        await sessionStream.waitFor((chunk) => chunk.type === ChatEventType.RUN_FINISHED, GUARD)
        const cards = toolCallParts(foldChatEvents(seen))
        const execute = cards.findLast((part) => part.name === 'execute_typescript')
        expect(cardMetadata(cards.findLast((part) => part.name === 'fixture_echo'))).toMatchObject({
          parentToolCallId: execute?.id,
        })
        expect(
          seen
            .filter(isTurnBoundary)
            .map((chunk) => [chunk.type, 'runId' in chunk && String(chunk.runId).startsWith('mirror-')]),
        ).toEqual([
          [ChatEventType.RUN_STARTED, true],
          [ChatEventType.RUN_FINISHED, true],
        ])
      })

      it('an outside call made while the tab runs a turn is still in the chat after a reload', async () => {
        const sessionId = await newSession()
        const {turn} = await heldTurn(sessionId, 'hold for an outside call')
        const hub = {[CONCIV_SESSION_HEADER]: sessionId, [CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: 'codex'}
        withHomeDb(concivHome({env: process.env}), (db) => recordHubConnection(db, 'codex', Date.now()))
        const call = executeOverMcp(chatKit().base, hub, 'return 1')
        await vi.waitFor(async () => expect(await approvePending(chatKit().base, sessionId)).toHaveLength(1), {
          timeout: 3000,
        })
        await call
        script().release()
        await turn.done()
        const cards = toolCallParts((await chatKit().rpc.chat.hydrate({sessionId})).messages)
        expect(cards.map(cardMetadata)).toContainEqual({
          conciv: {origin: 'hub', client: 'codex', run: expect.any(String)},
        })
      })

      it('a hub registry call runs under the call id of its one hub card', async () => {
        const sessionId = await newSession()
        const hub = {[CONCIV_SESSION_HEADER]: sessionId, [CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: 'codex'}
        withHomeDb(concivHome({env: process.env}), (db) => recordHubConnection(db, 'codex', Date.now()))
        const call = makeRpcClient(chatKit().base, {headers: hub}).registry.call({name: 'fixture_quiet', input: {}})
        await vi.waitFor(async () => expect(await approvePending(chatKit().base, sessionId)).toHaveLength(1), {
          timeout: 3000,
        })
        await call
        const cards = toolCallParts((await chatKit().rpc.chat.hydrate({sessionId})).messages).filter(
          (part) => part.name === 'fixture_quiet',
        )
        expect(cards.map(cardMetadata)).toEqual([{conciv: {origin: 'hub', client: 'codex', run: expect.any(String)}}])
        expect(quietCallIds.at(-1)).toBe(cards[0]?.id)
      })

      it('the CLI resumes its own session while its transcript exists, and starts fresh when it does not', async () => {
        const resumable = await newSession()
        await finished(resumable, 'remember this')
        writeTranscript(fakeNativeId(resumable), transcriptTurn('remember this', 'ok', 1))
        await finished(resumable, 'resume')
        expect(findLastRun(resumable).resumeSessionId).toBe(fakeNativeId(resumable))
        expect(findLastRun(resumable).messages).not.toContain('remember this')
        expect((await sessionMeta(resumable)).native?.nativeId).toBe(fakeNativeId(resumable))
        const stale = await newSession()
        await finished(stale, 'no transcript')
        await finished(stale, 'still none')
        expect(findLastRun(stale).resumeSessionId).toBeNull()
      })

      it('a turn id runs once: resending a finished one resumes it, and two sends at once start one turn', async () => {
        const reused = await newSession()
        await finished(reused, 'original', {runId: 'reused-run'})
        expect((await finished(reused, 'retry', {runId: 'reused-run'})).text()).toBe('ok')
        const twin = await newSession()
        script().hold()
        const sends = [await send(twin, 'twin', {runId: 'twin-run'}), await send(twin, 'twin', {runId: 'twin-run'})]
        script().release()
        await Promise.all(sends.map((turn) => turn.done()))
        expect([listRuns(reused).length, listRuns(twin).length]).toEqual([1, 1])
        expect([await threadUserTexts(reused), await threadUserTexts(twin)]).toEqual([['original'], ['twin']])
      })
    })

    describe('approvals', () => {
      it('only tools declared to ask ever ask: mutating and read tools run straight through the sandbox', async () => {
        const sessionId = await newSession()
        codeTurn(TOOLS_WITHOUT_ASK_SCRIPT)
        const events = await finished(sessionId, 'run tools')
        expect(events.custom('approval-requested')).toEqual([])
        expect(collectResults(await thread(sessionId))).toContain('[{"echoed":"hi"},{"value":7},"undefined"]')
        expect(findLastRun(sessionId).tools).toContain('fixture_ask')
      })

      it('a risky tool is refused until approved, a denial re-runs the turn refused once, and a one-time approval runs once', async () => {
        const sessionId = await newSession()
        const ran = toolRuns.ask
        const asked = await askTurn(sessionId, 'ask-run')
        expect(JSON.stringify(asked.all)).toContain('needs the user')
        expect(asked.all.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
        expect((await chatKit().hydrate(sessionId)).pendingApprovals).toEqual([pendingAsk('ask-run')])
        expect((await chatKit().join('ask-run').done()).custom('approval-requested')).toHaveLength(1)
        await expect(decide(sessionId, ASK_ID, false)).resolves.toEqual({ok: true, startsTurn: true})
        expect((await chatKit().hydrate(sessionId)).pendingApprovals).toEqual([])
        const refused = await askTurn(sessionId)
        expect(findLastRun(sessionId).denials).toEqual([ASK_ID])
        expect(refused.custom('approval-requested')).toEqual([])
        expect(JSON.stringify(refused.all)).toContain('denied')
        expect(toolRuns.ask).toBe(ran)
        expect((await chatKit().hydrate(sessionId)).pendingApprovals).toEqual([])
        expect((await askTurn(sessionId)).custom('approval-requested')).toHaveLength(1)
        expect(findLastRun(sessionId).denials).toEqual([])
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
        expect(findLastRun(sessionId).approvals).toEqual(expect.arrayContaining([PLAIN_COMMAND, HIDDEN_COMMAND]))
        await finished(sessionId, 'retry two')
        expect(findLastRun(sessionId).approvals).toContain(PLAIN_COMMAND)
        expect(findLastRun(sessionId).approvals).not.toContain(HIDDEN_COMMAND)
      })

      it('the widget calling a tool is the approval, while agents and malformed callers are refused', async () => {
        const ran = toolRuns.ask
        const browserRpc = widgetRpc(app.mcpSession)
        await expect(browserRpc.registry.call({name: 'fixture_ask', input: {target: 'w'}})).resolves.toEqual({
          done: 'w',
        })
        await expect(browserRpc.plugin.call({rpcId: 'server', method: 'config'})).rejects.toMatchObject({
          code: 'PLUGIN_RPC',
          data: {type: 'BUNDLER_UNAVAILABLE'},
        })
        await expect((await mcpTool('fixture_ask')).execute({target: 'agent'})).rejects.toThrow(/needs the user/)
        expect(toolRuns.ask).toBe(ran + 1)
        await expect(callerWithout().registry.call({name: 'fixture_read', input: {}})).rejects.toMatchObject({
          code: 'BAD_REQUEST',
        })
        await expect(
          callerWith('not a session').registry.call({name: 'fixture_read', input: {}}),
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: expect.stringMatching(/malformed/),
        })
        expect((await mcpPost({[CONCIV_SESSION_HEADER]: 'nope'})).status).toBe(400)
      })

      it('a call refused for a disconnected client, at the outside admission or at the ask reaches the extension middleware', async () => {
        const sessionId = await newSession()
        const [ran, seen] = [toolRuns.ask, refusedCalls.length]
        const hubAs = (client: string) =>
          makeRpcClient(chatKit().base, {
            headers: {
              [CONCIV_SESSION_HEADER]: sessionId,
              [CONCIV_ORIGIN_HEADER]: 'hub',
              [CONCIV_CLIENT_HEADER]: client,
            },
          })
        await expect(
          hubAs('gemini-cli').registry.call({name: 'fixture_ask', input: {target: 'disconnected'}}),
        ).rejects.toMatchObject({code: 'APPROVAL_DENIED', message: expect.stringMatching(/disconnected from conciv/)})
        await expect(hubAs('gemini-cli').registry.call({name: 'fixture_nope', input: {}})).rejects.toMatchObject({
          code: 'UNKNOWN_TOOL',
        })
        const listening = new AbortController()
        const events = await chatKit().rpc.chat.events({sessionId}, {signal: listening.signal})
        const admitted = hubAs('terminal').registry.call({name: 'fixture_ask', input: {target: 'outside'}})
        const refusal = expect(admitted).rejects.toMatchObject({
          code: 'APPROVAL_DENIED',
          message: expect.stringMatching(/denied terminal/),
        })
        const asks = async () => {
          for await (const chunk of events) {
            const ask = readApprovalAsk(chunk)
            if (ask !== null) return ask
          }
          throw new Error('the event stream ended before the outside ask was raised')
        }
        const outsideAsk = await asks()
        listening.abort()
        expect(outsideAsk).toMatchObject({input: {client: 'terminal'}})
        await decide(sessionId, outsideAsk.approvalId, false)
        await refusal
        const asked = callerWith(sessionId).registry.call({name: 'fixture_ask', input: {target: 'asked'}})
        await expect(asked).rejects.toMatchObject({
          code: 'APPROVAL_DENIED',
          message: expect.stringMatching(/needs the user/),
        })
        expect(refusedCalls.slice(seen)).toEqual([
          {
            code: 'APPROVAL_DENIED',
            message: expect.stringMatching(/disconnected from conciv/),
            sessionId,
            tool: 'fixture_ask',
            input: {target: 'disconnected'},
          },
          {
            code: 'APPROVAL_DENIED',
            message: expect.stringMatching(/denied terminal/),
            sessionId,
            tool: 'fixture_ask',
            input: {target: 'outside'},
          },
          {
            code: 'APPROVAL_DENIED',
            message: expect.stringMatching(/needs the user/),
            sessionId,
            tool: 'fixture_ask',
            input: {target: 'asked'},
          },
        ])
        expect(toolRuns.ask).toBe(ran)
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
        const unknown = callerWith('conciv_unknown_probe').registry.call({name: 'fixture_ask', input: {}})
        await expect(unknown).rejects.toThrow('session "conciv_unknown_probe" does not exist')
      })
    })

    describe('tools and models list', () => {
      it('the widget gets every tool with its full description and the harness model list', async () => {
        const {tools} = await chatKit().rpc.meta.tools({sessionId: await newSession()})
        expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(FIXTURE_TOOLS))
        expect(tools.every((tool) => tool.description.length > 0)).toBe(true)
        expect(tools.find((tool) => tool.name === 'fixture_echo')?.description).toBe(ECHO_DESCRIPTION)
        const models = await chatKit().rpc.meta.models({sessionId: await newSession()})
        expect(models.models.map((model) => model.id)).toEqual(expect.arrayContaining(['opus', 'sonnet', 'haiku']))
        expect(models.defaultModel).toBe('opus')
      })

      it('a session whose agent has code mode off is offered no extension tool, since its turn gets none', async () => {
        const {kit} = await bootWire({
          extensions: [fixtureExtension()],
          permissions: [{action: 'execute', resource: '*', effect: 'deny'}],
        })
        const {tools} = await kit.rpc.meta.tools({sessionId: await kit.session()})
        expect(tools.map((tool) => tool.name).filter((name) => FIXTURE_TOOLS.includes(name))).toEqual([])
      })
    })

    describe('attachments and images', () => {
      it('an attachment is stored as sent, expanded once for the model only, and the CLI gets the expansion', async () => {
        const sessionId = await newSession()
        await finished(sessionId, {content: attachmentParts()})
        const sent = findLastRun(sessionId).messages
        expect(sent.indexOf('fixture-expanded')).toBeGreaterThan(sent.indexOf(FIXTURE_MIME))
        expect(sent).toContain('[attachment could not be processed]')
        const user = (await thread(sessionId)).find((message) => message.role === 'user')
        expect(user?.parts.filter((part) => part.type === 'document')).toHaveLength(3)
        expect(user?.parts.filter(isExpansion)).toEqual([EXPANSION_PART])
      })

      it('an image is stored exactly as sent, ignores the draft, and stays in history for later turns', async () => {
        const sessionId = await newSession()
        await chatKit().rpc.drafts.set({
          sessionId,
          text: 'a saved draft',
          selectionStart: 0,
          selectionEnd: 0,
          updatedAt: Date.now(),
        })
        await finished(sessionId, {content: [{type: 'text', content: 'what color?'}, IMAGE]})
        await finished(sessionId, 'and the shape?')
        const messages = await thread(sessionId)
        expect(messages.find((message) => message.role === 'user')?.parts).toEqual([
          {type: 'text', content: 'what color?'},
          IMAGE,
        ])
        expect(await threadUserTexts(sessionId)).toEqual(['what color?', 'and the shape?'])
        expect(messages.flatMap((message) => message.parts).filter((part) => part.type === 'image')).toHaveLength(1)
        expect(findLastRun(sessionId).messages).toContain(ONE_PIXEL_PNG)
        expect(await chatKit().rpc.drafts.get({sessionId})).toMatchObject({text: 'a saved draft'})
      })
    })

    describe('compaction', () => {
      it('compact runs as its own turn, never overlaps another, marks the boundary and keeps the history', async () => {
        const sessionId = await newSession()
        await finished(sessionId, 'one')
        await finished(sessionId, 'two')
        const boundary = (await thread(sessionId)).at(-1)?.id
        await chatKit().rpc.drafts.set({
          sessionId,
          text: 'a draft kept across compaction',
          selectionStart: 0,
          selectionEnd: 0,
          updatedAt: Date.now(),
        })
        script().hold()
        const compacts = [chatKit().rpc.sessions.compact({sessionId}), chatKit().rpc.sessions.compact({sessionId})]
        await Promise.race(compacts)
        await until(async () => (await sessionMeta(sessionId)).running, GUARD)
        script().release()
        await Promise.all(compacts)
        expect(findLastRun(sessionId).kind).toBe('compact')
        expect(findLastRun(sessionId).messages).toContain('/compact')
        expect(overlapping(listRuns(sessionId))).toBe(false)
        expect(boundary).toBeDefined()
        expect(await compactMarkers(sessionId)).toEqual([boundary, boundary])
        expect(await threadUserTexts(sessionId)).toEqual(['one', 'two'])
        expect(await chatKit().rpc.drafts.get({sessionId})).toMatchObject({text: 'a draft kept across compaction'})
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
        const {sessionId} = await chatKit().rpc.sessions.resolve({id: TERMINAL_ID})
        expect(await threadUserTexts(sessionId)).toEqual(['terminal one', 'terminal two'])
        expect((await sessionMeta(sessionId)).origin).toBe('external')
        const imported = await chatKit().hydrate(sessionId)
        const importedReplies = imported.messages.filter((message) => message.role === 'assistant')
        expect(importedReplies.length).toBeGreaterThan(0)
        expect(importedReplies.map((message) => imported.messageHarness[message.id])).toEqual(
          importedReplies.map(() => 'claude'),
        )
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
        await Promise.all([turn.done(), second.done()])
        expect(overlapping(listRuns(sessionId))).toBe(false)
        expect(await threadUserTexts(sessionId)).toEqual(['first in line', 'second in line'])
      })

      it('a new message ends the running turn before its own turn starts', async () => {
        const sessionId = await newSession()
        const {turn} = await heldTurn(sessionId, 'interrupted', 'steer-first')
        const second = await send(sessionId, 'resent', {runId: 'steer-second'})
        const first = await turn.done().finally(() => script().release())
        expect(first.all.some((chunk) => chunk.type === ChatEventType.RUN_FINISHED)).toBe(true)
        const sent = await turn.waitFor(
          (chunk) => chunk.type === ChatEventType.RUN_FINISHED && chunk.runId === 'steer-first',
        )
        expect(first.all.findLast((chunk) => chunk.type === ChatEventType.RUN_FINISHED)).not.toBe(sent)
        expect(collectEventRunIds(await second.done(), ChatEventType.RUN_STARTED)).toContain('steer-second')
      })
    })

    describe('silent CLI', () => {
      it('a CLI that says nothing fails the turn with "no output", tells the viewer, and fires the hook', async () => {
        const sessionId = await newSession()
        script().holdTools()
        const ended = nextTurnEnd(sessionId)
        const turn = await send(sessionId, 'silence', {runId: 'silent-run'})
        await turn.waitForRunStart({runId: 'silent-run'})
        const error = turn.waitFor((chunk) => chunk.type === ChatEventType.RUN_ERROR)
        await ended()
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
        await executeOverMcp(chatKit().base, {}, 'return 1')
        expect((await chatKit().rpc.sessions.resolve({})).sessionId).toBe(latest)
      })

      it('opening by id keeps ours, creates an unknown one, and adopts a CLI or agent session exactly once', async () => {
        const ours = await newSession()
        expect((await chatKit().rpc.sessions.resolve({id: ours})).sessionId).toBe(ours)
        expect((await chatKit().rpc.sessions.resolve({id: UNKNOWN_SESSION})).sessionId).toBe(UNKNOWN_SESSION)
        const adopted = (await chatKit().rpc.sessions.resolve({id: 'native-adopt-1'})).sessionId
        expect((await chatKit().rpc.sessions.resolve({id: 'native-adopt-1'})).sessionId).toBe(adopted)
        const adoptedStream = await chatKit().events(adopted)
        await executeOverMcp(chatKit().base, {[CONCIV_CLAUDE_SESSION_HEADER]: 'native-adopt-1'}, 'return 1')
        await adoptedStream.waitFor((chunk) => chunk.type === ChatEventType.TOOL_CALL_RESULT, GUARD)
        const agentNative = claudeId('agent-native-1')
        await executeOverMcp(chatKit().base, {[CONCIV_CLAUDE_SESSION_HEADER]: agentNative}, 'return 1')
        await executeOverMcp(chatKit().base, {[CONCIV_CLAUDE_SESSION_HEADER]: agentNative}, 'return 1')
        writeNativeAt(agentNative, 'the agent task', Date.now())
        const {sessions: listed} = await chatKit().rpc.sessions.list({includeHidden: true})
        expect(listed.filter((meta) => meta.native?.nativeId === agentNative)).toHaveLength(1)
      })

      it('pages native transcripts and conciv-only sessions together and materializes a native on its page', async () => {
        const concivOnly = SessionId.parse(await newSession())
        const createdAt = (await chatKit().rpc.sessions.get({sessionId: concivOnly})).updatedAt
        const future = claudeId('paged-future')
        const tied = '00000000-0000-4000-8000-000000000000'
        writeNativeAt(future, 'the future task', createdAt + 60_000)
        writeNativeAt(tied, 'the tied task', createdAt)

        const first = await chatKit().rpc.sessions.list({limit: 2})
        expect(first.sessions.map((meta) => meta.native?.nativeId ?? meta.id)).toEqual([future, concivOnly])
        expect(first.next).toEqual({updatedAt: createdAt, id: concivOnly})

        const second = await chatKit().rpc.sessions.list({cursor: first.next, limit: 1})
        expect(second.sessions).toMatchObject([
          {origin: 'external', title: 'the tied task', updatedAt: createdAt, native: {nativeId: tied}},
        ])
        expect(second.next).toEqual({updatedAt: createdAt, id: tied})
        const materialized = second.sessions[0]
        if (materialized === undefined) throw new Error('the tied native session was not listed')
        expect(await chatKit().rpc.sessions.get({sessionId: materialized.id})).toEqual(materialized)
        expect(await chatKit().rpc.sessions.get({sessionId: concivOnly})).toEqual(first.sessions[1])
      })

      it('a session whose native transcript is gone drops out of the list, and get still answers for it', async () => {
        const gone = claudeId('gone-native')
        writeNativeAt(gone, 'a task whose transcript goes away', Date.now() + 120_000)
        const [listed] = (await chatKit().rpc.sessions.list({limit: 1})).sessions
        expect(listed).toMatchObject({native: {nativeId: gone}})
        if (listed === undefined) throw new Error('the native session was not listed')
        rmSync(resolveTranscriptPath(gone))
        const after = await chatKit().rpc.sessions.list({includeHidden: true})
        expect(after.sessions.map((meta) => meta.id)).not.toContain(listed.id)
        expect(await chatKit().rpc.sessions.get({sessionId: listed.id})).toMatchObject({id: listed.id})
      })

      it('a deleted session whose transcript is still on disk stays deleted: the list leaves it out and opening or resolving it by either id is refused', async () => {
        const kept = claudeId('deleted-native')
        writeNativeAt(kept, 'a task deleted while its transcript stays', Date.now() + 180_000)
        const [listed] = (await chatKit().rpc.sessions.list({limit: 1})).sessions
        expect(listed).toMatchObject({native: {nativeId: kept}})
        if (!listed?.native) throw new Error('the native session was not listed')
        await chatKit().rpc.sessions.delete({sessionId: listed.id})

        const after = await chatKit().rpc.sessions.list(undefined)
        expect(after.sessions.map((meta) => meta.id)).not.toContain(listed.id)
        expect(await chatKit().rpc.sessions.get({sessionId: listed.id})).toMatchObject({id: listed.id, hidden: true})
        const withHidden = await chatKit().rpc.sessions.list({includeHidden: true})
        expect(withHidden.sessions.find((meta) => meta.id === listed.id)).toMatchObject({hidden: true})
        expect(await chatKit().rpc.sessions.get({sessionId: listed.id})).toMatchObject({hidden: true})
        expect(existsSync(resolveTranscriptPath(kept))).toBe(true)

        await expect(chatKit().rpc.sessions.open(listed.native)).rejects.toMatchObject({code: 'NOT_FOUND'})
        expect(await chatKit().rpc.sessions.get({sessionId: listed.id})).toMatchObject({hidden: true})
        expect(existsSync(resolveTranscriptPath(kept))).toBe(true)

        await expect(chatKit().rpc.sessions.resolve({id: kept})).rejects.toMatchObject({code: 'NOT_FOUND'})
        await expect(chatKit().rpc.sessions.resolve({id: listed.id})).rejects.toMatchObject({code: 'NOT_FOUND'})
        expect(await chatKit().rpc.sessions.get({sessionId: listed.id})).toMatchObject({hidden: true})

        const neverSeen = claudeId('never-seen-native')
        const opened = await chatKit().rpc.sessions.open({...listed.native, nativeId: neverSeen})
        expect(await chatKit().rpc.sessions.get({sessionId: opened.sessionId})).toMatchObject({
          hidden: false,
          native: {nativeId: neverSeen},
        })
      })

      it('a page leaves hidden conciv-only sessions out unless asked, and get still answers for them', async () => {
        const hidden = SessionId.parse(await newSession())
        await chatKit().rpc.sessions.delete({sessionId: hidden})
        expect((await chatKit().rpc.sessions.list(undefined)).sessions.map((meta) => meta.id)).not.toContain(hidden)
        const withHidden = await chatKit().rpc.sessions.list({includeHidden: true, limit: 5})
        expect(withHidden.sessions.find((meta) => meta.id === hidden)).toMatchObject({hidden: true})
        expect(await chatKit().rpc.sessions.get({sessionId: hidden})).toMatchObject({id: hidden, hidden: true})
        await expect(chatKit().rpc.sessions.get({sessionId: NEVER_MADE})).rejects.toMatchObject({code: 'NOT_FOUND'})
      })

      describe('search', () => {
        const LIVE_REINDEX_MS = 30_000
        const searched: {kit: Kit | null; cwd: string; changes: AsyncIterator<unknown> | null; bootedAt: number} = {
          kit: null,
          cwd: '',
          changes: null,
          bootedAt: 0,
        }
        const clock = {at: Date.now() + 3_600_000}
        const searchKit = () => {
          if (searched.kit === null) throw new Error('the search kit did not boot')
          return searched.kit
        }
        const nextStamp = () => {
          clock.at += 60_000
          return clock.at
        }

        beforeAll(async () => {
          searched.bootedAt = Date.now()
          searched.cwd = realpathSync(tempDir('conciv-search-cwd-'))
          writeClaudeTurn(claudeId('claude-early'), 'an early note', 'the dunlin flew')
          searched.kit = await bootKit(
            {cwd: searched.cwd, harnesses: [codexHarness, piHarness]},
            createTestHarness(requireClaude()),
          )
          searched.changes = await searched.kit.rpc.sessions.changes()
        }, 60_000)

        afterAll(async () => {
          await searched.changes?.return?.()
          await searched.kit?.cleanup()
          rmSync(searched.cwd, {recursive: true, force: true})
        })

        function claudeTranscriptPath(nativeId: string): string {
          return requireTranscriptPath(requireClaude())(searched.cwd, HarnessSessionId.parse(nativeId))
        }

        function writeClaudeTurn(nativeId: string, ask: string, answer: string, stamp = nextStamp()): number {
          writeClaudeLines(
            nativeId,
            [
              JSON.stringify({type: 'user', message: {content: ask}}),
              JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: answer}]}}),
            ].join('\n') + '\n',
            stamp,
          )
          return stamp
        }

        function writeClaudeLines(nativeId: string, raw: string, stamp: number): void {
          writeWhole(claudeTranscriptPath(nativeId), raw, stamp)
        }

        function writeWhole(path: string, raw: string, stamp?: number): void {
          const written = `${path}.writing`
          mkdirSync(dirname(path), {recursive: true})
          writeFileSync(written, raw)
          if (stamp !== undefined) utimesSync(written, stamp / 1000, stamp / 1000)
          renameSync(written, path)
        }

        function writeCodexTurn(nativeId: string, ask: string, answer: string, cwd = searched.cwd): string {
          const rollout = join(codexHome(), 'sessions', '2026', '11', '06', `rollout-${nativeId}.jsonl`)
          writeWhole(
            rollout,
            [
              {type: 'session_meta', payload: {session_id: nativeId, id: nativeId, cwd}},
              {type: 'event_msg', payload: {type: 'user_message', message: ask}},
              {type: 'event_msg', payload: {type: 'agent_message', message: answer}},
            ]
              .map((line) => JSON.stringify(line))
              .join('\n') + '\n',
          )
          const updated = nextStamp()
          const db = new DatabaseSync(join(codexHome(), 'state_5.sqlite'))
          try {
            db.exec(
              `create table if not exists threads (id text primary key, rollout_path text not null, cwd text not null, title text not null default '', first_user_message text not null default '', preview text not null default '', model text, tokens_used integer not null default 0, archived integer not null default 0, created_at integer not null, updated_at integer not null, created_at_ms integer, updated_at_ms integer)`,
            )
            db.prepare(
              'insert or replace into threads (id, rollout_path, cwd, title, first_user_message, created_at, updated_at, created_at_ms, updated_at_ms) values (?,?,?,?,?,?,?,?,?)',
            ).run(
              nativeId,
              rollout,
              cwd,
              ask,
              ask,
              Math.round(updated / 1000),
              Math.round(updated / 1000),
              updated,
              updated,
            )
          } finally {
            db.close()
          }
          return rollout
        }

        async function found(search: string, everywhere = false): Promise<string[]> {
          const {sessions: listed} = await searchKit().rpc.sessions.search({term: search, limit: 100, everywhere})
          return listed.map((meta) => meta.native?.nativeId ?? meta.title)
        }

        async function later(elapsed: number, check: () => Promise<void>): Promise<void> {
          vi.useFakeTimers({toFake: ['Date'], now: Date.now() + elapsed + 1})
          try {
            await check()
          } finally {
            vi.useRealTimers()
          }
        }

        async function indexedChange(): Promise<void> {
          if (searched.changes === null) throw new Error('the search kit is not watching session changes')
          await searched.changes.next()
        }

        async function foundOnceIndexed(search: string, expected: string[], everywhere = false): Promise<void> {
          if (isEqual(await found(search, everywhere), expected)) return
          await indexedChange()
          return foundOnceIndexed(search, expected, everywhere)
        }

        async function stampedOnceIndexed(search: string, expected: {nativeId: string; updatedAt: number}[]) {
          const {sessions: listed} = await searchKit().rpc.sessions.search({term: search, limit: 100})
          const stamped = listed.map((meta) => ({nativeId: meta.native?.nativeId, updatedAt: meta.updatedAt}))
          if (isEqual(stamped, expected)) return
          await indexedChange()
          return stampedOnceIndexed(search, expected)
        }

        async function listedNativeIds(): Promise<string[]> {
          const {sessions: listed} = await searchKit().rpc.sessions.list({limit: 100})
          return listed.flatMap((meta) => (meta.native ? [meta.native.nativeId] : []))
        }

        async function pagedNativeIds(cursor: HarnessListCursor | null): Promise<string[]> {
          const {sessions: listed, next} = await searchKit().rpc.sessions.list({cursor, limit: 2})
          const ids = listed.flatMap((meta) => (meta.native ? [meta.native.nativeId] : []))
          return next === null ? ids : [...ids, ...(await pagedNativeIds(next))]
        }

        it('indexes nothing before the first list, then builds in the background and says so when done', async () => {
          expect(await found('dunlin')).toEqual([])
          expect(await found('early')).toEqual([])

          expect(await listedNativeIds()).toContain(claudeId('claude-early'))

          await foundOnceIndexed('dunlin', [claudeId('claude-early')])
        })

        it('a watcher that subscribes after a pass gets the current index version at once, and a later pass a higher one', async () => {
          expect(await listedNativeIds()).toContain(claudeId('claude-early'))
          await foundOnceIndexed('dunlin', [claudeId('claude-early')])
          const late = await searchKit().rpc.sessions.changes()
          try {
            const current = await late.next()
            const currentVersion = z.object({version: z.number()}).parse(current.value).version
            expect(currentVersion).toBeGreaterThan(searched.bootedAt)

            writeClaudeTurn(claudeId('claude-kestrel'), 'a kestrel note', 'the kestrel hovered')
            expect(await listedNativeIds()).toContain(claudeId('claude-kestrel'))
            await found('kestrel')
            const next = await late.next()
            expect(z.object({version: z.number()}).parse(next.value).version).toBeGreaterThan(currentVersion)
          } finally {
            await late.return?.()
          }
        }, 10_000)

        it('answers a search during the build at once with title matches, and text matches follow the indexed event', async () => {
          const puffin = HarnessSessionId.parse('pi-puffin')
          const path = requireTranscriptPath(piHarness)(searched.cwd, puffin)
          const head = [
            {type: 'session', version: 3, id: puffin, timestamp: '2026-11-07T09:00:00.000Z', cwd: searched.cwd},
            {
              type: 'message',
              id: 'u1',
              parentId: null,
              message: {role: 'user', content: [{type: 'text', text: 'a puffin colony'}]},
            },
          ]
          const body = [
            {
              type: 'message',
              id: 'a1',
              parentId: 'u1',
              message: {role: 'assistant', content: [{type: 'text', text: 'the guillemot dives'}]},
            },
          ]
          const lines = (entries: unknown[]) => entries.map((entry) => `${JSON.stringify(entry)}\n`).join('')
          mkdirSync(dirname(path), {recursive: true})
          execFileSync('mkfifo', [path])
          const titleReader = open(path, 'w')
          expect(await found('puffin')).toEqual([])
          const titleWriter = await titleReader
          await titleWriter.write(lines(head))
          await titleWriter.close()
          await foundOnceIndexed('puffin', [puffin])

          const textWriter = await open(path, 'w')
          expect(await found('guillemot')).toEqual([])
          await textWriter.write(lines([...head, ...body]))
          rmSync(path)
          writeFileSync(path, lines([...head, ...body]))
          await textWriter.close()

          await foundOnceIndexed('guillemot', [puffin])
        })

        it('lists only the transcripts it can read: one linked in from outside the project is neither listed nor searched, and gone codex rollouts hide no session behind them', async () => {
          const outside = join(searched.cwd, 'elsewhere', 'linked.jsonl')
          mkdirSync(dirname(outside), {recursive: true})
          writeFileSync(outside, JSON.stringify({type: 'user', message: {content: 'a linked pelican'}}) + '\n')
          symlinkSync(outside, claudeTranscriptPath(claudeId('claude-linked')))
          writeClaudeTurn(claudeId('claude-local'), 'a local pelican', 'kept here')

          expect(await listedNativeIds()).not.toContain(claudeId('claude-linked'))
          await foundOnceIndexed('pelican', [claudeId('claude-local')])

          writeCodexTurn('codex-quokka', 'a quokka', 'hopping')
          const gone = ['codex-gone-1', 'codex-gone-2'].map((nativeId) =>
            writeCodexTurn(nativeId, 'a quokka', 'hopping'),
          )
          gone.forEach((rollout) => rmSync(rollout))
          const paged = await pagedNativeIds(null)
          expect(paged).toEqual(expect.arrayContaining(['codex-quokka', claudeId('claude-local')]))
          expect(paged).not.toContain('codex-gone-1')
        })

        it('indexes a truncated transcript by what it holds, hides the ones Claude cannot title, and the rest stay findable', async () => {
          writeClaudeLines(
            claudeId('claude-truncated'),
            JSON.stringify({type: 'user', message: {content: 'a truncated cormorant'}}) +
              '\n{"type":"assistant","message":{"content":[{"type":"te',
            nextStamp(),
          )
          writeClaudeLines(
            claudeId('claude-odd'),
            [
              {type: 'user'},
              {type: 'user', message: {content: 42}},
              {type: 'assistant', message: {content: 'odd plover'}},
            ]
              .map((line) => JSON.stringify(line))
              .join('\n') + '\nnot json\n',
            nextStamp(),
          )
          writeClaudeLines(claudeId('claude-garbage'), '\u0000 nothing readable\n', nextStamp())
          writeClaudeTurn(claudeId('claude-plain'), 'a plain gull', 'fine')

          const listed = await listedNativeIds()
          expect(listed).toEqual(expect.arrayContaining([claudeId('claude-truncated'), claudeId('claude-plain')]))
          expect(listed).not.toContain(claudeId('claude-odd'))
          expect(listed).not.toContain(claudeId('claude-garbage'))
          await foundOnceIndexed('cormorant', [claudeId('claude-truncated')])
          await foundOnceIndexed('gull', [claudeId('claude-plain')])
          expect(await found('plover')).toEqual([])
        })

        it('keeps searching the other harnesses while one cannot list its sessions', async () => {
          writeCodexTurn('codex-tern', 'a codex tern', 'seen')
          writeClaudeTurn(claudeId('claude-tern'), 'a claude tern', 'seen')
          const stateDb = join(codexHome(), 'state_5.sqlite')
          renameSync(stateDb, `${stateDb}.kept`)
          writeFileSync(stateDb, 'not a database')
          try {
            await foundOnceIndexed('tern', [claudeId('claude-tern')])
          } finally {
            renameSync(`${stateDb}.kept`, stateDb)
          }
        })

        it('reads a live session text at most every 30 seconds, while its title and time follow the list', async () => {
          writeClaudeTurn(claudeId('claude-live'), 'a busy kestrel', 'the first wren reply')
          await foundOnceIndexed('wren', [claudeId('claude-live')])

          const stamp = writeClaudeTurn(claudeId('claude-live'), 'a busy kestrel and merlin', 'the osprey arrived')
          await stampedOnceIndexed('merlin', [{nativeId: claudeId('claude-live'), updatedAt: stamp}])
          expect(await found('osprey')).toEqual([])

          await later(LIVE_REINDEX_MS, () => foundOnceIndexed('osprey', [claudeId('claude-live')]))
        })

        it('matches message text of sessions from every harness, newest first and paged, and tolerates a typo', async () => {
          writeClaudeTurn(claudeId('claude-orchard'), 'plan the kiwi orchard', 'the mango grove is planted')
          writeCodexTurn('codex-salsa', 'write a salsa recipe', 'mango salsa needs lime')
          writeClaudeTurn(claudeId('claude-chore'), 'an unrelated chore', 'done')

          await foundOnceIndexed('mango', ['codex-salsa', claudeId('claude-orchard')])
          expect(await found('kiwi orchard')).toEqual([claudeId('claude-orchard')])
          expect(await found('lime')).toEqual(['codex-salsa'])
          expect(await found('mangp')).toEqual(['codex-salsa', claudeId('claude-orchard')])

          const first = await searchKit().rpc.sessions.search({term: 'mango', limit: 1})
          expect(first.sessions.map((meta) => meta.native?.nativeId)).toEqual(['codex-salsa'])
          const second = await searchKit().rpc.sessions.search({term: 'mango', cursor: first.next, limit: 1})
          expect(second).toMatchObject({sessions: [{native: {nativeId: claudeId('claude-orchard')}}], next: null})

          const tie = nextStamp()
          const tied = ['claude-papaya-1', 'claude-papaya-2', 'claude-papaya-3'].map(claudeId).toSorted().toReversed()
          tied.forEach((id, rank) => writeClaudeTurn(id, 'a papaya at the same moment', 'ripe'.repeat(100 - rank), tie))
          await foundOnceIndexed('papaya', tied)
          const paged = async (cursor: HarnessListCursor | null): Promise<string[]> => {
            const page = await searchKit().rpc.sessions.search({term: 'papaya', cursor, limit: 1})
            const ids = page.sessions.map((meta) => meta.native?.nativeId ?? '')
            return page.next === null ? ids : [...ids, ...(await paged(page.next))]
          }
          expect(await paged(null)).toEqual(tied)
        })

        it('carries an excerpt from the matching line and the words that matched it, by prefix or one typo', async () => {
          const curlew = claudeId('claude-curlew')
          writeClaudeTurn(curlew, 'a shore walk', 'first we packed\nthe Curlews jetted past the jetty')
          expect(await listedNativeIds()).toContain(curlew)
          await foundOnceIndexed('curl', [curlew])
          const searchHit = async (term: string) => {
            const {sessions: listed} = await searchKit().rpc.sessions.search({term, limit: 100})
            return listed.map(({excerpt, matched}) => ({excerpt, matched}))
          }

          expect(await searchHit('curl')).toEqual([
            {excerpt: 'the Curlews jetted past the jetty', matched: ['Curlews']},
          ])
          expect(await searchHit('jetti')).toEqual([{excerpt: 'the Curlews jetted past the jetty', matched: ['jetty']}])
          expect(await searchHit('packd')).toEqual([
            {excerpt: 'first we packed\nthe Curlews jetted past the jetty', matched: ['packed']},
          ])

          const {sessions: listed} = await searchKit().rpc.sessions.list({limit: 100})
          const owned = listed.find((meta) => meta.native?.nativeId === curlew)
          if (owned === undefined) throw new Error('the curlew session was not listed')
          await searchKit().rpc.sessions.rename({sessionId: owned.id, title: 'the godwit count'})
          expect(await searchHit('godwit')).toEqual([{excerpt: null, matched: ['godwit']}])

          const tabbed = claudeId('claude-tabbed')
          writeClaudeTurn(tabbed, 'a tabbed tally', `${'alpha\t'.repeat(100)}phalarope`)
          await foundOnceIndexed('phalarope', [tabbed])
          const [phalarope] = await searchHit('phalarope')
          expect(phalarope?.matched).toEqual(['phalarope'])
          expect(phalarope?.excerpt).toMatch(/^….*phalarope$/s)
        })

        it('previews a native transcript newest window first, pages back by its cursor, and refuses an unknown one', async () => {
          const sanderling = claudeId('claude-sanderling')
          writeClaudeLines(
            sanderling,
            [0, 1, 2]
              .flatMap((turn) => [
                JSON.stringify({type: 'user', message: {content: `sanderling question ${turn}`}}),
                JSON.stringify({
                  type: 'assistant',
                  message: {content: [{type: 'text', text: `sanderling answer ${turn}`}]},
                }),
              ])
              .join('\n') + '\n',
            nextStamp(),
          )
          const {sessions: listed} = await searchKit().rpc.sessions.list({limit: 100})
          const native = listed.find((meta) => meta.native?.nativeId === sanderling)?.native
          if (!native) throw new Error('the sanderling session was not listed')
          const textsIn = (window: {messages: ChatMessage[]}) =>
            window.messages.map((message) =>
              message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])),
            )
          const ask = {harness: native.harnessKind, nativeId: native.nativeId, limit: 4}

          const newest = await searchKit().rpc.sessions.preview({...ask, before: null})
          expect(textsIn(newest)).toEqual([
            ['sanderling question 1'],
            ['sanderling answer 1'],
            ['sanderling question 2'],
            ['sanderling answer 2'],
          ])
          const earlier = await searchKit().rpc.sessions.preview({...ask, before: newest.earlier})
          expect(textsIn(earlier)).toEqual([['sanderling question 0'], ['sanderling answer 0']])
          expect(earlier.earlier).toBeNull()
          const never = HarnessSessionId.parse(claudeId('claude-never'))
          await expect(searchKit().rpc.sessions.preview({...ask, nativeId: never, before: null})).rejects.toMatchObject(
            {
              code: 'NOT_FOUND',
            },
          )
          expect((await searchKit().rpc.sessions.list({limit: 100})).sessions).toHaveLength(listed.length)
        })

        it('previewing a session in a folder outside the index adds that folder, so a later search finds its sessions', async () => {
          const folder = realpathSync(tempDir('conciv-preview-unindexed-'))
          const transcriptIn = (nativeId: string, ask: string, answer: string) => {
            const id = HarnessSessionId.parse(nativeId)
            const entries = [
              {type: 'session', version: 3, id, timestamp: '2026-11-07T09:00:00.000Z'},
              {
                type: 'message',
                id: 'u1',
                parentId: null,
                message: {role: 'user', content: [{type: 'text', text: ask}]},
              },
              {
                type: 'message',
                id: 'a1',
                parentId: 'u1',
                message: {role: 'assistant', content: [{type: 'text', text: answer}]},
              },
            ]
            writeWhole(
              requireTranscriptPath(piHarness)(folder, id),
              entries.map((entry) => `${JSON.stringify(entry)}\n`).join(''),
              nextStamp(),
            )
          }
          transcriptIn('pi-plover-previewed', 'a plover on the shingle', 'it ran the tideline')
          transcriptIn('pi-plover-neighbour', 'a ringed plover nest', 'four speckled eggs')
          await searchKit().rpc.sessions.list({limit: 100})
          expect(await found('ringed', true)).toEqual([])

          const window = await searchKit().rpc.sessions.preview({
            harness: 'pi',
            nativeId: HarnessSessionId.parse('pi-plover-previewed'),
            cwd: folder,
            before: null,
            limit: 10,
          })
          expect(window.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
          await foundOnceIndexed('ringed', ['pi-plover-neighbour'], true)

          const elsewhere = realpathSync(tempDir('conciv-preview-elsewhere-'))
          const turnstone = claudeId('claude-turnstone-away')
          writeWhole(
            requireTranscriptPath(requireClaude())(elsewhere, HarnessSessionId.parse(turnstone)),
            JSON.stringify({type: 'user', cwd: elsewhere, message: {content: 'a turnstone away'}}) + '\n',
            nextStamp(),
          )
          await foundOnceIndexed('turnstone', [turnstone], true)
          expect(await found('ringed', true)).toEqual(['pi-plover-neighbour'])
          rmSync(folder, {recursive: true, force: true})
          rmSync(elsewhere, {recursive: true, force: true})
        })

        it('searches this project unless asked for every project, reading each session from its own folder', async () => {
          const elsewhere = realpathSync(tempDir('conciv-search-elsewhere-'))
          const home = claudeId('claude-avocet-home')
          const away = claudeId('claude-avocet-away')
          writeClaudeTurn(home, 'an avocet at home', 'it waded the lagoon')
          const awayPath = requireTranscriptPath(requireClaude())(elsewhere, HarnessSessionId.parse(away))
          mkdirSync(dirname(awayPath), {recursive: true})
          writeFileSync(
            awayPath,
            [
              JSON.stringify({type: 'user', cwd: elsewhere, message: {content: 'an avocet away'}}),
              JSON.stringify({type: 'assistant', cwd: elsewhere, message: {content: [{type: 'text', text: 'stilts'}]}}),
            ].join('\n') + '\n',
          )
          const stamp = nextStamp() / 1000
          utimesSync(awayPath, stamp, stamp)
          expect(await listedNativeIds()).toContain(home)

          await foundOnceIndexed('avocet', [home])
          expect(await found('stilts')).toEqual([])
          await foundOnceIndexed('avocet', [away, home], true)
          await foundOnceIndexed('stilts', [away], true)
          expect(await found('avocet')).toEqual([home])

          const {sessions: hits} = await searchKit().rpc.sessions.search({term: 'avocet', everywhere: true})
          expect(hits.map(({native, cwd}) => ({nativeId: native?.nativeId, cwd}))).toEqual([
            {nativeId: away, cwd: elsewhere},
            {nativeId: home, cwd: null},
          ])
          expect(hits[0]?.resume).toBe(`cd '${elsewhere}' && 'claude' '--resume' '${away}'`)
          expect(hits[1]?.resume).toBeNull()
          writeCodexTurn('codex-avocet-away', 'a codex avocet away', 'it fed', elsewhere)
          const piAway = HarnessSessionId.parse('pi-avocet-away')
          writeWhole(
            requireTranscriptPath(piHarness)(elsewhere, piAway),
            [
              {type: 'session', version: 3, id: piAway, timestamp: '2026-11-07T09:00:00.000Z', cwd: elsewhere},
              {type: 'message', id: 'u1', parentId: null, message: {role: 'user', content: 'a pi avocet away'}},
            ]
              .map((entry) => `${JSON.stringify(entry)}\n`)
              .join(''),
            nextStamp(),
          )
          await foundOnceIndexed('avocet', [piAway, 'codex-avocet-away', away, home], true)
          const {sessions: kinds} = await searchKit().rpc.sessions.search({term: 'avocet', everywhere: true})
          expect(kinds.map(({harnessKind, resume}) => ({harnessKind, resume}))).toEqual([
            {harnessKind: 'pi', resume: `cd '${elsewhere}' && 'pi' '--session' '${piAway}'`},
            {harnessKind: 'codex', resume: `cd '${elsewhere}' && 'codex' 'resume' 'codex-avocet-away'`},
            {harnessKind: 'claude', resume: `cd '${elsewhere}' && 'claude' '--resume' '${away}'`},
            {harnessKind: 'claude', resume: null},
          ])
          expect(await listedNativeIds()).not.toContain(away)
          const awayAsk = {harness: 'claude', nativeId: HarnessSessionId.parse(away), before: null, limit: 10}
          const awayWindow = await searchKit().rpc.sessions.preview({...awayAsk, cwd: elsewhere})
          expect(awayWindow.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
          await expect(searchKit().rpc.sessions.preview(awayAsk)).rejects.toMatchObject({code: 'NOT_FOUND'})
          rmSync(elsewhere, {recursive: true, force: true})
        })

        it('tolerates typos only when every word has at least four characters', async () => {
          writeClaudeTurn(claudeId('claude-item-three'), 'review item 3', 'checked')
          writeClaudeTurn(claudeId('claude-item-twenty-nine'), 'review item 29', 'checked')
          writeClaudeTurn(claudeId('claude-item-thirty-nine'), 'review item 39', 'checked')

          await foundOnceIndexed('39', [claudeId('claude-item-thirty-nine')])
        })

        it('matches a renamed native session by its new title', async () => {
          writeCodexTurn('codex-walrus', 'the walrus task', 'walrus handled')
          await foundOnceIndexed('walrus', ['codex-walrus'])
          expect(await found('falcon')).toEqual([])
          const {sessions: listed} = await searchKit().rpc.sessions.list({limit: 100})
          const walrus = listed.find((meta) => meta.native?.nativeId === 'codex-walrus')
          if (walrus === undefined) throw new Error('the codex session was not listed')

          await searchKit().rpc.sessions.rename({sessionId: walrus.id, title: 'the renamed falcon'})

          expect(await found('falcon')).toEqual(['codex-walrus'])
        })

        it('re-indexes a changed transcript and drops a removed one', async () => {
          writeClaudeTurn(claudeId('claude-changing'), 'a first draft', 'drafted')
          await foundOnceIndexed('drafted', [claudeId('claude-changing')])
          expect(await found('heron')).toEqual([])

          writeClaudeTurn(claudeId('claude-changing'), 'a first draft', 'the heron came back')
          await later(LIVE_REINDEX_MS, () => foundOnceIndexed('heron', [claudeId('claude-changing')]))

          rmSync(claudeTranscriptPath(claudeId('claude-changing')))
          await foundOnceIndexed('heron', [])
        })

        it('matches a conciv-only session on its own title, literally', async () => {
          const {sessionId} = await searchKit().rpc.sessions.create(undefined)
          await searchKit().rpc.sessions.rename({sessionId, title: 'ostrich notes 100%'})

          expect(await found('ostr')).toEqual(['ostrich notes 100%'])
          expect(await found('100%')).toEqual(['ostrich notes 100%'])
          expect(await found('1_0')).toEqual([])
        })
      })

      it('the session list titles, renames, refuses bad input, and forgets deleted sessions', async () => {
        const [kept, removed] = [await newSession(), await newSession()]
        expect(await chatKit().rpc.markers.list({sessionId: kept})).toEqual([
          expect.objectContaining({kind: 'new', afterMessageId: null}),
        ])
        await finished(kept, 'title from me')
        await finished(removed, 'clear me')
        expect(await sessionMeta(kept)).toMatchObject({origin: 'conciv', title: 'title from me'})
        await chatKit().rpc.sessions.rename({sessionId: kept, title: '  renamed  '})
        expect((await sessionMeta(kept)).title).toBe('renamed')
        await expect(chatKit().rpc.sessions.rename({sessionId: NEVER_MADE, title: 'x'})).rejects.toMatchObject({
          code: 'NOT_FOUND',
        })
        await expect(chatKit().rpc.sessions.model({sessionId: kept, model: 'no-such-model'})).rejects.toMatchObject({
          code: 'UNKNOWN_MODEL',
        })
        await chatKit().rpc.sessions.delete({sessionId: removed})
        expect((await chatKit().rpc.sessions.list(undefined)).sessions.map((meta) => meta.id)).not.toContain(removed)
        expect(await thread(removed)).toEqual([])
        expect(await threadUserTexts(kept)).toEqual(['title from me'])
      })
    })

    describe('code mode', () => {
      it('a turn and agents over MCP get the same tools: run code, discover tools, and the asking tools', async () => {
        const sessionId = await newSession()
        await finished(sessionId, 'tools')
        const offered = await app.mcpTools()
        for (const names of [findLastRun(sessionId).tools, offered.map((tool) => tool.name)]) {
          expect(names).toEqual(expect.arrayContaining(['execute_typescript', 'discover_tools', 'fixture_ask']))
          expect(names).not.toContain('fixture_echo')
        }
        const description = offered.find((tool) => tool.name === 'execute_typescript')?.description ?? ''
        expect(description).toContain('discover_tools')
        expect(description).toContain('- fixture (7 tools')
        expect(description).toContain('external_fixture_echo(')
      })

      it('code reaches every capability by name, returns values and logs, and keeps each run isolated', async () => {
        expect(await executeResult('return 1 + 1')).toBe(2)
        expect(await executeResult('return await external_fixture_echo({text: "bound"})')).toEqual({echoed: 'bound'})
        expect(await executeResult('return typeof external_conciv_ui')).toBe('function')
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

      it('a program awaiting tools one after another and in a loop gets every result back in order', async () => {
        const sequential = Array.from(
          {length: 20},
          (_, index) => `seen.push((await external_fixture_echo({text: 's${index}'})).echoed)`,
        ).join('\n')
        const program = `const seen = []
${sequential}
for (let index = 0; index < 30; index++) seen.push((await external_fixture_echo({text: 'l' + index})).echoed)
return seen`
        expect(await executeResult(program)).toEqual([
          ...Array.from({length: 20}, (_, index) => `s${index}`),
          ...Array.from({length: 30}, (_, index) => `l${index}`),
        ])
      })

      it('a tool that returns nothing resolves to undefined and the program goes on', async () => {
        expect(
          await executeResult('const quiet = await external_fixture_quiet({}); return [typeof quiet, "after"]'),
        ).toEqual(['undefined', 'after'])
      })

      it('a program that never ends leaves the server answering, and stopping its turn ends the program', async () => {
        const sessionId = await newSession()
        codeTurn('await external_fixture_echo({text: "spinning"}); while (true) {}')
        const turn = await send(sessionId, 'spin', {runId: 'spin-run'})
        await turn.waitFor((chunk) => isResultFor(chunk, 'spinning'), GUARD)
        const asked = performance.now()
        await chatKit().rpc.sessions.list(undefined)
        expect(performance.now() - asked).toBeLessThan(1_000)
        const ended = nextTurnEnd(sessionId)
        await chatKit().rpc.chat.stop({sessionId, runIds: ['spin-run']})
        await ended()
      })

      it('a program waiting on a tool that never answers ends when its turn stops', async () => {
        const sessionId = await newSession()
        codeTurn('await external_fixture_hold({})')
        await send(sessionId, 'hold', {runId: 'hold-run'})
        await holdEntered.promise
        const ended = nextTurnEnd(sessionId)
        await chatKit().rpc.chat.stop({sessionId, runIds: ['hold-run']})
        await ended()
      })

      async function silentPage(sessionId: string) {
        const tab = await chatTabs.open(sessionId, () => undefined)
        onTestFinished(() => tab.end())
        return tab
      }

      it('stopping a turn whose program waits on the page drops the page query', async () => {
        const sessionId = await newSession()
        const page = await silentPage(sessionId)
        codeTurn('return await external_page_route({})')
        await send(sessionId, 'route', {runId: 'page-stop-run'})
        const requestId = await page.requested()
        const ended = nextTurnEnd(sessionId)
        await chatKit().rpc.chat.stop({sessionId, runIds: ['page-stop-run']})
        await ended()
        await page.cancelled(requestId)
        await expect(page.command(requestId)).rejects.toThrow('Page request is no longer available.')
      })

      it('a page call a program leaves running is dropped when the program ends', async () => {
        const sessionId = await newSession()
        const page = await silentPage(sessionId)
        const mcp = await createMCPClient({
          transport: {type: 'http', url: `${chatKit().base}/api/mcp`, headers: {[CONCIV_SESSION_HEADER]: sessionId}},
        })
        onTestFinished(() => mcp.close())
        const typescriptCode =
          'void external_page_route({}); await external_fixture_echo({text: "after"}); return "ended"'
        expect(JSON.stringify(await mcp.callTool('execute_typescript', {typescriptCode}))).toContain('ended')
        const requestId = await page.requested()
        await page.cancelled(requestId)
        await expect(page.command(requestId)).rejects.toThrow('Page request is no longer available.')
      })

      it('an MCP client that cancels execute_typescript stops the program and drops its page query', async () => {
        const sessionId = await newSession()
        const page = await silentPage(sessionId)
        const stream = await chatKit().events(sessionId)
        const events = collect(stream)
        const mcp = await createMCPClient({
          transport: {type: 'http', url: `${chatKit().base}/api/mcp`, headers: {[CONCIV_SESSION_HEADER]: sessionId}},
        })
        onTestFinished(() => mcp.close())
        const cancelling = new AbortController()
        const typescriptCode = 'return await external_page_route({})'
        const running = mcp.callTool('execute_typescript', {typescriptCode}, {signal: cancelling.signal})
        const requestId = await page.requested()
        cancelling.abort()
        await expect(running).rejects.toThrow()
        await stream.waitFor((chunk) => chunk.type === ChatEventType.RUN_FINISHED)
        const result = events.findLast((chunk) => chunk.type === ChatEventType.TOOL_CALL_RESULT)
        expect(JSON.stringify(result)).toMatch(/abort/i)
        await page.cancelled(requestId)
        await expect(page.command(requestId)).rejects.toThrow('Page request is no longer available.')
      })

      it('discover_tools shows a tool output shape and declared error codes; the catalog lives on execute_typescript', async () => {
        const discover = await mcpTool('discover_tools')
        const found = JSON.stringify(await discover.execute({toolNames: ['fixture_fail']}))
        expect(found).toContain('Returns JSON matching')
        expect(found).toContain('PROBE_BROKE: the probe broke')
        expect(JSON.stringify(await discover.execute({toolNames: ['fixture_echo']}))).toContain('echoed')
        const execute = await mcpTool('execute_typescript')
        expect(execute.description).toContain('- fixture (7 tools')
        expect(execute.description).not.toContain('PROBE_BROKE')
        expect(discover.description).toContain('toolNames')
        expect(discover.description).not.toContain('external_fixture_fail')
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
      it('each call in a script shows as its own card under the script, with results, errors (bad arguments too) and caps, after reload too', async () => {
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
        expect(children.map((part) => part.state === 'error')).toEqual([false, false, true, true, false])
        const results = collectResults(await thread(sessionId))
        expect(results).toContain('Input validation failed for tool fixture_echo')
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
        const results = collectResults(await thread(sessionId))
        expect(results).toContain(BIG_IMAGE_BYTES)
        expect(results).not.toContain('z'.repeat(60_000))
      })

      it('a page screenshot lands in a gitignored project file, and the result names it beside the image', async () => {
        const sessionId = await chatKit().session()
        const shot = {id: `file_${randomUUID()}`, name: 'screenshot.webp', mime: 'image/webp', data: ONE_PIXEL_WEBP}
        const tab = await chatTabs.open(sessionId, () => ({
          type: 'success',
          result: {value: {width: 8, height: 6}, files: [shot]},
        }))
        onTestFinished(() => tab.end())
        codeTurn('return await external_page_screenshot({})')
        await finished(sessionId, 'shoot')
        const results = collectResults(await thread(sessionId))
        expect(results).toContain(ONE_PIXEL_WEBP)
        expect(results).toContain('"mimeType":"image/webp"')
        const saved = /\.conciv\/tmp\/screenshots\/[\w-]+\.webp/.exec(results)?.[0]
        if (saved === undefined) throw new Error(`no screenshot path in: ${results.slice(0, 300)}`)
        expect(readFileSync(join(chatKit().stateRoot, saved)).toString('base64')).toBe(ONE_PIXEL_WEBP)
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
        await turn.done()
      })
    })

    describe('page tools', () => {
      it('a page tool reaches the page without an ask and its change lands in the page journal', async () => {
        const sessionId = await chatKit().session()
        const tab = await chatTabs.open(sessionId, () => pageSuccess({ok: true}))
        onTestFinished(() => tab.end())
        codeTurn('return await external_page_click({selector: "#go"})')
        const events = await finished(sessionId, 'click')
        expect(events.custom('approval-requested')).toEqual([])
        expect(tab.seen()).toContain('page_click')
        expect(
          await chatKit().rpc.plugin.call({rpcId: 'experimental.page', method: 'changes', input: {sessionId}}),
        ).toContainEqual(expect.objectContaining({verb: 'page_click', selector: '#go'}))
      })
    })

    describe('transport and workspace', () => {
      it('a turn over SSE stores the same thread as one over the socket, and nothing lands in the project', async () => {
        const [overSocket, overSse] = [await newSession(), await newSession()]
        await finished(overSocket, 'same')
        await readSse(
          await sseTurn(chatKit().base, overSse, 'sse-run', 'same', new AbortController().signal),
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
  const UNKNOWN_SESSION = `conciv_unknown-but-valid-${'x'.repeat(110)}`
  const NEVER_MADE = 'conciv_never-made'
  const DECLARED_MESSAGE = 'PROBE_BROKE: the probe broke'
  const FIXTURE_TOOLS = ['fixture_echo', 'fixture_read', 'fixture_ask']
  const CHILD_CARDS = ['fixture_echo', 'fixture_echo', 'fixture_echo', 'fixture_fail', 'fixture_huge']
  const ECHO_DESCRIPTION = 'Echo the text back.\n\nUse it to echo.\n\nNever echo secrets.\n\nKeep it short.'
  const EXPANSION_PART = {type: 'text', content: 'fixture-expanded', metadata: {modelOnly: true}}
  const IMAGE = {type: 'image', source: {type: 'data', mimeType: 'image/png', value: ONE_PIXEL_PNG}}
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
  try { await external_fixture_echo({text: 5}) } catch {}
  try { await external_fixture_fail({spaced: true}) } catch {}
  const huge = await external_fixture_huge({})
  return huge.blob.length
`
  const SseChunkSchema = z.object({type: z.string()}).loose()
  const ResultEnvelopeSchema = z.object({result: z.unknown(), logs: z.array(z.string()).default([])}).loose()

  type SeenRun = {
    sessionId: string
    kind: HarnessChatDeps['kind']
    model: string | undefined
    effort: string | undefined
    resumeSessionId: string | null
    messages: string
    tools: string[]
    approvals: string[]
    denials: string[]
    startedAt: number
    endedAt: number | null
  }

  type TurnInput = string | Record<string, unknown>

  const ALL_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
  const CHAT_MODELS: HarnessModel[] = [
    {id: 'opus', name: 'Opus 5.5', group: 'Claude', efforts: ALL_EFFORTS},
    {id: 'sonnet', name: 'Sonnet 5.5', group: 'Claude', efforts: ALL_EFFORTS},
    {id: 'haiku', name: 'Haiku 5.5', group: 'Claude', efforts: ALL_EFFORTS},
    {id: 'claude-haiku-4-5', name: 'Haiku 4.5', group: 'Older versions'},
  ]

  type SharedApp = {
    kit: Kit | null
    harness: TestHarness | null
    mcp: McpClient | null
    mcpSession: string
    mcpTools: () => Promise<McpTool[]>
  }

  const app: SharedApp = {
    kit: null,
    harness: null,
    mcp: null,
    mcpSession: '',
    mcpTools: async () => {
      if (app.mcp === null) throw new Error('the MCP client is not connected')
      return app.mcp.tools()
    },
  }
  const seenRuns: SeenRun[] = []
  const cli: {usage: TokenUsage[]; launchFailures: string[]} = {usage: [], launchFailures: []}
  const toolRuns = {ask: 0, echo: 0}
  const quietCallIds: (string | undefined)[] = []
  const refusedCalls: {code: string; message: string; sessionId: string; tool: string; input: unknown}[] = []
  const holdEntered = Promise.withResolvers<void>()
  const turnEnds: string[] = []
  const turnEndWaiters: {sessionId: string; settle: () => void}[] = []

  function fixtureExtension() {
    return defineExtension({
      name: 'fixture',
      tools: [echoTool(), readTool(), quietTool(), holdTool(), askTool(), failTool(), hugeTool(), imageTool()],
      attachments: fixtureAttachments(),
    }).server(() => ({context: {}, turnEnd: noteTurnEnd, middleware: noteRefusal}))
  }

  const noteRefusal: ToolMiddleware = onError((error, {path, context}, input) => {
    if (!(error instanceof ORPCError)) return
    refusedCalls.push({
      code: error.code,
      message: error.message,
      sessionId: context.request.sessionId,
      tool: path.join('.'),
      input,
    })
  })

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

  function quietTool() {
    return defineTool({
      name: 'fixture_quiet',
      description: 'Do nothing and return nothing.',
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
      meta: {summary: 'return nothing', category: 'fixture', mutating: false},
    }).server((_input, _context, request) => {
      quietCallIds.push(request.toolCallId)
      return undefined
    })
  }

  function holdTool() {
    return defineTool({
      name: 'fixture_hold',
      description: 'Never answer.',
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
      meta: {summary: 'never answer', category: 'fixture', mutating: false},
    }).server(() => {
      holdEntered.resolve()
      return new Promise<never>(() => {})
    })
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

  function nextTurnEnd(sessionId: string): () => Promise<void> {
    const fired = Promise.withResolvers<void>()
    turnEndWaiters.push({sessionId, settle: fired.resolve})
    return () => firedWithin(fired.promise, sessionId)
  }

  async function firedWithin(fired: Promise<void>, sessionId: string): Promise<void> {
    const stall = Promise.withResolvers<never>()
    const guard = setTimeout(
      () => stall.reject(new Error(`the run-end hook did not fire for ${sessionId} within 3s`)),
      3_000,
    )
    try {
      await Promise.race([fired, stall.promise])
    } finally {
      clearTimeout(guard)
    }
  }

  function recordingHarness(base: TestHarness): TestHarness {
    return {
      ...base,
      models: CHAT_MODELS,
      chatConfig: (deps: HarnessChatDeps) => {
        const failure = cli.launchFailures.shift()
        if (failure !== undefined) throw new Error(failure)
        return {
          adapter: makeTextAdapter('scripted', async function* (options) {
            const seen: SeenRun = {
              sessionId: deps.sessionId,
              kind: deps.kind,
              model: deps.model,
              effort: deps.effort,
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
    return {
      promptTokens,
      completionTokens: 1,
      totalTokens: promptTokens + 1,
      providerUsageDetails: {contextWindow: 1_000_000},
    }
  }

  function chatKit(): Kit {
    if (app.kit === null) throw new Error('the app did not boot')
    return app.kit
  }

  function script(): TestHarness['script'] {
    if (app.harness === null) throw new Error('the app did not boot')
    return app.harness.script
  }

  async function newSession(): Promise<string> {
    return (await chatKit().rpc.sessions.create()).sessionId
  }

  function send(
    sessionId: string,
    input: TurnInput,
    opts: {runId?: string; messageId?: string} = {},
  ): Promise<RunStream> {
    return chatKit().turn(input, {session: sessionId, ...opts})
  }

  async function finished(sessionId: string, input: TurnInput, opts: {runId?: string; messageId?: string} = {}) {
    return (await send(sessionId, input, opts)).done()
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
    return chatKit().rpc.sessions.get({sessionId: SessionId.parse(sessionId)})
  }

  async function compactMarkers(sessionId: string): Promise<(string | null)[]> {
    const markers = await chatKit().rpc.markers.list({sessionId})
    return markers.filter((marker) => marker.kind === 'compact').map((marker) => marker.afterMessageId)
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

  function collectAssistantIds(events: RunEvents): string[] {
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

  function collect(stream: RunStream): ChatEvent[] {
    const seen: ChatEvent[] = []
    stream.tap((chunk) => seen.push(chunk))
    return seen
  }

  function count(events: RunEvents, type: ChatEvent['type']): number {
    return events.all.filter((chunk) => chunk.type === type).length
  }

  function collectEventRunIds(events: RunEvents, type: ChatEvent['type']): string[] {
    return events.all.flatMap((chunk) => (chunk.type === type && 'runId' in chunk ? [String(chunk.runId)] : []))
  }

  function listRuns(sessionId: string): SeenRun[] {
    return seenRuns.filter((run) => run.sessionId === sessionId)
  }

  function findLastRun(sessionId: string): SeenRun {
    const run = listRuns(sessionId).at(-1)
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

  function collectResults(messages: ChatMessage[]): string {
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

  async function leaveAfterFirstText(sessionId: string, runId: string): Promise<void> {
    const viewer = new AbortController()
    await readSse(
      await sseTurn(chatKit().base, sessionId, runId, 'nobody watches', viewer.signal),
      ChatEventType.TEXT_MESSAGE_CONTENT,
    )
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

  function fakeNativeId(sessionId: string): string {
    return `fake-${sessionId}`
  }

  function resolveTranscriptPath(nativeId: string): string {
    return requireTranscriptPath(requireClaude())(chatKit().stateRoot, HarnessSessionId.parse(nativeId))
  }

  function writeNativeAt(nativeId: string, task: string, updatedAt: number): void {
    const path = writeTranscript(nativeId, [JSON.stringify({type: 'user', message: {content: task}})])
    utimesSync(path, updatedAt / 1000, updatedAt / 1000)
  }

  function writeTranscript(nativeId: string, lines: string[]): string {
    const path = resolveTranscriptPath(nativeId)
    mkdirSync(dirname(path), {recursive: true})
    writeFileSync(path, lines.join('\n'))
    return path
  }

  function existingTranscript(nativeId: string): string[] {
    const path = resolveTranscriptPath(nativeId)
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
    await turn.done()
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

  function mcpPost(headers: Record<string, string>): Promise<Response> {
    return fetch(`${chatKit().base}/api/mcp`, {
      method: 'POST',
      headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'}),
    })
  }
})

describe('token charset', () => {
  test('an invalid token refuses to boot with a constraint-naming error', async () => {
    const root = tempDir('conciv-token-charset-')
    const options = {harnessBin: 'true', stateRoot: root}
    const booted = start({options, root, launchEditor: () => {}, accessToken: ':a'}).then((engine) => engine.stop())
    await expect(booted).rejects.toThrow('accessToken must be a UUID pairing token')
    rmSync(root, {recursive: true, force: true})
  })
})

function bootAt(
  homeDir: string,
  root = tempDir('conciv-outside-'),
  hubAccess: HubAccess = 'session',
  harness = createFakeHarness(),
  plugins: readonly Plugin.Plugin[] = [],
  permissions: Pick<ConcivConfig, 'permission' | 'permissions'> = {},
): Promise<Engine> {
  return start({
    options: {stateRoot: root, hubAccess, ...permissions},
    root,
    launchEditor: () => {},
    harness,
    homeDir,
    plugins,
  })
}

describe('outside sessions', () => {
  const API_BASE = /^http:\/\/127\.0\.0\.1:\d+\/t\/[0-9a-f-]{36}$/

  async function healthId(engine: Engine): Promise<string> {
    const health: unknown = await (await fetch(`http://127.0.0.1:${engine.port}/health`)).json()
    return z.object({id: z.string()}).parse(health).id
  }

  it('a started engine retires stale rows and keeps its own, and stop retires it', async () => {
    const [home, root] = [tempDir('conciv-home-'), tempDir('conciv-outside-')]
    const gone = await bootAt(tempDir('conciv-home-'))
    await gone.stop()
    const stale = {id: randomUUID(), pid: 1, root: '/gone', apiBase: `http://127.0.0.1:${gone.port}/t/${randomUUID()}`}
    withHomeDb(home, (db) => registerEngine(db, stale))
    const engine = await bootAt(home, root)
    const row = {id: await healthId(engine), pid: process.pid, root, apiBase: expect.stringMatching(API_BASE)}
    await vi.waitFor(() => expect(withHomeDb(home, listEngines)).toEqual([row]), {timeout: 3000})
    await engine.stop()
    expect(withHomeDb(home, listEngines)).toEqual([])
  })

  it.each([
    ['the home folder is a file', (home: string) => writeFileSync(home, 'not a folder')],
    [
      'home.db is corrupt',
      (home: string) => {
        mkdirSync(home)
        writeFileSync(join(home, 'home.db'), 'garbage')
      },
    ],
  ])('an engine starts and stops when %s', async (_case, spoil) => {
    const home = join(tempDir('conciv-home-'), 'home')
    spoil(home)
    const engine = await bootAt(home)
    expect((await fetch(`http://127.0.0.1:${engine.port}/health`)).status).toBe(200)
    await expect(engine.stop()).resolves.toBeUndefined()
  })

  describe('tabs.list and tabs.get', () => {
    const repo = tempDir('conciv-tabs-')
    const app = join(repo, 'apps', 'web')
    const instructions = 'be careful in this page'
    const route = {href: 'http://localhost:5173/settings', title: 'Settings', state: 'visible', pathname: '/settings'}
    const tabs = pageTabs()
    const kit = sharedKit(() => {
      mkdirSync(join(repo, '.git'))
      mkdirSync(app, {recursive: true})
      writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/feature-x\n')
      writeFileSync(join(app, 'package.json'), JSON.stringify({name: 'tabs-fixture'}))
      const boot = bootCoreApp({cwd: app, systemPromptText: instructions, plugins: [tabs.plugin]})
      return createTestkit(createFakeHarness({id: 'fake-tabs'}), boot).setup()
    })
    const pages: Array<() => void> = []

    afterEach(async () => {
      pages.splice(0).forEach((end) => end())
      await vi.waitFor(async () => expect((await listTabs()).tabs).toEqual([]), {timeout: 5000})
    })

    async function listTabs() {
      return TabsSchema.parse(await kit().rpc.tabs.list())
    }

    async function joinPage(): Promise<void> {
      const look = {url: route.href, title: route.title}
      pages.push((await tabs.open(await kit().session(), () => pageSuccess({...route, search: ''}), look)).end)
    }

    it('tabs.list and /api/mcp refuse a missing or wrong token, and /health a malformed one', async () => {
      const paths = ['/rpc/tabs/list', '/api/mcp'].flatMap((path) => [path, `/t/${randomUUID()}${path}`])
      const statuses = await Promise.all(
        [...paths, '/t/nope/health'].map(async (path) => (await fetch(`${kit().origin}${path}`)).status),
      )
      expect(statuses).toEqual([401, 401, 401, 401, 401])
    })

    it('tabs.list lists a joined page, and tabs.get answers open and not open with the engine prompt', async () => {
      const tabOpen = async () => TabOpenSchema.parse(await kit().rpc.tabs.get({sessionId: await kit().session()}))
      expect(await tabOpen()).toEqual({open: false, instructions})
      await joinPage()
      expect(await tabOpen()).toEqual({open: true, instructions})
      const session = {title: expect.any(String), updatedAt: expect.any(Number), running: false}
      const page = {href: route.href, title: route.title, state: route.state}
      expect(await listTabs()).toEqual({
        project: {name: 'tabs-fixture', root: app, branch: 'feature-x'},
        tabs: [
          {
            sessionId: await kit().session(),
            harness: 'fake-tabs',
            browserTabs: [{id: expect.stringMatching(/^tab_[0-9a-f-]{36}$/), page}],
            session,
            page,
          },
        ],
      })
    })

    it('a page query goes to the one browser tab focused last, and the listing names every browser tab', async () => {
      const sessionId = await kit().session()
      async function browserTab(pathname: string) {
        const heard: string[] = []
        const answers: {silent: PromiseWithResolvers<void> | undefined} = {silent: undefined}
        const href = `http://localhost:5173${pathname}`
        const tab = await tabs.open(
          sessionId,
          () => {
            heard.push(pathname)
            if (answers.silent === undefined) return pageSuccess({...route, href, pathname, search: ''})
            answers.silent.resolve()
            return undefined
          },
          {url: href, focused: false},
        )
        pages.push(tab.end)
        const silence = () => {
          answers.silent = Promise.withResolvers<void>()
          return answers.silent.promise
        }
        return {heard, report: tab.focus, silence, close: tab.end}
      }
      const first = await browserTab('/first')
      const second = await browserTab('/second')
      const listedFirst = async () => (await listTabs()).tabs[0]?.browserTabs[0]?.page?.href
      const routed = async () =>
        z.object({href: z.string()}).parse(await registryCall(kit().base, sessionId)('page_route', {})).href
      await second.report(true)
      expect(await listedFirst()).toBe('http://localhost:5173/second')
      const listing = await listTabs()
      expect(listing.tabs[0]?.browserTabs.map((entry) => entry.page?.href)).toEqual([
        'http://localhost:5173/second',
        'http://localhost:5173/first',
      ])
      expect(listing.tabs[0]?.page?.href).toBe('http://localhost:5173/second')
      const [firstHeard, secondHeard] = [first.heard.length, second.heard.length]
      expect(await routed()).toBe('http://localhost:5173/second')
      expect([first.heard.length - firstHeard, second.heard.length - secondHeard]).toEqual([0, 1])
      await first.report(true)
      expect(await listedFirst()).toBe('http://localhost:5173/first')
      expect(await routed()).toBe('http://localhost:5173/first')
      first.close()
      await vi.waitFor(async () => expect((await listTabs()).tabs[0]?.browserTabs).toHaveLength(1), {timeout: 3000})
      expect(await routed()).toBe('http://localhost:5173/second')
      const asked = second.silence()
      const waited = second.heard.length
      const inFlight = expect(routed()).rejects.toThrow(
        /^\[page\.disconnected\] The page connection closed; the action may already have run\./,
      )
      await asked
      expect(second.heard.length).toBe(waited + 1)
      second.close()
      await inFlight
    })

    it.skipIf(process.getuid?.() === 0)(
      'an unreadable package.json leaves the project name out and keeps every tab listed',
      async () => {
        const sessionId = await kit().session()
        await joinPage()
        chmodSync(join(app, 'package.json'), 0o000)
        try {
          const listing = await listTabs()
          expect([listing.project.name, listing.tabs.map((tab) => tab.sessionId)]).toEqual([null, [sessionId]])
        } finally {
          chmodSync(join(app, 'package.json'), 0o644)
        }
      },
    )

    it('branch is re-read per request from the repository above the project, through a worktree gitdir file too', async () => {
      writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/other\n')
      expect((await listTabs()).project.branch).toBe('other')
      const gitdir = tempDir('conciv-tabs-gitdir-')
      writeFileSync(join(gitdir, 'HEAD'), 'ref: refs/heads/worktree-y\n')
      rmSync(join(repo, '.git'), {recursive: true})
      writeFileSync(join(repo, '.git'), `gitdir: ${gitdir}\n`)
      expect((await listTabs()).project.branch).toBe('worktree-y')
    })
  })
})

describe('outside agent consent', () => {
  const HUB = {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: 'codex'}
  const RAN = /"result":1/
  const DENIED = 'The user denied codex access to the conciv tab'
  const OUTSIDE_ASK = {toolName: 'Allow codex to use this tab', input: {client: 'codex'}}
  const ROUTE = {href: 'http://localhost:5173/a', title: 'A', state: 'visible', pathname: '/a', search: ''}
  type Booted = {
    base: string
    stopped: AbortSignal
    answering: Array<Promise<void>>
    tabs: ReturnType<typeof pageTabs> | undefined
    stop: () => Promise<void>
  }
  const engines: Booted[] = []
  const pages = new AbortController()
  afterAll(async () => {
    pages.abort()
    const stops = await Promise.allSettled([...engines].map((engine) => engine.stop()))
    const failures = stops.flatMap((stop) => (stop.status === 'rejected' ? [stop.reason] : []))
    if (failures.length > 0) throw new AggregateError(failures, 'stopping the consent engines failed')
  })

  function track(engine: Engine, tabs?: ReturnType<typeof pageTabs>): string {
    const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`
    const stopped = new AbortController()
    const booted: Booted = {
      base,
      stopped: stopped.signal,
      answering: [],
      tabs,
      stop: async () => {
        engines.splice(engines.indexOf(booted), 1)
        stopped.abort()
        const answered = await Promise.allSettled(booted.answering)
        const [engineStopped] = await Promise.allSettled([engine.stop()])
        const failures = [...answered, engineStopped].flatMap((result) =>
          result.status === 'rejected' ? [result.reason] : [],
        )
        if (failures.length > 0) throw new AggregateError(failures, 'stopping the consent engine failed')
      },
    }
    engines.push(booted)
    return base
  }

  function connectedHome(home = tempDir('conciv-home-')): string {
    withHomeDb(home, (db) => recordHubConnection(db, 'codex', Date.now()))
    return home
  }

  async function boot(hubAccess: HubAccess = 'session', home = tempDir('conciv-home-')): Promise<string> {
    connectedHome(home)
    const tabs = pageTabs()
    return track(await bootAt(home, tempDir('conciv-consent-'), hubAccess, createFakeHarness(), [tabs.plugin]), tabs)
  }

  async function openTab(base: string, silent?: () => void, heard: string[] = []): Promise<string> {
    const engine = engines.find((booted) => booted.base === base)
    if (engine?.tabs === undefined) throw new Error(`no engine with a page plugin was booted at ${base}`)
    const sessionId = await newSession(base)
    const answerFor = (command: Page.Command): PageReply | undefined => {
      heard.push(`page_${command.action.type}`)
      if (silent === undefined) return pageAnswer(command)
      silent()
      return undefined
    }
    const tab = await engine.tabs.open(sessionId, answerFor, {url: ROUTE.href, title: ROUTE.title})
    const closing = AbortSignal.any([pages.signal, engine.stopped])
    closing.addEventListener('abort', () => tab.end(), {once: true})
    const tabOpen = async () => TabOpenSchema.parse(await makeRpcClient(base).tabs.get({sessionId}))
    expect((await tabOpen()).open).toBe(true)
    return sessionId
  }

  const outside = (base: string, code: string): Promise<string> => executeOverMcp(base, HUB, code).then(String, String)

  const SCREENSHOT = {image: ONE_PIXEL_WEBP, width: 1, height: 1}

  const EVALUATED = {result: 'evaluated'}

  const pageAnswer = (command: Page.Command): PageReply =>
    command.action.type === 'eval'
      ? {type: 'success', result: {value: EVALUATED, files: []}}
      : command.action.type === 'screenshot'
        ? {
            type: 'success',
            result: {
              value: {width: SCREENSHOT.width, height: SCREENSHOT.height},
              files: [
                {id: `file_${randomUUID()}`, name: 'screenshot.webp', mime: 'image/webp', data: SCREENSHOT.image},
              ],
            },
          }
        : pageSuccess(ROUTE)

  const createSessionRpc = (base: string, sessionId: string) =>
    makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})

  const newSession = async (base: string) => (await makeRpcClient(base).sessions.create(undefined)).sessionId

  const hubCall = (base: string, sessionId: string): Promise<string> =>
    executeOverMcp(base, {[CONCIV_SESSION_HEADER]: sessionId, ...HUB}, 'return 1').then(String, String)

  const loadPending = async (base: string, sessionId: string) =>
    (await createSessionRpc(base, sessionId).chat.hydrate({sessionId})).pendingApprovals

  async function toolStarts(base: string, sessionId: string, count = 1): Promise<() => Promise<unknown[]>> {
    const events = await createSessionRpc(base, sessionId).chat.events({sessionId}, {signal: pages.signal})
    return async () => {
      const seen: unknown[] = []
      for await (const chunk of events) {
        if (chunk.type === ChatEventType.TOOL_CALL_START) seen.push(chunk)
        if (seen.length === count) return seen
      }
      return seen
    }
  }

  async function askRaised(base: string, sessionId: string): Promise<ReturnType<typeof readApprovalAsk>> {
    const raised = new AbortController()
    const signal = AbortSignal.any([raised.signal, pages.signal])
    const events = await createSessionRpc(base, sessionId).chat.events({sessionId}, {signal})
    try {
      for await (const chunk of events) {
        const ask = readApprovalAsk(chunk)
        if (ask !== null) return ask
      }
      return null
    } finally {
      raised.abort()
    }
  }

  async function decideOutside(base: string, sessionId: string, approved: boolean): Promise<void> {
    expect(await askRaised(base, sessionId)).toMatchObject(OUTSIDE_ASK)
    const pending = await loadPending(base, sessionId)
    expect(pending).toHaveLength(1)
    const [ask] = pending
    expect(ask).toMatchObject({...OUTSIDE_ASK, runId: null})
    const decision = await createSessionRpc(base, sessionId).chat.permissionDecision({
      approvalId: ask?.approvalId ?? '',
      approved,
    })
    expect(decision.startsTurn).toBe(false)
  }

  it('session policy holds hub calls until the user answers: one allow releases every waiting call of its session only, a deny fails them and sticks until allowed', async () => {
    const base = await boot()
    const [first, second] = [await newSession(base), await newSession(base)]
    const lister = await connectMcpClient(`${base}/api/mcp`, {[CONCIV_SESSION_HEADER]: first, ...HUB})
    expect((await lister.tools()).map((tool) => tool.name)).toEqual(['discover_tools', 'skill', 'execute_typescript'])
    await lister.close()
    expect(await loadPending(base, first)).toEqual([])
    const waiting = [hubCall(base, first), hubCall(base, first)]
    await decideOutside(base, first, true)
    expect(await Promise.all(waiting)).toEqual([expect.stringMatching(RAN), expect.stringMatching(RAN)])
    expect(await hubCall(base, first)).toMatch(RAN)
    const refused = hubCall(base, second)
    await decideOutside(base, second, false)
    expect(await refused).toContain(DENIED)
    expect(await hubCall(base, second)).toContain(DENIED)
    expect(await loadPending(base, second)).toEqual([])
    const rpc = createSessionRpc(base, second)
    expect(await rpc.chat.outsideAccess({sessionId: second})).toEqual({denied: true})
    await rpc.chat.allowOutside({sessionId: second})
    expect(await rpc.chat.outsideAccess({sessionId: second})).toEqual({denied: false})
    const allowed = hubCall(base, second)
    await decideOutside(base, second, true)
    expect(await allowed).toMatch(RAN)
  })

  it('a tab that subscribes after the ask was published still receives it on its event stream', async () => {
    const base = await boot()
    const sessionId = await newSession(base)
    const waiting = hubCall(base, sessionId)
    expect(await askRaised(base, sessionId)).toMatchObject(OUTSIDE_ASK)
    const events = await createSessionRpc(base, sessionId).chat.events({sessionId}, {signal: AbortSignal.timeout(2000)})
    const first = await events[Symbol.asyncIterator]()
      .next()
      .catch((error: unknown): {done: true; value: string} => ({done: true, value: String(error)}))
    expect(first.done === false ? readApprovalAsk(first.value) : first.value).toMatchObject({
      toolName: 'Allow codex to use this tab',
      input: {client: 'codex'},
    })
    await decideOutside(base, sessionId, true)
    expect(await waiting).toMatch(RAN)
  })

  it('an outside run has no tab listing and refuses other capabilities with NO_TAB naming list_tabs; a hub call naming the tab runs it after allow, marked in its chat', async () => {
    const home = tempDir('conciv-home-')
    const [runner, owner] = [await boot('open', home), await boot('session', home)]
    const [mine, theirs] = [await openTab(runner), await openTab(owner)]
    const inPage = 'return [typeof external_tabs, typeof external_use_tab]'
    expect(String(await executeOverMcp(runner, {[CONCIV_SESSION_HEADER]: mine}, inPage))).toContain(
      '["undefined","undefined"]',
    )
    expect(await outside(runner, 'return [typeof external_tabs, typeof external_use_tab]')).toContain(
      '["undefined","undefined"]',
    )
    expect(await outside(runner, 'return await external_server_urls({})')).toContain(
      'NO_TAB: pass tab to execute_typescript; list_tabs lists the open tabs',
    )
    const onTab = (code: string) => executeOverMcp(owner, {[CONCIV_SESSION_HEADER]: theirs, ...HUB}, code)
    const routed = onTab('return await external_page_route({})').then(String)
    await decideOutside(owner, theirs, true)
    expect(await routed).toContain(ROUTE.href)
    const ownerCalls = await createSessionRpc(owner, theirs).chat.hydrate({sessionId: theirs})
    const ownerParts = ownerCalls.messages.flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'tool-call' ? [{name: part.name, id: part.id, metadata: part.metadata}] : [],
      ),
    )
    const top = ownerParts.findLast((part) => part.name === 'execute_typescript')
    expect(top?.id).toEqual(expect.any(String))
    const marker = {conciv: {origin: 'hub', client: 'codex', run: top?.id}}
    expect(ownerParts).toContainEqual({...top, metadata: expect.objectContaining(marker)})
    expect(ownerParts).toContainEqual({
      name: 'page_route',
      id: expect.any(String),
      metadata: expect.objectContaining({...marker, parentToolCallId: top?.id}),
    })
    expect(JSON.stringify(await onTab('return await external_page_screenshot({})'))).toContain(
      JSON.stringify({type: 'image', source: {type: 'data', value: SCREENSHOT.image, mimeType: 'image/webp'}}),
    )
  })

  it('a plugin in one engine lists every running engine with a client that reaches it, and loses an engine that stops', async () => {
    const home = tempDir('conciv-home-')
    const pinging = tempDir('conciv-pinger-')
    mkdirSync(join(pinging, 'conciv', 'plugins'), {recursive: true})
    writeFileSync(
      join(pinging, 'conciv', 'plugins', 'pinger.ts'),
      `const Pinger = {
  id: 'pinger',
  methods: {ping: {input: {type: 'object'}, output: {type: 'object'}}},
  events: {pinged: {schema: {type: 'object', properties: {count: {type: 'number'}}}}},
}

export default {
  id: 'pinger',
  async setup(ctx) {
    const registration = ctx.rpc.register(Pinger, {
      ping: async () => {
        await (await registration).events.emit('pinged', {count: 1})
        return {}
      },
    })
    await registration
  },
}
`,
    )
    const relaying = tempDir('conciv-relay-')
    mkdirSync(join(relaying, 'conciv', 'plugins'), {recursive: true})
    writeFileSync(
      join(relaying, 'conciv', 'plugins', 'relay.ts'),
      `const Relay = {id: 'relay', methods: {relay: {input: {type: 'object'}, output: {type: 'object'}}}, events: {}}
const Pinger = {
  id: 'pinger',
  methods: {ping: {input: {type: 'object'}, output: {type: 'object'}}},
  events: {pinged: {schema: {type: 'object', properties: {count: {type: 'number'}}}}},
}

export default {
  id: 'relay',
  async setup(ctx) {
    await ctx.rpc.register(Relay, {
      relay: async ({id}) => {
        const server = ctx.servers.get(id)
        if (server === undefined) return {listed: ctx.servers.list()}
        const stream = server.client.event.subscribe()[Symbol.asyncIterator]()
        const connected = await stream.next()
        const answer = await server.client.rpc(Pinger).ping({})
        const pinged = async () => {
          const next = await stream.next()
          if (next.done || next.value.type === 'rpc.pinger.pinged') return next.value
          return pinged()
        }
        const event = await pinged()
        await stream.return()
        return {connected: connected.value.type, answer, event}
      },
    })
  },
}
`,
    )
    connectedHome(home)
    const first = track(await bootAt(home, relaying))
    const second = track(await bootAt(home, pinging))
    const healthId = async (base: string): Promise<string> =>
      z.object({id: z.string()}).parse(await (await fetch(`${new URL(base).origin}/health`)).json()).id
    const [firstId, secondId] = [await healthId(first), await healthId(second)]
    const runtime = ManagedRuntime.make(provideServersSource({home, engineId: firstId}))
    onTestFinished(() => runtime.dispose())
    const servers = await runtime.runPromise(
      Effect.gen(function* () {
        return yield* PluginHost.ServersSource
      }),
    )
    const homeEngineRows = (): string => {
      try {
        const rows = withHomeDb(home, (db) => ({
          live: listEngines(db).map((row) => row.id),
          all: db.$client.prepare('SELECT id, deleted_at FROM engines ORDER BY rowid').all(),
        }))
        return `live ${JSON.stringify(rows.live)}, every row with deleted_at ${JSON.stringify(rows.all)}`
      } catch (error) {
        return `unreadable: ${String(error)}`
      }
    }
    const listed = async (expected: string[], since: {event: string; at: number}): Promise<void> => {
      try {
        await vi.waitFor(() => expect(servers.list()).toEqual(expected), {timeout: 25_000})
      } catch (error) {
        const held = servers.list().map((id) => ({id, connected: servers.get(id)?.connected}))
        const elapsed = Math.round(performance.now() - since.at)
        throw new Error(
          [
            error instanceof Error ? error.message : String(error),
            `first engine ${firstId}, second engine ${secondId}`,
            `the list holds ${JSON.stringify(held)}`,
            `home database engine rows: ${homeEngineRows()}`,
            `${elapsed} ms since ${since.event}`,
          ].join('\n'),
          {cause: error},
        )
      }
    }
    expect(servers.list()).toEqual([])
    await listed([firstId, secondId], {event: 'the servers source started', at: performance.now()})
    const fields = (id: string) => {
      const ref = servers.get(id)
      if (ref === undefined) throw new Error(`${id} is not listed`)
      const {name, url, password, local, builtin, compatible, connected} = ref
      return {id: ref.id, name, url, password, local, builtin, compatible, connected}
    }
    const shared = {password: undefined, local: true, compatible: true, connected: true}
    expect(fields(firstId)).toEqual({...shared, id: firstId, name: expect.any(String), url: first, builtin: true})
    expect(fields(secondId)).toEqual({...shared, id: secondId, name: expect.any(String), url: second, builtin: false})
    expect(servers.get(secondId)).toBe(servers.get(secondId))
    const remote = servers.get(secondId)?.client
    if (remote === undefined) throw new Error('the second engine has no ref')
    const listing = await remote.tabs.list(undefined, {signal: AbortSignal.timeout(3000)})
    expect(fields(secondId).name).toBe(basename(listing.project.root))
    const Missing = PluginRpc.define({
      id: 'missing',
      methods: {ping: {input: z.undefined(), output: z.string()}},
      events: {pinged: {schema: z.object({count: z.number()})}},
    })
    await expect(remote.rpc(Missing).ping(undefined, {signal: AbortSignal.timeout(3000)})).rejects.toMatchObject({
      type: 'rpc.unavailable',
    })
    expect(typeof remote).toBe('object')
    expect([Object.hasOwn(remote, 'tabs'), Object.hasOwn(remote, 'sessions'), Object.hasOwn(remote, 'rpc')]).toEqual([
      true,
      true,
      true,
    ])
    const stream = remote.event.subscribe()[Symbol.asyncIterator]()
    expect(await stream.next()).toEqual({
      done: false,
      value: {id: expect.stringMatching(/^evt_/), type: 'server.connected', data: {}},
    })
    const listening = new AbortController()
    const missingNext = remote
      .rpc(Missing)
      .events.subscribe('pinged', {signal: listening.signal})
      [Symbol.asyncIterator]()
      .next()
    listening.abort()
    expect(await missingNext).toEqual({done: true, value: undefined})
    const Pinger = PluginRpc.define({
      id: 'pinger',
      methods: {ping: {input: z.object({}), output: z.object({})}},
      events: {pinged: {schema: z.object({count: z.number()})}},
    })
    const pinged = remote.rpc(Pinger).events.subscribe('pinged')[Symbol.asyncIterator]()
    const firstPing = pinged.next()
    expect(await remote.rpc(Pinger).ping({})).toEqual({})
    expect(await firstPing).toEqual({
      done: false,
      value: {
        id: expect.stringMatching(/^evt_/),
        type: 'rpc.pinger.pinged',
        created: expect.any(Number),
        location: {directory: pinging},
        data: {count: 1},
      },
    })
    await pinged.return?.()
    await stream.return?.()
    const relay = () =>
      makeRpcClient(first).plugin.call(
        {rpcId: 'relay', method: 'relay', input: {id: secondId}},
        {signal: AbortSignal.timeout(5000)},
      )
    await vi.waitFor(
      async () =>
        expect(await relay()).toEqual({
          connected: 'server.connected',
          answer: {},
          event: {
            id: expect.stringMatching(/^evt_/),
            type: 'rpc.pinger.pinged',
            created: expect.any(Number),
            location: {directory: pinging},
            data: {count: 1},
          },
        }),
      {timeout: 25_000},
    )
    await engines.find((booted) => booted.base === second)?.stop()
    await listed([firstId], {event: 'the second engine stopped', at: performance.now()})
    expect(servers.get(secondId)).toBeUndefined()
    const oldId = 'engine-before-plugin-rpc'
    const old = createServer((request, response) => {
      if (request.url === '/health') {
        response.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({ok: true, id: oldId}))
        return
      }
      response.writeHead(404).end()
    })
    old.listen(0, '127.0.0.1')
    await once(old, 'listening')
    onTestFinished(() => {
      old.closeAllConnections()
      old.close()
    })
    const oldOrigin = `http://127.0.0.1:${z.object({port: z.number()}).parse(old.address()).port}`
    const oldRow = {id: oldId, pid: process.pid, root: tempDir('conciv-old-'), apiBase: `${oldOrigin}/t/before`}
    withHomeDb(home, (db) => registerEngine(db, oldRow))
    await listed([firstId, oldId], {event: 'the old engine registered', at: performance.now()})
    expect(fields(oldId).compatible).toBe(true)
    const oldClient = servers.get(oldId)?.client
    if (oldClient === undefined) throw new Error('the old engine has no ref')
    await expect(oldClient.tabs.list(undefined)).rejects.toSatisfy(
      (error) => error instanceof ORPCError && error.code === 'NOT_FOUND' && error.status === 404,
    )
    expect(fields(oldId).compatible).toBe(false)
    const restarted = `${oldOrigin}/t/after`
    withHomeDb(home, (db) => registerEngine(db, {...oldRow, apiBase: restarted}))
    await vi.waitFor(() => expect(fields(oldId).url).toBe(restarted), {timeout: 25_000})
    expect(fields(oldId).compatible).toBe(true)
  }, 90_000)

  it('cancelling a hub block while it waits for the allow leaves nothing to run after a later allow', async () => {
    const base = await boot()
    const heard: string[] = []
    const tab = await openTab(base, undefined, heard)
    const headers = {[CONCIV_SESSION_HEADER]: tab, ...HUB}
    const leaving = await connectMcpClient(`${base}/api/mcp`, headers)
    const execute = (await leaving.tools()).find((entry) => entry.name === 'execute_typescript')
    const cancelled = execute?.execute({typescriptCode: 'return await external_page_screenshot({})'})
    expect(await askRaised(base, tab)).toMatchObject(OUTSIDE_ASK)
    await leaving.close()
    await expect(cancelled).rejects.toThrow()
    await decideOutside(base, tab, true)
    expect(String(await executeOverMcp(base, headers, 'return await external_page_route({})'))).toContain(ROUTE.href)
    expect(heard.filter((name) => name === 'page_screenshot')).toEqual([])
  })

  it('a hub-origin rpc call naming a session passes its consent: after a deny it can neither read nor clear the journal, nor allow itself', async () => {
    const base = await boot()
    const sessionId = await newSession(base)
    const hubRpc = makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId, ...HUB}})
    const journal = (method: string) => ({rpcId: 'experimental.page', method, input: {sessionId}})
    const asked = hubRpc.chat.hydrate({sessionId}).then(String, String)
    await decideOutside(base, sessionId, false)
    expect(await asked).toContain(DENIED)
    const refusedRoute = "outside agents can't use plugin routes"
    expect(await hubRpc.plugin.call(journal('changes')).then(String, String)).toContain(refusedRoute)
    expect(await hubRpc.plugin.call(journal('clearChanges')).then(String, String)).toContain(refusedRoute)
    expect(await hubRpc.chat.allowOutside({sessionId}).then(String, String)).toContain("outside agents can't answer")
    expect(await hubRpc.chat.hydrate({sessionId}).then(String, String)).toContain(DENIED)
    const own = createSessionRpc(base, sessionId)
    expect(await own.chat.outsideAccess({sessionId})).toEqual({denied: true})
    expect(await own.plugin.call(journal('changes'))).toEqual([])
  })

  it('a hub-origin extension procedure naming a session passes its consent: after a deny the extension is never reached', async () => {
    const probeOs = os.$context<RpcContext>()
    const touched: string[] = []
    const router = probeOs.router({
      touch: probeOs.input(z.object({sessionId: SessionId})).handler(({input}) => {
        touched.push(input.sessionId)
        return {touched: true}
      }),
    })
    const probe = defineExtension({name: 'Consent Probe'}).server(() => ({context: {}, router}))
    const root = tempDir('conciv-consent-')
    const engine = await start({
      options: {stateRoot: root, hubAccess: 'session'},
      root,
      launchEditor: () => {},
      harness: createFakeHarness(),
      homeDir: connectedHome(),
      extensions: [probe],
    })
    const base = track(engine)
    const sessionId = await newSession(base)
    const createExtensionClient = (headers: Record<string, string>): RouterClient<typeof router> =>
      createORPCClient(new RPCLink({url: `${base}/rpc/ext/consent-probe`, fetch: abortableFetch, headers}))
    const asked = createExtensionClient(HUB).touch({sessionId}).then(String, String)
    await decideOutside(base, sessionId, false)
    expect(await asked).toContain(DENIED)
    expect(touched).toEqual([])
    expect(await createExtensionClient({}).touch({sessionId})).toEqual({touched: true})
    expect(touched).toEqual([sessionId])
  })

  it('a terminal caller needs no connection and still gets the Allow card', async () => {
    const base = await boot()
    const sessionId = await newSession(base)
    const terminal = {
      [CONCIV_SESSION_HEADER]: sessionId,
      [CONCIV_ORIGIN_HEADER]: 'hub',
      [CONCIV_CLIENT_HEADER]: 'terminal',
    }
    const asked = executeOverMcp(base, terminal, 'return 1').then(String, String)
    await vi.waitFor(async () => expect(await loadPending(base, sessionId)).toHaveLength(1), {timeout: 3000})
    const [ask] = await loadPending(base, sessionId)
    expect(ask).toMatchObject({toolName: 'Allow terminal to use this tab', input: {client: 'terminal'}})
    await createSessionRpc(base, sessionId).chat.permissionDecision({
      approvalId: ask?.approvalId ?? '',
      approved: false,
    })
    expect(await asked).toContain('denied')
  })

  it('disconnecting an agent refuses it at once and clears the outside Allow, so after reconnecting the tab asks again', async () => {
    const bin = tempDir('conciv-fake-codex-')
    writeFileSync(join(bin, 'codex'), '#!/bin/sh\nexit 0\n', {mode: 0o755})
    const savedPath = process.env.PATH
    process.env.PATH = bin
    try {
      const base = await boot()
      const sessionId = await newSession(base)
      const allowed = hubCall(base, sessionId)
      await decideOutside(base, sessionId, true)
      expect(await allowed).toMatch(RAN)
      expect(await hubCall(base, sessionId)).toMatch(RAN)
      expect(await makeRpcClient(base).meta.disconnectHub({harness: 'codex'})).toEqual({ok: true})
      expect(await hubCall(base, sessionId)).toContain('Codex is disconnected from conciv')
      expect(await makeRpcClient(base).meta.connectHub({harness: 'codex'})).toEqual({ok: true})
      const asked = hubCall(base, sessionId)
      await decideOutside(base, sessionId, false)
      expect(await asked).toContain(DENIED)
    } finally {
      process.env.PATH = savedPath
    }
  })

  it('an Allow clicked after the agent disconnected still refuses the call that waited for it, at both doors', async () => {
    const home = connectedHome()
    const base = await boot('session', home)
    const forget = () => withHomeDb(home, (db) => removeHubConnection(db, 'codex'))
    const sessionId = await newSession(base)
    const overMcp = hubCall(base, sessionId)
    await vi.waitFor(async () => expect(await loadPending(base, sessionId)).toHaveLength(1), {timeout: 3000})
    forget()
    await decideOutside(base, sessionId, true)
    expect(await overMcp).toContain('Codex is disconnected from conciv')
    connectedHome(home)
    const tab = await openTab(base)
    const overRpc = makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: tab, ...HUB}})
      .registry.call({name: 'page_route', input: {}})
      .then(String, String)
    await vi.waitFor(async () => expect(await loadPending(base, tab)).toHaveLength(1), {timeout: 3000})
    forget()
    await decideOutside(base, tab, true)
    expect(await overRpc).toContain('Codex is disconnected from conciv')
  })

  it.skipIf(process.getuid?.() === 0)(
    'an Allow clicked while the home db is unreadable never admits a later call, even across a disconnect',
    async () => {
      const home = connectedHome()
      const base = await boot('session', home)
      const sessionId = await newSession(base)
      const waiting = hubCall(base, sessionId)
      await vi.waitFor(async () => expect(await loadPending(base, sessionId)).toHaveLength(1), {timeout: 3000})
      chmodSync(join(home, 'home.db'), 0o000)
      try {
        await decideOutside(base, sessionId, true)
        expect(await waiting).toContain('waiting for the user to allow it in the conciv tab')
      } finally {
        chmodSync(join(home, 'home.db'), 0o600)
      }
      withHomeDb(home, (db) => removeHubConnection(db, 'codex'))
      connectedHome(home)
      const asked = hubCall(base, sessionId)
      await decideOutside(base, sessionId, false)
      expect(await asked).toContain(DENIED)
    },
  )

  it('a disconnect from anything sharing the home, the terminal included, voids the outside Allow every engine holds', async () => {
    const savedPath = process.env.PATH
    process.env.PATH = tempDir('conciv-no-agents-')
    try {
      const home = connectedHome()
      const base = await boot('session', home)
      const sessionId = await newSession(base)
      const allowed = hubCall(base, sessionId)
      await decideOutside(base, sessionId, true)
      expect(await allowed).toMatch(RAN)
      expect(await createHubConnections(home).disconnect('codex')).toMatchObject({ok: true})
      connectedHome(home)
      const asked = hubCall(base, sessionId)
      await decideOutside(base, sessionId, false)
      expect(await asked).toContain(DENIED)
    } finally {
      process.env.PATH = savedPath
    }
  })

  it('an allowed outside agent still cannot answer permission requests or call plugin RPC methods: its decision, allow and plugin call are refused and the card stays', async () => {
    const base = await boot()
    const sessionId = await newSession(base)
    const allowed = hubCall(base, sessionId)
    await decideOutside(base, sessionId, true)
    expect(await allowed).toMatch(RAN)
    const own = createSessionRpc(base, sessionId)
    const waiting = own.registry.call({name: 'page_eval', input: {code: '1'}}).then(String, String)
    const raised = await askRaised(base, sessionId)
    const [card] = await loadPending(base, sessionId)
    expect(card?.approvalId).toBe(raised?.approvalId)
    const hubRpc = makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId, ...HUB}})
    const decision = {approvalId: card?.approvalId ?? '', approved: true}
    const refusal = "outside agents can't answer permission requests; decide it in the tab"
    expect(await hubRpc.chat.permissionDecision(decision).then(String, String)).toContain(refusal)
    expect(await hubRpc.chat.allowOutside({sessionId}).then(String, String)).toContain(refusal)
    await expect(hubRpc.plugin.call({rpcId: 'embedded', method: 'ping', input: {}})).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: "outside agents can't use plugin routes; use the plugin in the tab",
    })
    expect(await loadPending(base, sessionId)).toEqual([card])
    await own.chat.permissionDecision({approvalId: card?.approvalId ?? '', approved: false})
    await waiting
  })

  it('a page that never answers is listed by its engine with the href its tab reported', async () => {
    const owner = await boot('open')
    const silent = await openTab(owner, () => {})
    const listing = await makeRpcClient(owner).tabs.list(undefined)
    expect(listing.tabs).toEqual([
      expect.objectContaining({sessionId: silent, page: expect.objectContaining({href: ROUTE.href})}),
    ])
  })

  it('a hub-origin rpc tool call waits for the allow and runs marked, a caller that leaves stops waiting, a plain rpc call never asks, project policy allows every session', async () => {
    const base = await boot('project')
    const sessionId = await openTab(base)
    const route = {name: 'page_route', input: {}}
    const hubRpc = makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId, ...HUB}})
    expect(await createSessionRpc(base, sessionId).registry.call(route)).toMatchObject({href: ROUTE.href})
    expect(await loadPending(base, sessionId)).toEqual([])
    const leaving = new AbortController()
    const left = hubRpc.registry.call(route, {signal: leaving.signal})
    expect(await askRaised(base, sessionId)).toMatchObject(OUTSIDE_ASK)
    leaving.abort()
    await expect(left).rejects.toThrow()
    expect(await loadPending(base, sessionId)).toHaveLength(1)
    const starts = await toolStarts(base, sessionId)
    const waiting = hubRpc.registry.call(route)
    await decideOutside(base, sessionId, true)
    expect(await waiting).toMatchObject({href: ROUTE.href})
    const namedHubRpc = makeRpcClient(base, {
      headers: {[CONCIV_SESSION_HEADER]: sessionId, ...HUB, [CONCIV_NAMED_TAB_HEADER]: '1'},
    })
    await expect(namedHubRpc.registry.call({name: 'page_eval', input: {code: '1'}})).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: `Tool "page_eval" needs the user's approval. The request is shown to the user; retry once they approve it.`,
    })
    expect(await starts()).toEqual([
      expect.objectContaining({
        toolCallName: 'page_route',
        metadata: {conciv: {origin: 'hub', client: 'codex', run: expect.any(String)}},
      }),
    ])
    const saved = (await createSessionRpc(base, sessionId).chat.hydrate({sessionId})).messages.flatMap((message) =>
      message.parts.flatMap((part) => (part.type === 'tool-call' ? [part.name] : [])),
    )
    expect(saved).toEqual(['page_route'])
    expect(await hubCall(base, await newSession(base))).toMatch(RAN)
  })

  it('project policy: a deny or allow in one session releases the calls waiting in every session and clears their cards', async () => {
    const base = await boot('project')
    const [first, second] = [await newSession(base), await newSession(base)]
    const raise = async () => {
      const waiting = [hubCall(base, first), hubCall(base, second)]
      expect(await askRaised(base, second)).toMatchObject(OUTSIDE_ASK)
      return waiting
    }
    const refused = await raise()
    await decideOutside(base, first, false)
    expect(await Promise.all(refused)).toEqual([expect.stringContaining(DENIED), expect.stringContaining(DENIED)])
    expect(await loadPending(base, second)).toEqual([])
    await createSessionRpc(base, first).chat.allowOutside({sessionId: first})
    const allowed = await raise()
    await decideOutside(base, second, true)
    expect(await Promise.all(allowed)).toEqual([expect.stringMatching(RAN), expect.stringMatching(RAN)])
    expect(await loadPending(base, first)).toEqual([])
  })

  it('an outside page_eval is asked whether or not it names its tab, like a plain rpc call, and the asks share the one card', async () => {
    const base = await boot('open')
    const sessionId = await openTab(base)
    const evaluate = {name: 'page_eval', input: {code: '1'}}
    const overRpc = (headers: Record<string, string>) =>
      makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId, ...headers}})
        .registry.call(evaluate)
        .then(JSON.stringify, String)
    expect(await overRpc({...HUB, [CONCIV_NAMED_TAB_HEADER]: '1'})).toMatch(/needs the user/)
    expect((await loadPending(base, sessionId)).map((ask) => ask.toolName)).toEqual([evaluate.name])
    expect(await overRpc(HUB)).toMatch(/needs the user/)
    expect((await loadPending(base, sessionId)).map((ask) => ask.toolName)).toEqual([evaluate.name])
    expect(await overRpc({})).toMatch(/needs the user/)
    expect((await loadPending(base, sessionId)).map((ask) => ask.toolName)).toEqual([evaluate.name])
  })

  it('an outside agent over MCP calling page_eval in code mode is asked: it runs only once approved, and a denial refuses it', async () => {
    const base = await boot('open')
    const heard: string[] = []
    const sessionId = await openTab(base, undefined, heard)
    const headers = {[CONCIV_SESSION_HEADER]: sessionId, ...HUB}
    const evaluate = 'return await external_page_eval({code: "1"})'
    const decideCard = async (approved: boolean) => {
      expect(await askRaised(base, sessionId)).not.toBeNull()
      expect(heard).not.toContain('page_eval')
      const pending = await loadPending(base, sessionId)
      expect(pending).toHaveLength(1)
      const [card] = pending
      await createSessionRpc(base, sessionId).chat.permissionDecision({approvalId: card?.approvalId ?? '', approved})
    }
    const allowed = executeOverMcp(base, headers, evaluate).then(String, String)
    await decideCard(true)
    expect(await allowed).toContain(EVALUATED.result)
    expect(heard).toContain('page_eval')
    heard.length = 0
    const refused = executeOverMcp(base, headers, evaluate).then(String, String)
    await decideCard(false)
    expect(await refused).not.toContain(EVALUATED.result)
    expect(heard).not.toContain('page_eval')
    expect(await loadPending(base, sessionId)).toEqual([])
  })

  it('open policy never asks, and hub calls are marked in the transcript', async () => {
    const base = await boot('open')
    const sessionId = await newSession(base)
    const starts = await toolStarts(base, sessionId)
    expect(await hubCall(base, sessionId)).toMatch(RAN)
    expect(await starts()).toMatchObject([{metadata: {conciv: {origin: 'hub', client: 'codex'}}}])
    expect(await loadPending(base, sessionId)).toEqual([])
    const together = await Promise.all(Array.from({length: 12}, () => hubCall(base, sessionId)))
    expect(together).toEqual(Array.from({length: 12}, () => expect.stringMatching(RAN)))
    const saved = (await createSessionRpc(base, sessionId).chat.hydrate({sessionId})).messages.flatMap((message) =>
      message.parts.filter((part) => part.type === 'tool-call'),
    )
    expect(saved).toHaveLength(13)
  })
})

function claudeId(name: string): string {
  const hex = createHash('sha256').update(name).digest('hex')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-')
}

function codexHome(): string {
  const home = process.env.CODEX_HOME
  if (home === undefined) throw new Error('the core test process sets CODEX_HOME')
  return home
}

describe('session activity recorded with its chat messages', () => {
  const ROW_AT = Date.parse('2026-08-17T00:00:00.000Z')
  const WRITTEN_AT = Date.parse('2026-11-10T09:39:00.000Z')
  const IMPORTED_NATIVE = HarnessSessionId.parse(randomUUID())
  const importedFixture: FixtureSession = {
    id: IMPORTED_NATIVE,
    derivedTitle: 'a transcript written earlier',
    updatedAt: WRITTEN_AT,
    sizeBytes: 1024,
    messages: [
      {
        id: 'imported-user',
        role: 'user',
        parts: [{type: 'text', content: 'a transcript written earlier'}],
        createdAt: new Date('2026-10-30T08:00:00.000Z'),
      },
      {
        id: 'imported-reply',
        role: 'assistant',
        parts: [{type: 'text', content: 'done'}],
        createdAt: new Date(WRITTEN_AT),
      },
    ],
  }
  const saved = process.env.CONCIV_HOME
  const held: {made: MadeApp | undefined} = {made: undefined}
  beforeAll(() => {
    process.env.CONCIV_HOME = tempDir('conciv-activity-home-')
  })
  afterAll(() => {
    if (saved === undefined) delete process.env.CONCIV_HOME
    else process.env.CONCIV_HOME = saved
  })
  const kit = sharedKit(() =>
    createTestkit(createFakeHarness({id: 'fake-activity', history: [importedFixture]}), async (env) => {
      const booted = await bootMadeApp(env, {home: tempDir('conciv-activity-home-')})
      held.made = booted
      return {fetch: booted.fetch, dispose: booted.dispose, agentToken: booted.agentToken}
    }).setup(),
  )

  function made(): MadeApp {
    if (held.made === undefined) throw new Error('the activity app did not boot')
    return held.made
  }

  async function staleSession(): Promise<SessionId> {
    const sessionId = SessionId.parse((await kit().rpc.sessions.create()).sessionId)
    await Effect.runPromise(made().chat.db.update(sessions).set({updatedAt: ROW_AT}).where(eq(sessions.id, sessionId)))
    return sessionId
  }

  it('a hub tool call recorded through the call trace alone bumps lastActive', async () => {
    const sessionId = await staleSession()
    const hub: Record<string, string> = {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: 'codex'}
    const trace = callTrace((name) => hub[name] ?? null)
    const run = {threadId: sessionId, live: false}
    const before = Date.now()
    const mirror = trace.mirror(run, {
      publish: () => {},
      record: (chunks) => made().plane.record(sessionId, chunks),
      driving: () => made().plane.driving(sessionId),
    })
    mirror.publish([...trace.start(run, 'page_route', {}), ...trace.result(run, '{}', false)])
    await mirror.settle()
    const meta = await kit().rpc.sessions.get({sessionId})
    expect(meta.title).toBe('New session')
    expect(meta.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('a chat message bumps lastActive and its first user message titles the session', async () => {
    const sessionId = await staleSession()
    const before = Date.now()
    await runTurn(kit(), '  fill the form in the form page ', sessionId)
    await runTurn(kit(), 'and submit it', sessionId)
    const meta = await kit().rpc.sessions.get({sessionId})
    expect(meta.title).toBe('fill the form in the form page')
    expect(meta.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('a chat message never overwrites a title the session already has, nor titles a native-backed session', async () => {
    const sessionId = await staleSession()
    await kit().rpc.sessions.rename({sessionId, title: 'kept'})
    await runTurn(kit(), 'a different first message', sessionId)
    expect((await kit().rpc.sessions.get({sessionId})).title).toBe('kept')
    const native = await staleSession()
    const nativeId = HarnessSessionId.parse(randomUUID())
    await Effect.runPromise(
      made().chat.db.update(sessions).set({harnessSessionId: nativeId}).where(eq(sessions.id, native)),
    )
    const before = Date.now()
    await runTurn(kit(), 'a message to a native session', native)
    const row = await Effect.runPromise(made().chat.db.select().from(sessions).where(eq(sessions.id, native)).get())
    expect(row?.title).toBeNull()
    expect(row?.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('importing a transcript stamps lastActive with its newest message time, not the time it was opened', async () => {
    const sessionId = await staleSession()
    await Effect.runPromise(
      made().chat.db.update(sessions).set({harnessSessionId: IMPORTED_NATIVE}).where(eq(sessions.id, sessionId)),
    )
    await kit().hydrate(sessionId)
    const reopened = await kit().hydrate(sessionId)
    const row = await Effect.runPromise(made().chat.db.select().from(sessions).where(eq(sessions.id, sessionId)).get())
    expect(reopened.messages.map((message) => message.id)).toEqual(['imported-user', 'imported-reply'])
    expect(row).toMatchObject({title: null, updatedAt: WRITTEN_AT})
  })

  it('a session with no messages keeps its row time and the New session title', async () => {
    const sessionId = await staleSession()
    expect(await kit().rpc.sessions.get({sessionId})).toMatchObject({title: 'New session', updatedAt: ROW_AT})
  })

  it('the fix-up migration repairs a stale row from its newest message and first user message, and leaves a native-backed row untitled', async () => {
    const stateRoot = tempDir('conciv-activity-fixup-')
    const stateDir = join(stateRoot, '.conciv')
    mkdirSync(stateDir, {recursive: true})
    const client = new DatabaseSync(join(stateDir, 'conciv.db'))
    const fixup = migrations.findIndex((migration) => migration.name.endsWith('_session_activity_fixup'))
    migrateSync(migrations.slice(0, fixup), drizzle({client})._.session)
    const insertSession = client.prepare(
      "INSERT INTO sessions (id, harness_session_id, harness_kind, origin, title, cwd, created_at, updated_at) VALUES (?, ?, 'claude', 'chat', ?, ?, ?, ?)",
    )
    const staleRows = [
      {id: 'conciv_stale', harnessSessionId: null, title: null},
      {id: 'conciv_titled', harnessSessionId: null, title: 'kept'},
      {id: 'conciv_quiet', harnessSessionId: null, title: null},
      {id: 'conciv_native', harnessSessionId: randomUUID(), title: null},
    ]
    for (const {id, harnessSessionId, title} of staleRows) {
      insertSession.run(id, harnessSessionId, title, stateRoot, ROW_AT, ROW_AT)
    }
    const thread = (threadId: string) => [
      {role: 'user', content: [{type: 'text', content: '  fill the form '}], createdAt: '2026-10-30T08:00:00.000Z'},
      {role: 'assistant', content: 'done', createdAt: '2026-11-10T09:39:00.000Z'},
      {role: 'tool', content: '{}', toolCallId: `t-${threadId}`},
    ]
    const insert = client.prepare(
      'INSERT INTO chat_messages (thread_id, position, role, message_json) VALUES (?, ?, ?, ?)',
    )
    for (const threadId of ['conciv_stale', 'conciv_titled', 'conciv_native']) {
      thread(threadId).forEach((message, position) =>
        insert.run(threadId, position, message.role, JSON.stringify(message)),
      )
    }
    client.close()
    const repaired = await Effect.runPromise(
      Effect.scoped(
        Effect.flatMap(openDb(stateRoot), (db) =>
          db
            .select({id: sessions.id, title: sessions.title, updatedAt: sessions.updatedAt})
            .from(sessions)
            .orderBy(asc(sessions.id)),
        ),
      ),
    )
    expect(repaired).toEqual([
      {id: 'conciv_native', title: null, updatedAt: Date.parse('2026-11-10T09:39:00.000Z')},
      {id: 'conciv_quiet', title: null, updatedAt: ROW_AT},
      {id: 'conciv_stale', title: 'fill the form', updatedAt: Date.parse('2026-11-10T09:39:00.000Z')},
      {id: 'conciv_titled', title: 'kept', updatedAt: Date.parse('2026-11-10T09:39:00.000Z')},
    ])
  })
})

describe('page action queue delivery', () => {
  const HUB = {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: 'codex'}
  const ACTIONS = [
    {tool: 'page_fill', selector: '#first', value: 'Ada'},
    {tool: 'page_check', selector: '#agree'},
  ]
  const QueueHandleSchema = z.object({result: z.object({queueId: z.string(), actions: z.number()})})
  const WINDOW_LONGER_THAN_THE_CASE_MS = 60_000
  const pages = new AbortController()
  const stops: Array<() => Promise<void>> = []
  afterAll(async () => {
    pages.abort()
    await Promise.all(stops.map((stop) => stop()))
  })

  type QueuedOnTab = {id: string; of: number}
  type ServedEngine = {origin: string; token: string}
  type ServeEngine = (
    home: string,
    harness: ReturnType<typeof createFakeHarness>,
    plugins: readonly Plugin.Plugin[],
    root: string,
    permissions: Pick<ConcivConfig, 'permission' | 'permissions'>,
  ) => Promise<ServedEngine>

  const servedByStart: ServeEngine = async (home, harness, plugins, root, permissions) => {
    const engine = await bootAt(home, root, 'open', harness, plugins, permissions)
    stops.push(engine.stop)
    return {origin: `http://127.0.0.1:${engine.port}`, token: engine.agentToken}
  }

  const servedWithWindowsLongerThanTheCase: ServeEngine = async (home, harness, plugins, root) => {
    const boot = bootCoreApp({
      home,
      cwd: root,
      plugins,
      hubAccess: 'open',
      pageReplyTimeoutMs: WINDOW_LONGER_THAN_THE_CASE_MS,
      queuedActionTimeoutMs: WINDOW_LONGER_THAN_THE_CASE_MS,
    })
    const kit = await createTestkit(harness, boot).setup()
    stops.push(kit.cleanup)
    return {origin: kit.origin, token: kit.token}
  }

  async function engineWithTab(
    harness = createFakeHarness(),
    plugins: readonly Plugin.Plugin[] = [],
    root = tempDir('conciv-queue-'),
    holdsUnder: (command: Page.Command) => string | undefined = () => undefined,
    permissions: Pick<ConcivConfig, 'permission' | 'permissions'> = {},
    serve: ServeEngine = servedByStart,
  ) {
    const home = tempDir('conciv-queue-home-')
    withHomeDb(home, (db) => recordHubConnection(db, 'codex', Date.now()))
    const tabs = pageTabs()
    const {origin, token} = await serve(home, harness, [tabs.plugin, ...plugins], root, permissions)
    const base = `${origin}/t/${token}`
    const sessionId = (await makeRpcClient(base).sessions.create(undefined)).sessionId
    const browser = makeBrowserRpcClient(origin, {session: () => sessionId})
    expect(await browserRpcConnection(origin).trust.requestTrustWithToken(token)).toBe(true)
    onTestFinished(() => browser.close())
    const tab = browser.rpc
    const accepted: QueuedOnTab[] = []
    const held = new Map<string, string>()
    const arrivals = new EventTarget()
    const arrived: string[] = []
    const answerFor = (command: Page.Command, requestId: string): PageReply | undefined => {
      arrived.push(command.queued === undefined ? command.action.type : `queued ${command.queued.index}`)
      const holdKey = holdsUnder(command)
      if (holdKey !== undefined) {
        held.set(holdKey, requestId)
        arrivals.dispatchEvent(new Event('held'))
        return undefined
      }
      if (command.queued === undefined) return pageSuccess({})
      const {id, index, of} = command.queued
      if (index >= 0) {
        held.set(`${id}/${index}`, requestId)
        arrivals.dispatchEvent(new Event('held'))
        return undefined
      }
      accepted.push({id, of})
      arrivals.dispatchEvent(new Event('queue'))
      return pageSuccess({queueId: id, actions: of})
    }
    const onTab = await tabs.open(sessionId, answerFor)
    pages.signal.addEventListener('abort', () => onTab.end(), {once: true})
    const nextQueue = async (): Promise<QueuedOnTab> => {
      const known = accepted.shift()
      if (known !== undefined) return known
      await once(arrivals, 'queue')
      return nextQueue()
    }
    const heldRequest = async (key: string): Promise<string> => {
      const requestId = held.get(key)
      if (requestId !== undefined) return requestId
      await once(arrivals, 'held')
      return heldRequest(key)
    }
    const play = async (queued: QueuedOnTab, index: number, outcome: PageReply) =>
      onTab.reply(await heldRequest(`${queued.id}/${index}`), outcome)
    const events = await tab.chat.events({sessionId}, {signal: pages.signal})
    const seen: ChatEvent[] = []
    const watch = async (): Promise<void> => {
      for await (const chunk of events) {
        seen.push(chunk)
        arrivals.dispatchEvent(new Event('chunk'))
      }
    }
    const watching = watch().catch((error: unknown) => {
      if (!pages.signal.aborted) throw error
    })
    const queueEvents = () => seen.flatMap((chunk) => pageQueueEvent.parse(chunk) ?? [])
    const cards = (queueId: string) =>
      seen.filter(
        (chunk) => chunk.type === ChatEventType.TOOL_CALL_START && chunk.toolCallId === `page-queue-${queueId}`,
      )
    const seenChunk = async (matches: (chunk: ChatEvent) => boolean): Promise<void> => {
      if (seen.some(matches)) return
      await once(arrivals, 'chunk')
      return seenChunk(matches)
    }
    const finishedEvent = (queueId: string) => seenChunk((chunk) => pageQueueEvent.parse(chunk)?.queueId === queueId)
    const runIds = () => seen.flatMap((chunk) => sessionRunEvent.parse(chunk)?.runId ?? [])
    const followUpFinished = async (earlier: readonly string[] = []): Promise<void> => {
      await seenChunk(() => runIds().some((runId) => !earlier.includes(runId)))
      const runId = runIds().find((known) => !earlier.includes(known)) ?? ''
      const joined = webSocket(`${base.replace('http', 'ws')}${CHAT_WS_PATH}`)
      for await (const chunk of joined.joinRun(runId, pages.signal)) {
        if (chunk.type === ChatEventType.RUN_ERROR) return
        if (chunk.type === ChatEventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls') return
      }
    }
    expect(TabOpenSchema.parse(await makeRpcClient(base).tabs.get({sessionId})).open).toBe(true)
    const hub = (code: string) => executeOverMcp(base, {...HUB, [CONCIV_SESSION_HEADER]: sessionId}, code)
    const close = async () => onTab.end()
    const inChat = (runId: string, typescriptCode: string) => {
      harness.script.scriptToolCall('execute_typescript', {typescriptCode})
      return sseTurn(base, sessionId, runId, 'fill the form', pages.signal)
    }
    void watching
    const discover = async (toolNames: string[]): Promise<unknown> => {
      const mcp = await connectMcpClient(`${base}/api/mcp`, {...HUB, [CONCIV_SESSION_HEADER]: sessionId})
      try {
        const tool = (await mcp.tools()).find((entry) => entry.name === 'discover_tools')
        if (!tool?.execute) throw new Error('discover_tools not on /api/mcp')
        return await tool.execute({toolNames})
      } finally {
        await mcp.close()
      }
    }
    return {
      base,
      origin,
      token,
      sessionId,
      tab,
      onTab,
      nextQueue,
      heldRequest,
      play,
      hub,
      discover,
      close,
      queueEvents,
      published: () => [...seen],
      cards,
      finishedEvent,
      followUpFinished,
      runIds,
      seenChunk,
      inChat,
      arrived,
    }
  }

  const queued = (actions: unknown[] = ACTIONS) =>
    `return await external_page_queue_async({actions: ${JSON.stringify(actions)}})`

  const played = `return await external_page_queue({actions: ${JSON.stringify(ACTIONS)}})`

  function parseHandle(reply: unknown): {queueId: string; actions: number} {
    return QueueHandleSchema.parse(JSON.parse(String(reply))).result
  }

  it('code.execute and /api/mcp execute_typescript run one shared path and give the same result for the same script', async () => {
    const page = await engineWithTab()
    const typed = makeRpcClient(page.base, {headers: HUB})
    const script = 'console.log("seen"); return {sum: 1 + 1}'
    const overMcp = JSON.parse(String(await page.hub(script)))
    expect(await typed.code.execute({sessionId: page.sessionId, typescriptCode: script})).toEqual({
      ok: true,
      result: overMcp.result,
      logs: overMcp.logs,
      queued: [],
      finished: [],
    })
    const failing = "throw new Error('deliberate failure')"
    const failedOverMcp = await executeOverMcp(
      page.base,
      {...HUB, [CONCIV_SESSION_HEADER]: page.sessionId},
      failing,
    ).then(String, (error: unknown) => String(error))
    const failed = await typed.code.execute({sessionId: page.sessionId, typescriptCode: failing})
    expect(failed).toMatchObject({ok: false, error: {message: expect.stringContaining('deliberate failure')}})
    expect(failedOverMcp).toContain('deliberate failure')
  })

  it('code.execute lists in queued the queues the script started, taken from the queue store and never from what it returns', async () => {
    const page = await engineWithTab()
    const typed = makeRpcClient(page.base, {headers: HUB})
    const started = await typed.code.execute({
      sessionId: page.sessionId,
      typescriptCode: `await external_page_queue_async({actions: ${JSON.stringify(ACTIONS)}}); return 'started, handle dropped'`,
    })
    const onTab = await page.nextQueue()
    expect(started).toMatchObject({
      ok: true,
      result: 'started, handle dropped',
      queued: [{queueId: onTab.id, actions: 2}],
    })
    const lookalike = await typed.code.execute({
      sessionId: page.sessionId,
      typescriptCode: "return {queueId: 'q_x', actions: 1}",
    })
    expect(lookalike).toMatchObject({ok: true, result: {queueId: 'q_x', actions: 1}, queued: []})
    await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.play(onTab, 1, pageSuccess({ok: true, checked: true}))
    await page.finishedEvent(onTab.id)
    expect(await typed.page.queue.wait({sessionId: page.sessionId, queueId: onTab.id, waitMs: 0})).toMatchObject({
      queueId: onTab.id,
      status: 'finished',
      played: 2,
    })
  })

  it('deleting a session while its queue plays cancels the action in flight on the tab', async () => {
    const page = await engineWithTab()
    const typed = makeRpcClient(page.base, {headers: HUB})
    await typed.code.execute({sessionId: page.sessionId, typescriptCode: queued()})
    const onTab = await page.nextQueue()
    expect(onTab).toEqual({id: expect.stringMatching(/^q_/), of: 2})
    const requestId = await page.heldRequest(`${onTab.id}/0`)
    await makeRpcClient(page.base).sessions.delete({sessionId: page.sessionId})
    const publishedBeforeDeleted = page.published().length
    await page.onTab.cancelled(requestId)
    await expect(
      typed.page.queue.wait({sessionId: page.sessionId, queueId: onTab.id, waitMs: 0}),
    ).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: `session "${page.sessionId}" does not exist`,
    })
    await expect(
      makeRpcClient(page.base).page.queue.wait({sessionId: page.sessionId, queueId: onTab.id, waitMs: 0}),
    ).rejects.toMatchObject({
      code: 'NO_QUEUE',
    })
    await expect(page.onTab.reply(requestId, pageSuccess({ok: true, checked: true}))).rejects.toMatchObject({
      type: 'unavailable',
      message: 'Page is unavailable.',
    })
    expect(page.published().slice(publishedBeforeDeleted)).toEqual([])
    const after = await makeRpcClient(page.base).chat.hydrate({sessionId: page.sessionId})
    expect([after.messages, after.lastRun]).toEqual([[], null])
  })

  it('external_page_queue_async answers with a queue id before the tab has played anything', async () => {
    const page = await engineWithTab()
    const handle = parseHandle(await page.hub(queued()))
    expect(handle).toEqual({queueId: expect.stringMatching(/^q_/), actions: 2})
    expect((await page.nextQueue()).id).toBe(handle.queueId)
  })

  it('a queue the page refuses to accept runs none of its actions, and each says it did not run', async () => {
    const page = await engineWithTab(createFakeHarness(), [], tempDir('conciv-queue-'), (command) =>
      command.queued?.index === -1 ? 'acceptance' : undefined,
    )
    const typed = makeRpcClient(page.base, {headers: HUB})
    const {queueId} = parseHandle(await page.hub(queued()))
    await page.onTab.reply(await page.heldRequest('acceptance'), {
      type: 'failure',
      code: 'handler-error',
      message: 'the tab is busy',
    })
    const refusal = expect.stringContaining('the page refused the queue, so this action did not run: ')
    expect(await typed.page.queue.wait({sessionId: page.sessionId, queueId, waitMs: 5000})).toMatchObject({
      queueId,
      status: 'lost',
      played: 0,
      failed: 0,
      outcomes: [
        {index: 0, ok: false, error: refusal},
        {index: 1, ok: false, error: refusal},
      ],
    })
    expect(page.arrived).toEqual(['queued -1'])
  })

  it('a page.queue.wait its caller aborts stops waiting, so the result it never handed over leads the next reply', async () => {
    const page = await engineWithTab(
      createFakeHarness(),
      [],
      tempDir('conciv-queue-'),
      () => undefined,
      {},
      servedWithWindowsLongerThanTheCase,
    )
    const {queueId} = parseHandle(await page.hub(queued()))
    const onTab = await page.nextQueue()
    const caller = new AbortController()
    const typed = makeRpcClient(page.base, {headers: HUB})
    const waiting = typed.page.queue.wait({sessionId: page.sessionId, queueId, waitMs: 60_000}, {signal: caller.signal})
    expect(await typed.tabs.get({sessionId: page.sessionId})).toMatchObject({open: true})
    caller.abort()
    await expect(waiting).rejects.toMatchObject({name: 'AbortError'})
    expect(await typed.tabs.get({sessionId: page.sessionId})).toMatchObject({open: true})
    await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.play(onTab, 1, pageSuccess({ok: true, checked: true}))
    await page.finishedEvent(queueId)
    expect(JSON.stringify(await page.hub('return 1'))).toContain(`queue ${queueId} finished: 2 played, 0 failed`)
  })

  it('a page.queue.wait its caller aborts before any play starts keeps the result owed, so it leads the next reply once, with one finished event and one card, while a result a live waiter took gets none', async () => {
    const page = await engineWithTab(
      createFakeHarness(),
      [],
      tempDir('conciv-queue-'),
      () => undefined,
      {},
      servedWithWindowsLongerThanTheCase,
    )
    const typed = makeRpcClient(page.base, {headers: HUB})
    const taken = parseHandle(await page.hub(queued())).queueId
    const takenOnTab = await page.nextQueue()
    const taking = typed.page.queue.wait({sessionId: page.sessionId, queueId: taken, waitMs: 60_000})
    expect(await typed.tabs.get({sessionId: page.sessionId})).toMatchObject({open: true})
    await page.play(takenOnTab, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.play(takenOnTab, 1, pageSuccess({ok: true, checked: true}))
    expect(await taking).toMatchObject({queueId: taken, status: 'finished', played: 2})
    const {queueId} = parseHandle(await page.hub(queued()))
    const onTab = await page.nextQueue()
    const caller = new AbortController()
    const waiting = typed.page.queue.wait({sessionId: page.sessionId, queueId, waitMs: 60_000}, {signal: caller.signal})
    expect(await typed.tabs.get({sessionId: page.sessionId})).toMatchObject({open: true})
    caller.abort()
    await expect(waiting).rejects.toMatchObject({name: 'AbortError'})
    expect(await typed.tabs.get({sessionId: page.sessionId})).toMatchObject({open: true})
    await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.play(onTab, 1, pageSuccess({ok: true, checked: true}))
    await page.finishedEvent(queueId)
    const notice = `queue ${queueId} finished: 2 played, 0 failed`
    expect(JSON.stringify(await page.hub('return 1'))).toContain(notice)
    expect(JSON.stringify(await page.hub('return 2'))).not.toContain(notice)
    expect(page.queueEvents().filter((event) => event.queueId === queueId)).toHaveLength(1)
    expect(page.cards(queueId)).toHaveLength(1)
    expect(page.queueEvents().filter((event) => event.queueId === taken)).toHaveLength(0)
    expect(page.cards(taken)).toHaveLength(0)
  })

  it('a page.queue.wait over the websocket its caller aborts before the queue finishes keeps the result owed, so it leads the next reply once', async () => {
    const page = await engineWithTab(
      createFakeHarness(),
      [],
      tempDir('conciv-queue-'),
      () => undefined,
      {},
      servedWithWindowsLongerThanTheCase,
    )
    const {queueId} = parseHandle(await page.hub(queued()))
    const onTab = await page.nextQueue()
    const socket = new WebSocket(`${page.origin.replace('http', 'ws')}${RPC_WS_PATH}`, {
      headers: {authorization: `Bearer ${page.token}`},
    })
    await once(socket, 'open')
    const overSocket = createORPCClient<ReturnType<typeof makeRpcClient>>(
      new WebsocketRpcLink({websocket: socket, headers: HUB}),
    )
    const caller = new AbortController()
    const waiting = overSocket.page.queue.wait(
      {sessionId: page.sessionId, queueId, waitMs: 60_000},
      {signal: caller.signal},
    )
    expect(await overSocket.tabs.get({sessionId: page.sessionId})).toMatchObject({open: true})
    caller.abort()
    await expect(waiting).rejects.toMatchObject({name: 'AbortError'})
    expect(await overSocket.tabs.get({sessionId: page.sessionId})).toMatchObject({open: true})
    const closed = once(socket, 'close')
    socket.close()
    await closed
    await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.play(onTab, 1, pageSuccess({ok: true, checked: true}))
    await page.finishedEvent(queueId)
    const notice = `queue ${queueId} finished: 2 played, 0 failed`
    expect(JSON.stringify(await page.hub('return 1'))).toContain(notice)
    expect(JSON.stringify(await page.hub('return 2'))).not.toContain(notice)
    expect(page.queueEvents().filter((event) => event.queueId === queueId)).toHaveLength(1)
    expect(page.cards(queueId)).toHaveLength(1)
  })

  it('a code.execute its caller aborts hands over no finished result, so that result leads the next reply', async () => {
    const page = await engineWithTab(
      createFakeHarness(),
      [],
      tempDir('conciv-queue-'),
      () => undefined,
      {},
      servedWithWindowsLongerThanTheCase,
    )
    const {queueId} = parseHandle(await page.hub(queued()))
    const first = await page.nextQueue()
    await page.play(first, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.play(first, 1, pageSuccess({ok: true, checked: true}))
    await page.finishedEvent(queueId)
    const caller = new AbortController()
    const typed = makeRpcClient(page.base, {headers: HUB})
    const running = typed.code.execute({sessionId: page.sessionId, typescriptCode: played}, {signal: caller.signal})
    const blocking = await page.nextQueue()
    caller.abort()
    await expect(running).rejects.toMatchObject({name: 'AbortError'})
    await page.seenChunk(
      (chunk) =>
        chunk.type === ChatEventType.TOOL_CALL_RESULT &&
        JSON.stringify(chunk.content).includes('Code execution was stopped'),
    )
    expect(blocking.id).not.toBe(queueId)
    expect(JSON.stringify(await page.hub('return 1'))).toContain(`queue ${queueId} finished: 2 played, 0 failed`)
  })

  it('a queue a hub request starts stays hub work after a fast finish, an aborted request and a thousand later hub calls', async () => {
    const page = await engineWithTab()
    const typed = makeRpcClient(page.base, {headers: {...HUB, [CONCIV_SESSION_HEADER]: page.sessionId}})
    const playAll = async (onTab: QueuedOnTab): Promise<void> => {
      await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
      await page.play(onTab, 1, pageSuccess({ok: true, checked: true}))
    }
    const nextHubReply = async (): Promise<string> => JSON.stringify(await page.hub('return 1'))
    const notice = (queueId: string) => `queue ${queueId} finished: 2 played, 0 failed`

    const calling = page.hub(queued())
    const fastOnTab = await page.nextQueue()
    const fast = parseHandle(await calling).queueId
    await playAll(fastOnTab)
    await page.finishedEvent(fast)
    expect(await nextHubReply()).toContain(notice(fast))
    expect(page.runIds()).toEqual([])

    const caller = new AbortController()
    const aborted = typed.code.execute(
      {
        sessionId: page.sessionId,
        typescriptCode: `await external_page_queue_async({actions: ${JSON.stringify(ACTIONS)}}); ${played}`,
      },
      {signal: caller.signal},
    )
    const during = await page.nextQueue()
    await playAll(during)
    await page.finishedEvent(during.id)
    const blocking = await page.nextQueue()
    caller.abort()
    await expect(aborted).rejects.toMatchObject({name: 'AbortError'})
    await page.seenChunk(
      (chunk) =>
        chunk.type === ChatEventType.TOOL_CALL_RESULT &&
        JSON.stringify(chunk.content).includes('Code execution was stopped'),
    )
    await playAll(blocking)
    await page.finishedEvent(blocking.id)
    const afterAbort = await nextHubReply()
    expect(afterAbort).toContain(notice(during.id))
    expect(afterAbort).toContain(notice(blocking.id))
    expect(page.runIds()).toEqual([])

    const long = parseHandle(await page.hub(queued())).queueId
    await playAll(await page.nextQueue())
    await page.finishedEvent(long)
    const called = JSON.stringify(
      await page.hub(
        "for (let call = 0; call < 1001; call += 1) await external_page_queue_async({actions: 'none'}).catch(() => null); return 'called'",
      ),
    )
    expect(called).toContain('called')
    expect(called).toContain(notice(long))
    expect(page.runIds()).toEqual([])
  }, 20000)

  it('the next reply for that session carries the finished result once, and the reply after does not', async () => {
    const page = await engineWithTab()
    const {queueId} = parseHandle(await page.hub(queued()))
    const onTab = await page.nextQueue()
    await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.play(onTab, 1, {type: 'failure', code: 'invalid-args', message: 'That element is disabled.'})
    await page.finishedEvent(queueId)
    const next = await page.hub('return 7')
    expect(Array.isArray(next)).toBe(true)
    const [notice, rest] = z.array(z.object({type: z.literal('text'), content: z.string()})).parse(next)
    expect(notice?.content.split('\n')[0]).toBe(`queue ${queueId} finished: 2 played, 1 failed`)
    expect(JSON.parse(notice?.content.split('\n').slice(1).join('\n') ?? '')).toEqual({
      queueId,
      status: 'finished',
      outcomes: [
        {index: 0, tool: 'page_fill', ok: true, result: {ok: true, value: 'Ada'}},
        {index: 1, tool: 'page_check', ok: false, error: '[page.invalid-args] That element is disabled.'},
      ],
      failed: 1,
      played: 2,
    })
    expect(rest?.content).toContain('"result":7')
    const after = await page.hub('return 8')
    expect(after).toContain('"result":8')
    expect(after).not.toContain(queueId)
  })

  it('a queue result far over the text cap still carries every outcome, in the next reply, the sync reply and the hub reply', async () => {
    const page = await engineWithTab()
    const actions = Array.from({length: 50}, (_, index) => ({
      tool: 'page_fill',
      selector: `#field-${index}`,
      value: 'x',
    }))
    const playLarge = async (onTab: QueuedOnTab): Promise<void> => {
      for (const index of actions.keys()) {
        await page.play(
          onTab,
          index,
          index % 2 === 0
            ? pageSuccess({ok: true, value: 'v'.repeat(3000)})
            : {type: 'failure', code: 'invalid-args', message: 'e'.repeat(2048)},
        )
      }
    }
    const expected = actions.map((_, index) =>
      index % 2 === 0
        ? {index, tool: 'page_fill', ok: true, result: expect.any(Object)}
        : {index, tool: 'page_fill', ok: false, error: expect.stringMatching(/^\[page\.invalid-args\] e+$/)},
    )
    const noticed = (text: string | undefined) =>
      PageQueueResultSchema.parse(JSON.parse(text?.split('\n').slice(1).join('\n') ?? ''))
    const {queueId} = parseHandle(await page.hub(queued(actions)))
    await playLarge(await page.nextQueue())
    await page.finishedEvent(queueId)
    const [notice] = z.array(z.object({type: z.literal('text'), content: z.string()})).parse(await page.hub('return 7'))
    expect(notice?.content.split('\n')[0]).toBe(`queue ${queueId} finished: 50 played, 25 failed`)
    expect(noticed(notice?.content)).toEqual({queueId, status: 'finished', outcomes: expected, failed: 25, played: 50})
    const replied = page.hub(`return await external_page_queue({actions: ${JSON.stringify(actions)}})`)
    await playLarge(await page.nextQueue())
    expect(PageQueueResultSchema.parse(JSON.parse(String(await replied)).result).outcomes).toEqual(expected)
    const typed = makeRpcClient(page.base, {headers: HUB})
    const started = await typed.code.execute({
      sessionId: page.sessionId,
      typescriptCode: `return await external_page_queue_async({actions: ${JSON.stringify(actions)}})`,
    })
    const onTab = await page.nextQueue()
    expect(started).toMatchObject({ok: true, queued: [{queueId: onTab.id, actions: 50}]})
    await playLarge(onTab)
    await page.finishedEvent(onTab.id)
    const next = await typed.code.execute({sessionId: page.sessionId, typescriptCode: 'return 8'})
    const [hubNotice] = codeExecuteReply(next).content
    expect(hubNotice?.type === 'text' ? hubNotice.text.split('\n')[0] : null).toBe(
      `queue ${onTab.id} finished: 50 played, 25 failed`,
    )
    expect(noticed(hubNotice?.type === 'text' ? hubNotice.text : undefined).outcomes).toEqual(expected)
  })

  it('a discover_tools reply carries a finished result the session was not handed yet', async () => {
    const page = await engineWithTab()
    const {queueId} = parseHandle(await page.hub(queued()))
    const onTab = await page.nextQueue()
    await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.play(onTab, 1, pageSuccess({ok: true, checked: true}))
    await page.finishedEvent(queueId)
    const [notice] = z
      .array(z.object({type: z.literal('text'), content: z.string()}))
      .parse(await page.discover(['page_fill']))
    expect(notice?.content.split('\n')[0]).toBe(`queue ${queueId} finished: 2 played, 0 failed`)
    expect(String(await page.hub('return 1'))).not.toContain(queueId)
  })

  it('external_page_queue returns every outcome in-call, and neither the next reply nor the chat repeats it', async () => {
    const page = await engineWithTab()
    const replied = page.hub(played)
    const onTab = await page.nextQueue()
    await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.play(onTab, 1, pageSuccess({ok: true, checked: true}))
    expect(JSON.parse(String(await replied)).result).toEqual({
      queueId: onTab.id,
      status: 'finished',
      outcomes: [
        {index: 0, tool: 'page_fill', ok: true, result: {ok: true, value: 'Ada'}},
        {index: 1, tool: 'page_check', ok: true, result: {ok: true, checked: true}},
      ],
      failed: 0,
      played: 2,
    })
    expect(String(await page.hub('return 1'))).not.toContain(onTab.id)
    expect(page.queueEvents()).toEqual([])
  })

  it('a tab that closes mid-queue leaves the queue lost, with the confirmed outcomes kept and the rest unconfirmed', async () => {
    const page = await engineWithTab()
    const replied = page.hub(played)
    const onTab = await page.nextQueue()
    await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.close()
    expect(JSON.parse(String(await replied)).result).toEqual({
      queueId: onTab.id,
      status: 'lost',
      outcomes: [
        {index: 0, tool: 'page_fill', ok: true, result: {ok: true, value: 'Ada'}},
        {
          index: 1,
          tool: 'page_check',
          ok: false,
          error: 'the page reloaded or closed during page_check; it may already have run',
        },
      ],
      failed: 0,
      played: 1,
    })
  })

  it('an in-page queue publishes one conciv.page-queue event, records it, and starts a follow-up turn', async () => {
    const page = await engineWithTab()
    const turn = page.inChat('queueing-run', queued())
    const onTab = await page.nextQueue()
    const queueId = onTab.id
    await (await turn).text()
    await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.play(onTab, 1, pageSuccess({ok: true, checked: true}))
    await page.finishedEvent(queueId)
    expect(page.queueEvents()).toEqual([expect.objectContaining({queueId, status: 'finished', played: 2, failed: 0})])
    await page.followUpFinished(['queueing-run'])
    const hydrated = await page.tab.chat.hydrate({sessionId: page.sessionId})
    const parts = hydrated.messages
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.parts)
    expect(parts).toContainEqual(expect.objectContaining({type: 'tool-call', name: 'execute_typescript'}))
    expect(parts).toContainEqual({type: 'text', content: 'ok'})
    expect(hydrated.activeRun).toBeNull()
    expect(page.queueEvents()).toHaveLength(1)
  })

  it('three failed follow-up runs start no fourth when their run ends, and a later queue starts exactly one more', async () => {
    const harness = createFakeHarness()
    const page = await engineWithTab(harness)
    const queueing: string[] = []
    const followUps = () => page.runIds().filter((runId) => !queueing.includes(runId))
    const playedInPage = async (failures: number): Promise<void> => {
      const runId = `queueing-run-${queueing.length}`
      queueing.push(runId)
      const turn = page.inChat(runId, queued())
      const onTab = await page.nextQueue()
      const queueId = onTab.id
      await (await turn).text()
      for (const attempt of Array.from({length: failures}, (_, offset) => offset + 1))
        harness.script.scriptError(`launch failure ${attempt}`)
      await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
      await page.play(onTab, 1, pageSuccess({ok: true, checked: true}))
      await page.finishedEvent(queueId)
    }
    const followUpsEnded = async (from: number, count: number): Promise<void> => {
      for (const index of Array.from({length: count}, (_, offset) => offset)) {
        await page.followUpFinished([...queueing, ...followUps().slice(0, from + index)])
      }
    }
    await playedInPage(3)
    await followUpsEnded(0, 3)
    expect(followUps()).toHaveLength(3)
    await playedInPage(0)
    await followUpsEnded(3, 1)
    expect(followUps()).toHaveLength(4)
  })

  it('an in-page queue that finishes while its run is live starts the follow-up turn once that run ends', async () => {
    const harness = createFakeHarness()
    const idled: string[] = []
    const idleCounter = Plugin.define({
      id: 'idle-counter',
      async setup(ctx) {
        await ctx.session.hook('experimental.idle', (event) => void idled.push(event.sessionId))
      },
    })
    const page = await engineWithTab(harness, [idleCounter])
    harness.script.hold()
    const turn = page.inChat('queueing-run', queued())
    const onTab = await page.nextQueue()
    const queueId = onTab.id
    await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.play(onTab, 1, pageSuccess({ok: true, checked: true}))
    await page.finishedEvent(queueId)
    harness.script.release()
    await (await turn).text()
    await page.followUpFinished(['queueing-run'])
    expect(page.runIds().filter((runId) => runId !== 'queueing-run')).toHaveLength(1)
    expect((await page.tab.chat.hydrate({sessionId: page.sessionId})).activeRun).toBeNull()
    expect(idled).toEqual([page.sessionId])
  })

  it('a chat turn sent at once after a project plugin reloads runs no page_eval while the tab re-joins, and the next turn asks', async () => {
    const root = tempDir('conciv-queue-')
    const helper = join(root, 'conciv', 'plugins', 'helper.ts')
    const helperLooking = (look: string) =>
      `const LOOK = '${look}'\nexport default {id: 'helper', async setup() {}, look: LOOK}\n`
    mkdirSync(dirname(helper), {recursive: true})
    writeFileSync(helper, helperLooking('first look'))
    const page = await engineWithTab(createFakeHarness(), [], root)
    const events = await makeRpcClient(page.base).event.subscribe()
    const asked = async (): Promise<unknown> => {
      const next = await events.next()
      if (next.done === true) return undefined
      if (next.value.type === 'permission.asked') return next.value.data
      return asked()
    }
    const evalCode = 'return await external_page_eval({code: "document.domain"})'
    const asking = asked()
    const releaseRejoin = page.onTab.holdRejoin()
    writeFileSync(helper, helperLooking('second look'))
    const reloadTurn = sseStream(await page.inChat('eval-run', evalCode))
    const endedFirst = reloadTurn.ended().then((text) => ({endedWithoutAsking: text}))
    const first = await Promise.race([asking, endedFirst])
    expect(first).toEqual({endedWithoutAsking: expect.any(String)})
    const answered = (await page.tab.chat.hydrate({sessionId: page.sessionId})).messages.flatMap((message) =>
      message.parts.flatMap((part) => (part.type === 'tool-result' ? [part.content] : [])),
    )
    const [program] = answered.map((content): unknown => JSON.parse(String(content)))
    expect(answered).toHaveLength(1)
    expect(program).toMatchObject({
      success: false,
      logs: [],
      error: {message: "'external_page_eval' is not defined", name: 'ReferenceError'},
    })
    expect(page.onTab.seen()).toEqual([])
    releaseRejoin()
    await page.onTab.joined(2)
    const nextTurn = page.inChat('eval-again', evalCode)
    expect(await asking).toMatchObject({
      sessionId: page.sessionId,
      action: 'page_eval',
      resources: ['document.domain'],
    })
    await events.return(undefined)
    await page.tab.chat.stop({sessionId: page.sessionId, runIds: ['eval-again']})
    await (await nextTurn).text()
  })

  it('a chat-agent page_eval in the same session during a config-allowed CLI page_eval is still asked and does not run', async () => {
    const evals: string[] = []
    const holdsUnder = (command: Page.Command) => {
      if (command.action.type !== 'eval') return undefined
      evals.push(command.action.code)
      return `eval/${command.action.code}`
    }
    const page = await engineWithTab(createFakeHarness(), [], tempDir('conciv-queue-'), holdsUnder, {
      permissions: [{action: 'page_eval', resource: 'document.title', effect: 'allow'}],
    })
    const events = await makeRpcClient(page.base).event.subscribe()
    const asked = async (): Promise<unknown> => {
      const next = await events.next()
      if (next.done === true) return undefined
      if (next.value.type === 'permission.asked') return next.value.data
      return asked()
    }
    const asking = asked()
    const cli = makeRpcClient(page.base, {
      headers: {...HUB, [CONCIV_SESSION_HEADER]: page.sessionId, [CONCIV_NAMED_TAB_HEADER]: '1'},
    })
    const admitted = cli.registry.call({name: 'page_eval', input: {code: 'document.title'}})
    const cliRequest = await page.heldRequest('eval/document.title')
    const agentTurn = page.inChat('agent-eval', 'return await external_page_eval({code: "document.domain"})')
    expect(await asking).toMatchObject({sessionId: page.sessionId, action: 'page_eval', resources: ['document.domain']})
    expect(evals).toEqual(['document.title'])
    await page.onTab.reply(cliRequest, pageSuccess({result: 'Example'}))
    expect(await admitted).toEqual({result: 'Example'})
    await events.return(undefined)
    await page.tab.chat.stop({sessionId: page.sessionId, runIds: ['agent-eval']})
    await (await agentTurn).text()
    expect(evals).toEqual(['document.title'])
  })

  const configuredEvals = async (permissions: Pick<ConcivConfig, 'permission' | 'permissions'>) => {
    const evals: string[] = []
    const page = await engineWithTab(
      createFakeHarness(),
      [],
      tempDir('conciv-queue-'),
      (command) => {
        if (command.action.type !== 'eval') return undefined
        evals.push(command.action.code)
        return `eval/${command.action.code}`
      },
      permissions,
    )
    const events = await makeRpcClient(page.base).event.subscribe()
    onTestFinished(async () => {
      await events.return(undefined)
    })
    const asked = async (): Promise<unknown> => {
      const next = await events.next()
      if (next.done === true) return undefined
      if (next.value.type === 'permission.asked') return next.value.data
      return asked()
    }
    return {page, evals, asked}
  }

  it('an in-chat page_eval the config allows runs with no ask, and one the config denies is refused', async () => {
    const {page, evals, asked} = await configuredEvals({
      permission: {page_eval: {'document.cookie': 'deny'}},
      permissions: [{action: 'page_eval', resource: 'document.title', effect: 'allow'}],
    })
    const asking = asked()
    const allowed = page.inChat('allowed-eval', 'return await external_page_eval({code: "document.title"})')
    const first = await Promise.race([
      asking.then(() => 'asked'),
      page.heldRequest('eval/document.title').then(() => 'ran'),
    ])
    expect(first).toBe('ran')
    await page.onTab.reply(await page.heldRequest('eval/document.title'), pageSuccess({result: 'Example'}))
    await (await allowed).text()
    const denied = page.inChat('denied-eval', 'return await external_page_eval({code: "document.cookie"})')
    const ended = await Promise.race([asking.then(() => 'asked'), denied.then((turn) => turn.text())])
    expect(ended).toContain('denied')
    expect(evals).toEqual(['document.title'])
  })

  it('an outside page_eval naming its tab is asked like any outside call: refused with no rule, run under a config allow, refused under a config deny', async () => {
    const evals: string[] = []
    const holdsUnder = (command: Page.Command) => {
      if (command.action.type !== 'eval') return undefined
      evals.push(command.action.code)
      return command.action.code === 'document.title' ? 'eval/document.title' : undefined
    }
    const page = await engineWithTab(createFakeHarness(), [], tempDir('conciv-queue-'), holdsUnder, {
      permission: {page_eval: {'document.cookie': 'deny'}},
      permissions: [{action: 'page_eval', resource: 'document.title', effect: 'allow'}],
    })
    const outside = makeRpcClient(page.base, {
      headers: {...HUB, [CONCIV_SESSION_HEADER]: page.sessionId, [CONCIV_NAMED_TAB_HEADER]: '1'},
    })
    const evaluate = (code: string) => outside.registry.call({name: 'page_eval', input: {code}})
    await expect(evaluate('document.domain')).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: `Tool "page_eval" needs the user's approval. The request is shown to the user; retry once they approve it.`,
    })
    expect(evals).toEqual([])
    const allowed = evaluate('document.title')
    await page.onTab.reply(await page.heldRequest('eval/document.title'), pageSuccess({result: 'Example'}))
    expect(await allowed).toEqual({result: 'Example'})
    await expect(evaluate('document.cookie')).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: 'Permission denied: page_eval',
    })
    expect(evals).toEqual(['document.title'])
  })

  it('a widget-origin page_eval under a config deny is refused like any caller, and one the config allows runs', async () => {
    const evals: string[] = []
    const holdsUnder = (command: Page.Command) => {
      if (command.action.type !== 'eval') return undefined
      evals.push(command.action.code)
      return command.action.code === 'document.title' ? 'eval/document.title' : undefined
    }
    const page = await engineWithTab(createFakeHarness(), [], tempDir('conciv-queue-'), holdsUnder, {
      permission: {page_eval: {'document.cookie': 'deny'}},
      permissions: [{action: 'page_eval', resource: 'document.title', effect: 'allow'}],
    })
    const widget = makeRpcClient(page.base, {
      headers: {[CONCIV_SESSION_HEADER]: page.sessionId, origin: 'http://localhost:3000'},
    })
    const evaluate = (code: string) => widget.registry.call({name: 'page_eval', input: {code}})
    await expect(evaluate('document.cookie')).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: 'Permission denied: page_eval',
    })
    expect(evals).toEqual([])
    const allowed = evaluate('document.title')
    await page.onTab.reply(await page.heldRequest('eval/document.title'), pageSuccess({result: 'Example'}))
    expect(await allowed).toEqual({result: 'Example'})
    expect(evals).toEqual(['document.title'])
  })

  it('config page rules land on every agent before the page guards: page allow keeps the attach gate, and an eval with no rule is asked', async () => {
    const {page, evals, asked} = await configuredEvals({permission: {page: 'allow'}})
    const tabless = (await makeRpcClient(page.base).sessions.create(undefined)).sessionId
    const listed = await executeOverMcp(
      page.base,
      {...HUB, [CONCIV_SESSION_HEADER]: tabless},
      'return Object.keys(globalThis).filter((key) => key.startsWith("external_page_"))',
    )
    expect(z.object({result: z.array(z.string())}).parse(JSON.parse(String(listed))).result).toEqual([])
    const asking = asked()
    const unruled = page.inChat('unruled-eval', 'return await external_page_eval({code: "document.domain"})')
    expect(await asking).toMatchObject({sessionId: page.sessionId, action: 'page_eval', resources: ['document.domain']})
    expect(evals).toEqual([])
    await page.tab.chat.stop({sessionId: page.sessionId, runIds: ['unruled-eval']})
    await (await unruled).text()
  })

  it('a user stop starts no follow-up turn: the owed result arrives with the agent next reply', async () => {
    const harness = createFakeHarness()
    const page = await engineWithTab(harness)
    harness.script.hold()
    const viewer = new AbortController()
    onTestFinished(() => viewer.abort())
    const send = (runId: string, content: string) => sseTurn(page.base, page.sessionId, runId, content, viewer.signal)
    const stopped = page.inChat('stopped-run', queued())
    const onTab = await page.nextQueue()
    const queueId = onTab.id
    await page.play(onTab, 0, pageSuccess({ok: true, value: 'Ada'}))
    await page.play(onTab, 1, pageSuccess({ok: true, checked: true}))
    await page.finishedEvent(queueId)
    await page.tab.chat.stop({sessionId: page.sessionId, runIds: ['stopped-run']})
    await (await stopped).text()
    expect(await page.tab.chat.hydrate({sessionId: page.sessionId})).toMatchObject({
      activeRun: null,
      lastRun: {runId: 'stopped-run', phase: 'aborted'},
    })
    const next = send('next-run', 'what happened?')
    await page.seenChunk(() => page.runIds().includes('next-run'))
    expect(
      JSON.stringify(await executeOverMcp(page.base, {[CONCIV_SESSION_HEADER]: page.sessionId}, 'return 1')),
    ).toContain(`queue ${queueId} finished: 2 played, 0 failed`)
    harness.script.release()
    await (await next).text()
    expect([...new Set(page.runIds())]).toEqual(['stopped-run', 'next-run'])
    expect(await page.tab.chat.hydrate({sessionId: page.sessionId})).toMatchObject({
      activeRun: null,
      lastRun: {runId: 'next-run', phase: 'completed'},
    })
  })
})

describe('engine plugins', () => {
  const SEER = `import {appendFileSync, readFileSync} from 'node:fs'
import {join} from 'node:path'

const LOOK = 'first look'

const Seer = {
  id: 'seer',
  methods: {seen: {input: {type: 'object'}, output: {type: 'object'}}, look: {input: {type: 'object'}, output: {type: 'string'}}},
  events: {loaded: {schema: {type: 'object', properties: {look: {type: 'string'}}}}},
}

export default {
  id: 'seer',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'seer_echo',
        description: 'Says what the seer saw',
        input: {type: 'object', properties: {}},
        execute: async () => ({content: 'seer-was-here'}),
      })
      const shot = () => ({
        content: [
          {type: 'text', text: 'shot taken'},
          {
            type: 'file',
            uri: 'data:image/png;base64,' + readFileSync(join(ctx.location.directory, 'shot.png')).toString('base64'),
            mime: 'image/png',
            name: 'shot.png',
          },
        ],
      })
      tools.add({name: 'seer_shot', description: 'Shoots the page', input: {type: 'object', properties: {}}, execute: async () => shot()})
      tools.add({
        name: 'seer_direct_shot',
        description: 'Shoots the page directly',
        input: {type: 'object', properties: {}},
        options: {codemode: false},
        execute: async () => shot(),
      })
      tools.add({
        name: 'seer_direct_id',
        description: 'Names its own call',
        input: {type: 'object', properties: {}},
        options: {codemode: false},
        execute: async (_input, context) => ({content: 'called as ' + context.id}),
      })
    })
    await ctx.skill.transform((skills) => {
      skills.add({
        id: 'seer-look',
        name: 'seer-look',
        description: 'How the seer looks',
        path: join(ctx.location.directory, 'seer-look', 'SKILL.md'),
        content: 'Look twice.',
      })
    })
    const registration = await ctx.rpc.register(Seer, {
      seen: async () => ({
        app: ctx.app,
        directory: ctx.location.directory,
        servers: ctx.servers.list(),
        plugins: (await ctx.plugin.list()).data,
      }),
      look: async () => LOOK,
    })
    await registration.events.emit('loaded', {look: LOOK})
    return () => appendFileSync(join(ctx.location.directory, 'cleanups.log'), 'seer\\n')
  },
}
`
  const configured = (id: string) => `import {appendFileSync} from 'node:fs'
import {join} from 'node:path'

export default {
  id: '${id}',
  async setup(ctx) {
    const definition = {id: '${id}', methods: {options: {input: {type: 'object'}, output: {type: 'object'}}}, events: {}}
    await ctx.rpc.register(definition, {options: async () => ctx.options})
    return () => appendFileSync(join(ctx.location.directory, 'cleanups.log'), '${id}\\n')
  },
}
`
  const BROKEN = `export default {
  id: 'broken',
  async setup() {
    throw new Error('broken on purpose')
  },
}
`
  const Embedded = PluginRpc.define({
    id: 'embedded',
    methods: {
      ping: {input: z.object({}), output: z.string()},
      announce: {input: z.object({}), output: z.string()},
      deleted: {input: z.object({}), output: z.string()},
      counted: {input: z.object({}), output: z.number()},
    },
    events: {announced: {schema: z.object({})}},
  })

  function projectWithPlugins(): string {
    const root = tempDir('conciv-plugins-')
    mkdirSync(join(root, 'conciv', 'plugins'), {recursive: true})
    writeFileSync(join(root, 'conciv', 'plugins', 'seer.ts'), SEER)
    writeFileSync(join(root, 'conciv', 'plugins', 'broken.ts'), BROKEN)
    writeFileSync(join(root, 'shot.png'), gradientPng(2400, 1200))
    for (const id of ['configured', 'removed', 'denied']) {
      mkdirSync(join(root, id))
      writeFileSync(join(root, id, 'index.ts'), configured(id))
    }
    return root
  }

  function pngChunk(type: string, data: Buffer): Buffer {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, checksum])
  }

  function gradientPng(width: number, height: number): Buffer {
    const header = Buffer.alloc(13)
    header.writeUInt32BE(width, 0)
    header.writeUInt32BE(height, 4)
    header.set([8, 2, 0, 0, 0], 8)
    const row = (y: number) =>
      Buffer.from([0, ...Array.from({length: width}, (_, x) => [x % 256, y % 256, (x + y) % 256]).flat()])
    const pixels = Buffer.concat(Array.from({length: height}, (_, y) => row(y)))
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk('IHDR', header),
      pngChunk('IDAT', deflateSync(pixels)),
      pngChunk('IEND', Buffer.alloc(0)),
    ])
  }

  function jpegSize(base64: string): {width: number; height: number} {
    const bytes = Buffer.from(base64, 'base64')
    const frame = bytes.findIndex((byte, index) => byte === 0xff && bytes[index + 1] === 0xc0)
    return {width: bytes.readUInt16BE(frame + 7), height: bytes.readUInt16BE(frame + 5)}
  }

  const ShotImageSchema = z.object({
    type: z.literal('image'),
    source: z.object({type: z.literal('data'), value: z.string(), mimeType: z.string()}),
  })

  const shotImages = (parts: unknown) =>
    z
      .array(z.object({type: z.string()}).loose())
      .parse(parts)
      .flatMap((part) => {
        const image = ShotImageSchema.safeParse(part)
        return image.success ? [{mimeType: image.data.source.mimeType, ...jpegSize(image.data.source.value)}] : []
      })

  function bootWithPlugins(
    home: string,
    root: string,
    harness: FakeHarness = createFakeHarness(),
    idled: string[] = [],
  ): Promise<Engine> {
    const embedded = Plugin.define({
      id: 'embedded',
      async setup(ctx) {
        await ctx.session.hook('experimental.idle', (event) => void idled.push(event.sessionId))
        const deletedSessions = ctx.event.subscribe({types: ['session.deleted']})
        const firstDeletion = deletedSessions[Symbol.asyncIterator]().next()
        const calls = {counted: 0}
        const registration: Promise<RpcRegistration<typeof Embedded>> = ctx.rpc.register(Embedded, {
          ping: async () => 'pong',
          announce: async () => {
            await (await registration).events.emit('announced', {})
            return 'announced'
          },
          deleted: async () => {
            const result = await firstDeletion
            return result.done ? 'closed' : result.value.data.sessionID
          },
          counted: async () => {
            calls.counted += 1
            return calls.counted
          },
        })
        await registration
        return () => writeFileSync(join(root, 'cleanups.log'), 'embedded\n', {flag: 'a'})
      },
    })
    return start({
      options: {
        stateRoot: root,
        hubAccess: 'session',
        plugins: [['./configured', {greeting: 'hi'}], './removed', '-removed', './denied'],
        policies: [{action: 'plugin.use', resource: join(root, 'denied'), effect: 'deny'}],
      },
      root,
      launchEditor: () => {},
      harness,
      homeDir: home,
      plugins: [embedded],
    })
  }

  const call = (base: string, rpcId: string, method: string) =>
    makeRpcClient(base).plugin.call({rpcId, method, input: {}}, {signal: AbortSignal.timeout(5000)})

  it('an engine loads its project, configured and embedded plugins once it listens, lists a failing one, cleans up on stop and loads them again', async () => {
    const [home, root] = [tempDir('conciv-home-'), projectWithPlugins()]
    const prompts: Array<{sessionId: string; systemPrompts: string[]; tools: string[]}> = []
    const fake = createFakeHarness()
    const harness: FakeHarness = {
      ...fake,
      chatConfig: (deps: HarnessChatDeps) => ({
        adapter: makeTextAdapter(fake.id, async function* (options) {
          prompts.push({
            sessionId: deps.sessionId,
            systemPrompts: [...(options.systemPrompts ?? [])].map(String),
            tools: (options.tools ?? []).map((tool) => tool.name),
          })
          yield* fake.script.chatStream(deps, options)
        }),
      }),
    }
    const idled: string[] = []
    const engine = await bootWithPlugins(home, root, harness, idled)
    const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`
    const stopped = {current: false}
    onTestFinished(async () => {
      if (!stopped.current) await engine.stop()
    })
    const id = z.object({id: z.string()}).parse(await (await fetch(`http://127.0.0.1:${engine.port}/health`)).json()).id

    const seen = z
      .object({
        app: z.object({name: z.string()}),
        directory: z.string(),
        servers: z.array(z.string()),
        plugins: z.array(
          z.object({
            id: z.string(),
            source: z.object({type: z.string()}).loose(),
            state: z.object({status: z.string(), error: z.string().optional()}),
          }),
        ),
      })
      .parse(await call(base, 'seer', 'seen'))
    expect(seen.app.name).toBe('conciv')
    expect(seen.directory).toBe(root)
    expect(seen.plugins.map((plugin) => plugin.id).toSorted()).toEqual([
      'broken',
      'conciv.config.agent',
      'conciv.config.skill',
      'conciv.page',
      'conciv.skill',
      'conciv.tool.server',
      'conciv.tool.skill',
      'configured',
      'embedded',
      'seer',
    ])
    expect(seen.plugins.find((plugin) => plugin.id === 'seer')).toEqual({
      id: 'seer',
      source: {type: 'local', path: join(root, 'conciv', 'plugins', 'seer.ts')},
      state: {status: 'active'},
    })
    expect(seen.plugins.find((plugin) => plugin.id === 'configured')?.state).toEqual({status: 'active'})
    expect(seen.plugins.find((plugin) => plugin.id === 'embedded')?.state).toEqual({status: 'active'})
    expect(seen.plugins.find((plugin) => plugin.id === 'broken')?.state).toEqual({
      status: 'failed',
      error: expect.stringContaining('broken on purpose'),
    })

    await vi.waitFor(
      async () =>
        expect(z.object({servers: z.array(z.string())}).parse(await call(base, 'seer', 'seen')).servers).toEqual([id]),
      {timeout: 3000},
    )
    expect(await call(base, 'configured', 'options')).toEqual({greeting: 'hi'})
    expect(await call(base, 'embedded', 'ping')).toBe('pong')
    await expect(call(base, 'removed', 'options')).rejects.toMatchObject({data: {type: 'rpc.unavailable'}})
    await expect(call(base, 'denied', 'options')).rejects.toMatchObject({data: {type: 'rpc.unavailable'}})

    const sessionId = (await makeRpcClient(base).sessions.create(undefined)).sessionId
    expect(
      JSON.stringify(
        await executeOverMcp(base, {[CONCIV_SESSION_HEADER]: sessionId}, 'return await external_seer_echo({})'),
      ),
    ).toContain('seer-was-here')
    const resized = [{mimeType: 'image/jpeg', width: 2000, height: 1000}]
    expect
      .soft(
        shotImages(
          await executeOverMcp(
            base,
            {[CONCIV_SESSION_HEADER]: sessionId},
            'await external_seer_shot({}); return "done"',
          ),
        ),
      )
      .toEqual(resized)
    const mcp = await connectMcpClient(`${base}/api/mcp`, {[CONCIV_SESSION_HEADER]: sessionId})
    onTestFinished(() => mcp.close())
    const direct = (await mcp.tools()).find((entry) => entry.name === 'seer_direct_shot')
    expect.soft(shotImages(await direct?.execute?.({}))).toEqual(resized)
    const named = (await mcp.tools()).find((entry) => entry.name === 'seer_direct_id')
    const namedReply = JSON.stringify(await named?.execute?.({}))
    const namedCards = (await makeRpcClient(base).chat.hydrate({sessionId})).messages.flatMap((message) =>
      message.parts.flatMap((part) => (part.type === 'tool-call' && part.name === 'seer_direct_id' ? [part.id] : [])),
    )
    expect(namedCards).toHaveLength(1)
    expect(namedReply).toContain(`called as ${namedCards[0]}`)

    const origin = `http://127.0.0.1:${engine.port}`
    const login = browserRpcConnection(origin)
    onTestFinished(() => login.release())
    expect(await login.trust.requestTrustWithToken(engine.agentToken)).toBe(true)
    const widget = makeBrowserRpcClient(origin)
    onTestFinished(() => widget.close())
    const overSocket = (rpcId: string, method: string) =>
      widget.rpc.plugin.call({rpcId, method, input: {}}, {signal: AbortSignal.timeout(5000)})
    expect(await overSocket('embedded', 'ping')).toBe('pong')
    expect(await overSocket('seer', 'look')).toBe('first look')

    const everything = await makeRpcClient(base).event.subscribe()
    const deletions = await makeRpcClient(base).event.subscribe({types: ['session.deleted']})
    const socketEvents = await widget.rpc.event.subscribe()
    const connected = {done: false, value: {id: expect.stringMatching(/^evt_/), type: 'server.connected', data: {}}}
    expect(await everything.next()).toEqual(connected)
    expect(await deletions.next()).toEqual(connected)
    expect(await socketEvents.next()).toEqual(connected)
    expect(await overSocket('embedded', 'announce')).toBe('announced')
    const pluginReadDeletion = call(base, 'embedded', 'deleted')
    await makeRpcClient(base).sessions.delete({sessionId})
    expect(await pluginReadDeletion).toBe(sessionId)
    const announced = {
      id: expect.stringMatching(/^evt_/),
      type: 'rpc.embedded.announced',
      created: expect.any(Number),
      location: {directory: root},
      data: {},
    }
    const deleted = {
      ...announced,
      type: 'session.deleted',
      durable: {aggregateID: sessionId, seq: expect.any(Number), version: 2},
      data: {sessionID: sessionId},
    }
    expect(await nextEvent(everything)).toEqual({done: false, value: announced})
    expect(await nextEvent(everything)).toEqual({done: false, value: deleted})
    expect(await nextEvent(deletions)).toEqual({done: false, value: deleted})
    expect(await nextEvent(socketEvents)).toEqual({done: false, value: announced})
    expect(await nextEvent(socketEvents)).toEqual({done: false, value: deleted})
    await socketEvents.return(undefined)

    const outside = makeRpcClient(base, {headers: {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: 'terminal'}})
    await expect(outside.event.subscribe()).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: "outside agents can't read the engine's event stream",
    })
    const pluginRefusal = {
      code: 'APPROVAL_DENIED',
      message: "outside agents can't use plugin routes; use the plugin in the tab",
    }
    await expect(outside.plugin.call({rpcId: 'embedded', method: 'counted', input: {}})).rejects.toMatchObject(
      pluginRefusal,
    )
    expect(await call(base, 'embedded', 'counted')).toBe(1)
    await expect(outside.plugin.list()).rejects.toMatchObject(pluginRefusal)
    expect((await makeRpcClient(base).plugin.list()).data.map((plugin) => plugin.id)).toContain('embedded')
    await expect(outside.plugin.experimental({id: 'configured'})).rejects.toMatchObject(pluginRefusal)
    await expect(outside.plugin.experimentalChunk({id: 'configured', file: 'x.cjs'})).rejects.toMatchObject(
      pluginRefusal,
    )
    await expect(makeRpcClient(base).plugin.experimental({id: 'configured'})).rejects.toMatchObject({
      code: 'PLUGIN_NOT_FOUND',
      data: {pluginId: 'configured'},
    })
    await everything.return(undefined)
    await deletions.return(undefined)

    const looking = (await widget.rpc.sessions.create(undefined)).sessionId
    const sessionClient = (session: string) => makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: session}})
    const turn = (session: string, runId: string) => sseTurn(base, session, runId, 'look around')
    await (await turn(looking, 'looked-run')).text()
    expect((await sessionClient(looking).chat.hydrate({sessionId: looking})).lastRun).toMatchObject({
      runId: 'looked-run',
      phase: 'completed',
    })
    expect(prompts).toEqual([
      {sessionId: looking, systemPrompts: expect.any(Array), tools: expect.arrayContaining(['seer_direct_shot'])},
    ])
    const prompted = prompts.flatMap((prompt) => prompt.systemPrompts).join('\n')
    expect(prompted).toContain('<id>seer-look</id>')
    expect(prompted).toContain('external_seer_echo')
    expect(idled).toEqual([looking])

    const held = (await widget.rpc.sessions.create(undefined)).sessionId
    const heldEvents = await sessionClient(held).chat.events({sessionId: held})
    harness.script.hold()
    const stopping = turn(held, 'stopped-run')
    for await (const chunk of heldEvents) if (sessionRunEvent.parse(chunk)?.runId === 'stopped-run') break
    await sessionClient(held).chat.stop({sessionId: held, runIds: ['stopped-run']})
    harness.script.release()
    await (await stopping).text()
    expect((await sessionClient(held).chat.hydrate({sessionId: held})).lastRun).toMatchObject({
      runId: 'stopped-run',
      phase: 'aborted',
    })
    expect(idled).toEqual([looking])
    await (await turn(held, 'after-stop-run')).text()
    expect(idled).toEqual([looking, held])

    const reloads = await widget.rpc.event.subscribe()
    expect(await reloads.next()).toEqual(connected)
    const reloading = {arrived: false, seen: new Array<string>()}
    onTestFailed(() => {
      if (reloading.arrived) return
      const cleanups = readFileSync(join(root, 'cleanups.log'), 'utf8')
      throw new Error(
        `the edited seer never published rpc.seer.loaded; events since the edit: ${JSON.stringify(reloading.seen)}; cleanups: ${JSON.stringify(cleanups)}`,
      )
    })
    writeFileSync(
      join(root, 'conciv', 'plugins', 'seer.ts'),
      SEER.replace("const LOOK = 'first look'", "const LOOK = 'second look'"),
    )
    const reloaded = async (): Promise<unknown> => {
      const next = await reloads.next()
      if (next.done === true) return next
      reloading.seen.push(next.value.type)
      if (next.value.type === 'rpc.seer.loaded') return next.value.data
      return reloaded()
    }
    expect(await reloaded()).toEqual({look: 'second look'})
    reloading.arrived = true
    expect(readFileSync(join(root, 'cleanups.log'), 'utf8')).toBe('configured\nseer\n')
    expect(await overSocket('seer', 'look')).toBe('second look')
    await reloads.return(undefined)

    stopped.current = true
    await engine.stop()
    expect(readFileSync(join(root, 'cleanups.log'), 'utf8')).toBe('configured\nseer\nconfigured\nseer\nembedded\n')

    const again = await bootWithPlugins(home, root)
    onTestFinished(() => again.stop())
    const againBase = `http://127.0.0.1:${again.port}/t/${again.agentToken}`
    expect(z.object({directory: z.string()}).parse(await call(againBase, 'seer', 'seen')).directory).toBe(root)
  })

  it('an engine with no plugin offers its built-in conciv and report skills and a skill added to the project conciv/skills folder', async () => {
    const root = tempDir('conciv-skills-')
    const prompts: string[][] = []
    const fake = createFakeHarness()
    const harness: FakeHarness = {
      ...fake,
      chatConfig: (deps: HarnessChatDeps) => ({
        adapter: makeTextAdapter(fake.id, async function* (options) {
          prompts.push([...(options.systemPrompts ?? [])].map(String))
          yield* fake.script.chatStream(deps, options)
        }),
      }),
    }
    const engine = await start({
      options: {stateRoot: root},
      root,
      launchEditor: () => {},
      harness,
      homeDir: tempDir('conciv-home-'),
    })
    onTestFinished(() => engine.stop())
    const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`
    const sessionId = (await makeRpcClient(base).sessions.create(undefined)).sessionId
    const prompted = async (runId: string) => {
      await sseTurn(base, sessionId, runId, 'say hello').then((response) => response.text())
      return prompts.at(-1)?.join('\n') ?? ''
    }
    const mcp = await connectMcpClient(`${base}/api/mcp`, {[CONCIV_SESSION_HEADER]: sessionId})
    onTestFinished(() => mcp.close())
    const load = async (id: string) =>
      JSON.stringify(await (await mcp.tools()).find((entry) => entry.name === 'skill')?.execute?.({id}))

    const bare = await prompted('bare-run')
    expect(bare).toContain('<id>conciv</id>')
    expect(bare).toContain('<id>report</id>')
    expect(await load('conciv')).toContain('Full documentation is available at <https://conciv.dev/docs>.')
    const report = await load('report')
    expect(report).toContain('# Report a conciv issue')
    expect(report).toContain('## Runtime Diagnostics Snapshot')
    expect(report).toContain('- Active plugins: None found in config')

    const updates = await makeRpcClient(base).event.subscribe({types: ['skill.updated']})
    onTestFinished(async () => {
      await updates.return(undefined)
    })
    expect(await updates.next()).toMatchObject({value: {type: 'server.connected'}})
    const folder = join(root, 'conciv', 'skills', 'greet')
    mkdirSync(folder, {recursive: true})
    writeFileSync(join(folder, 'SKILL.md'), '---\nname: greet\ndescription: How to greet the user\n---\nGreet twice.\n')
    expect(await nextEvent(updates)).toMatchObject({value: {type: 'skill.updated'}})
    expect(await prompted('greet-run')).toContain('<id>greet</id>')
    expect(await load('greet')).toContain('Greet twice.')
  })

  const DEPLOY_RPC = `import {z} from ${JSON.stringify(import.meta.resolve('zod'))}
import {Rpc} from ${JSON.stringify(import.meta.resolve('@conciv/plugin/rpc'))}

export const Deploy = Rpc.define({
  id: 'deploy',
  methods: {run: {input: z.object({env: z.enum(['staging', 'prod'])}), output: z.object({url: z.string()})}},
  events: {},
})
`

  const DEPLOY_INDEX = `import {Plugin} from ${JSON.stringify(import.meta.resolve('@conciv/plugin'))}
import {Deploy} from './rpc.js'

const description = 'Deploy the current branch'

const run = async ({env}: {env: 'staging' | 'prod'}) => ({url: \`https://\${env}.example.com\`})

export default Plugin.define({
  id: 'deploy',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'run',
        description,
        input: Deploy.methods.run.input,
        output: Deploy.methods.run.output,
        options: {namespace: 'deploy'},
        execute: async (input) => ({output: await run(input)}),
      })
    })
    await ctx.skill.transform((skills) => {
      skills.add({
        id: 'deploy',
        name: 'Deploy',
        description: \`\${description}.\`,
        path: 'skill://deploy/SKILL.md',
        content: 'You can deploy from code mode with \`external_deploy_run\`.',
      })
    })
    const registration = await ctx.rpc.register(Deploy, {run})
    return () => registration.dispose()
  },
})
`

  it('a plugin folder in the project offers its deploy tool to code mode, answers its deploy method and teaches its skill', async () => {
    const root = tempDir('conciv-deploy-')
    mkdirSync(join(root, 'conciv', 'plugins', 'deploy'), {recursive: true})
    writeFileSync(join(root, 'conciv', 'plugins', 'deploy', 'index.ts'), DEPLOY_INDEX)
    writeFileSync(join(root, 'conciv', 'plugins', 'deploy', 'rpc.ts'), DEPLOY_RPC)
    const engine = await start({
      options: {stateRoot: root},
      root,
      launchEditor: () => {},
      harness: createFakeHarness(),
      homeDir: tempDir('conciv-home-'),
    })
    onTestFinished(() => engine.stop())
    const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`

    expect((await makeRpcClient(base).plugin.list()).data.find((plugin) => plugin.id === 'deploy')).toMatchObject({
      id: 'deploy',
      source: {type: 'local', path: join(root, 'conciv', 'plugins', 'deploy')},
      state: {status: 'active'},
    })
    const sessionId = (await makeRpcClient(base).sessions.create(undefined)).sessionId
    expect(
      JSON.stringify(
        await executeOverMcp(
          base,
          {[CONCIV_SESSION_HEADER]: sessionId},
          "return await external_deploy_run({env: 'staging'})",
        ),
      ),
    ).toContain('https://staging.example.com')
    expect(
      await makeRpcClient(base).plugin.call(
        {rpcId: 'deploy', method: 'run', input: {env: 'prod'}},
        {signal: AbortSignal.timeout(5000)},
      ),
    ).toEqual({url: 'https://prod.example.com'})
    const mcp = await connectMcpClient(`${base}/api/mcp`, {[CONCIV_SESSION_HEADER]: sessionId})
    onTestFinished(() => mcp.close())
    expect(
      JSON.stringify(await (await mcp.tools()).find((entry) => entry.name === 'skill')?.execute?.({id: 'deploy'})),
    ).toContain('You can deploy from code mode with `external_deploy_run`.')
  })

  const LOOKALIKE = `export default {
  id: 'lookalike',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'open',
        description: 'Opens nothing',
        input: {type: 'object', properties: {}},
        execute: async () => ({content: 'the project plugin opened it'}),
      })
      tools.add({
        name: 'config',
        description: 'Reports the project config',
        input: {type: 'object', properties: {}},
        options: {namespace: 'server'},
        execute: async () => ({content: 'the project plugin config'}),
      })
    })
  },
}
`

  it("a project plugin's tool named like an engine tool replaces the engine's, as any later plugin tool replaces an earlier one", async () => {
    const root = tempDir('conciv-lookalike-')
    mkdirSync(join(root, 'conciv', 'plugins'), {recursive: true})
    writeFileSync(join(root, 'conciv', 'plugins', 'lookalike.ts'), LOOKALIKE)
    const opened: string[] = []
    const engine = await start({
      options: {stateRoot: root},
      root,
      launchEditor: (file) => opened.push(file),
      harness: createFakeHarness(),
      homeDir: tempDir('conciv-home-'),
    })
    onTestFinished(() => engine.stop())
    const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`
    const sessionId = (await makeRpcClient(base).sessions.create(undefined)).sessionId
    const run = async (code: string) =>
      JSON.stringify(await executeOverMcp(base, {[CONCIV_SESSION_HEADER]: sessionId}, code))

    expect.soft(await run("return await external_open({file: 'src/a.ts'})")).toContain('the project plugin opened it')
    expect.soft(opened).toEqual([])
    expect.soft(await run('return await external_server_config({})')).toContain('the project plugin config')
  })

  const LANTERN = (marks: string, look: string) => `import {appendFileSync} from 'node:fs'
import {z} from ${JSON.stringify(import.meta.resolve('zod'))}
import {Effect} from ${JSON.stringify(import.meta.resolve('effect'))}
import {Plugin} from ${JSON.stringify(import.meta.resolve('@conciv/plugin/effect'))}
import {Rpc} from ${JSON.stringify(import.meta.resolve('@conciv/plugin/rpc'))}

const Lantern = Rpc.define({
  id: 'lantern',
  methods: {look: {input: z.object({}), output: z.string()}},
  events: {lit: {schema: z.object({look: z.string()})}},
})

export default Plugin.define({
  id: 'lantern',
  effect: (ctx) =>
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.sync(() => appendFileSync(${JSON.stringify(marks)}, 'closed\\n')))
      const registration = yield* ctx.rpc.register(Lantern, {look: () => Effect.succeed('${look}')})
      yield* ctx.tool.transform((tools) =>
        tools.add({
          name: 'shine',
          description: 'Shines the lantern',
          input: z.object({}),
          options: {namespace: 'lantern'},
          execute: () => registration.events.emit('lit', {look: '${look}'}).pipe(Effect.as({content: 'shining ${look}'})),
        }),
      )
    }),
})
`

  const LIT_WATCHER = (seen: string) => `import {appendFileSync} from 'node:fs'

const record = async (events) => {
  for await (const event of events) appendFileSync(${JSON.stringify(seen)}, JSON.stringify(event) + '\\n')
}

export default {
  id: 'lit-watcher',
  async setup(ctx) {
    void record(ctx.event.subscribe({types: ['rpc.lantern.lit']}))
  },
}
`

  it('a plugin written on the Effect entry offers its tool and method, and its scope closes on reload and on unload', async () => {
    const root = tempDir('conciv-lantern-')
    const folder = join(root, 'conciv', 'plugins', 'lantern')
    const marks = join(root, 'marks.log')
    mkdirSync(folder, {recursive: true})
    const seen = join(root, 'seen.log')
    writeFileSync(join(folder, 'index.ts'), LANTERN(marks, 'first'))
    writeFileSync(join(root, 'conciv', 'plugins', 'lit-watcher.ts'), LIT_WATCHER(seen))
    const engine = await start({
      options: {stateRoot: root},
      root,
      launchEditor: () => {},
      harness: createFakeHarness(),
      homeDir: tempDir('conciv-home-'),
    })
    onTestFinished(() => engine.stop())
    const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`
    const rpc = makeRpcClient(base)
    const sessionId = (await rpc.sessions.create(undefined)).sessionId
    const shine = async () =>
      JSON.stringify(
        await executeOverMcp(base, {[CONCIV_SESSION_HEADER]: sessionId}, 'return await external_lantern_shine({})'),
      )
    const status = async () => (await rpc.plugin.list()).data.find((plugin) => plugin.id === 'lantern')?.state.status

    expect(await status()).toBe('active')
    expect(await shine()).toContain('shining first')
    await vi.waitFor(() => expect(existsSync(seen)).toBe(true), {timeout: 5000})
    expect(JSON.parse(readFileSync(seen, 'utf8'))).toEqual({
      id: expect.stringMatching(/^evt_/),
      type: 'rpc.lantern.lit',
      created: expect.any(Number),
      location: {directory: root},
      data: {look: 'first'},
    })
    expect(await call(base, 'lantern', 'look')).toBe('first')

    writeFileSync(join(folder, 'index.ts'), LANTERN(marks, 'second'))
    await vi.waitFor(async () => expect(await call(base, 'lantern', 'look')).toBe('second'), {timeout: 10_000})
    expect(readFileSync(marks, 'utf8')).toBe('closed\n')
    expect(await shine()).toContain('shining second')

    rmSync(folder, {recursive: true})
    await vi.waitFor(async () => expect(await status()).toBeUndefined(), {timeout: 10_000})
    await expect(call(base, 'lantern', 'look')).rejects.toThrow('RPC is unavailable: lantern')
    expect(readFileSync(marks, 'utf8')).toBe('closed\nclosed\n')
    await expect(shine()).rejects.toThrow("'external_lantern_shine' is not defined")
  })
})

describe('a plugin tool that asks, across a reload of its plugin', () => {
  const asker = (look: string, shape: 'asks' | 'gated' | 'gone') => `import {existsSync, watch} from 'node:fs'
import {join} from 'node:path'

const Asker = {id: 'asker', methods: {}, events: {loading: {schema: {type: 'object', properties: {look: {type: 'string'}}}}}}

const opened = (directory) =>
  new Promise((resolve) => {
    const gate = join(directory, 'asker-gate')
    const watcher = watch(directory, () => {
      if (!existsSync(gate)) return
      watcher.close()
      resolve()
    })
    if (!existsSync(gate)) return
    watcher.close()
    resolve()
  })

export default {
  id: 'asker',
  async setup(ctx) {
    const registration = await ctx.rpc.register(Asker, {})
    await registration.events.emit('loading', {look: '${look}'})
    if ('${shape}' === 'gone') return
    if ('${shape}' === 'gated') await opened(ctx.location.directory)
    await ctx.agent.transform((editor) =>
      editor.list().forEach((agent) => agent.permissions.push({action: 'asker_run', resource: '*', effect: 'ask'})),
    )
    await ctx.tool.transform((tools) =>
      tools.add({
        name: 'asker_run',
        description: 'Runs once the user agrees',
        input: {type: 'object', properties: {}},
        execute: async (_input, context) => {
          await ctx.permission.assert({action: 'asker_run', resources: ['now'], sessionId: context.sessionId, agent: context.agent})
          return {content: 'asker ran'}
        },
      }),
    )
  },
}
`

  async function askerEngine(first: 'asks' | 'gone' = 'asks') {
    const root = tempDir('conciv-asker-')
    const plugin = join(root, 'conciv', 'plugins', 'asker.ts')
    mkdirSync(dirname(plugin), {recursive: true})
    writeFileSync(plugin, asker('first', first))
    const harness = createFakeHarness()
    const engine = await bootAt(tempDir('conciv-asker-home-'), root, 'session', harness)
    onTestFinished(async () => {
      writeFileSync(join(root, 'asker-gate'), '')
      await engine.stop()
    })
    const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`
    const sessionId = (await makeRpcClient(base).sessions.create(undefined)).sessionId
    const events = await makeRpcClient(base).event.subscribe()
    onTestFinished(async () => {
      await events.return(undefined)
    })
    const next = async (type: string): Promise<unknown> => {
      const event = await events.next()
      if (event.done === true) return undefined
      if (event.value.type === type) return event.value.data
      return next(type)
    }
    const loading = async (look: string): Promise<void> => {
      const data = z.object({look: z.string()}).safeParse(await next('rpc.asker.loading'))
      if (data.success && data.data.look === look) return
      return loading(look)
    }
    const runs = new Array<string>()
    const turn = (runId: string) => {
      runs.push(runId)
      harness.script.scriptToolCall('execute_typescript', {typescriptCode: 'return await external_asker_run({})'})
      return sseTurn(base, sessionId, runId, 'run the asker', new AbortController().signal).then(sseStream)
    }
    const twoSteps = (runId: string, secondStep: string) => {
      runs.push(runId)
      harness.script.scriptToolCall('execute_typescript', {typescriptCode: "return ['the first', 'step'].join(' ')"})
      harness.script.scriptToolCall('execute_typescript', {typescriptCode: secondStep})
      return sseTurn(base, sessionId, runId, 'run the asker', new AbortController().signal).then(sseStream)
    }
    onTestFinished(async () => {
      await makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}}).chat.stop({sessionId, runIds: runs})
    })
    const askedOrEnded = (ended: Promise<string>) =>
      Promise.race([next('permission.asked'), ended.then((text) => ({endedWithoutAsking: text}))])
    const asking = {sessionId, action: 'asker_run', resources: ['now']}
    return {root, plugin, harness, turn, twoSteps, loading, askedOrEnded, asking}
  }

  const offeredCheck = "return ['asker is', typeof external_asker_run].join(' ')"

  it('a turn sent at once after the plugin is rewritten asks before the tool runs', async () => {
    const engine = await askerEngine()
    writeFileSync(engine.plugin, asker('second', 'asks'))
    const turn = await engine.turn('rewritten-run')
    expect(await engine.askedOrEnded(turn.ended())).toMatchObject(engine.asking)
  })

  it('a call that arrives while the plugin reloads waits for the reload, then asks', async () => {
    const engine = await askerEngine()
    engine.harness.script.holdTools()
    const turn = await engine.turn('reloading-run')
    expect(await turn.reach('fake.session-id')).toBe('fake.session-id')
    writeFileSync(engine.plugin, asker('second', 'gated'))
    await engine.loading('second')
    engine.harness.script.releaseTools()
    expect(await turn.reach('"toolCallName":"asker_run"')).toBe('"toolCallName":"asker_run"')
    writeFileSync(join(engine.root, 'asker-gate'), '')
    expect(await engine.askedOrEnded(turn.ended())).toMatchObject(engine.asking)
  })

  it('a turn whose plugin dropped the tool and its ask rule cannot run the tool from its old binding', async () => {
    const engine = await askerEngine()
    engine.harness.script.holdTools()
    const turn = await engine.turn('dropped-run')
    expect(await turn.reach('fake.session-id')).toBe('fake.session-id')
    writeFileSync(engine.plugin, asker('second', 'gone'))
    await engine.loading('second')
    engine.harness.script.releaseTools()
    const text = await turn.ended()
    expect(text).toMatch(/No tool named \W+asker_run\W+ is currently available/)
    expect(text).not.toContain('asker ran')
  })

  it('a tool a reload adds mid-turn is offered at the next model step of the same turn', async () => {
    const engine = await askerEngine('gone')
    engine.harness.script.holdTools()
    const turn = await engine.twoSteps('added-run', offeredCheck)
    expect(await turn.reach('fake.session-id')).toBe('fake.session-id')
    writeFileSync(engine.plugin, asker('second', 'asks'))
    await engine.loading('second')
    engine.harness.script.releaseTools()
    const text = await turn.ended()
    expect(text).toContain('the first step')
    expect(text).toContain('asker is function')
  })

  it('a tool a reload removes mid-turn is no longer offered at the next model step of the same turn', async () => {
    const engine = await askerEngine()
    engine.harness.script.holdTools()
    const turn = await engine.twoSteps('removed-run', offeredCheck)
    expect(await turn.reach('fake.session-id')).toBe('fake.session-id')
    writeFileSync(engine.plugin, asker('second', 'gone'))
    await engine.loading('second')
    engine.harness.script.releaseTools()
    const text = await turn.ended()
    expect(text).toContain('the first step')
    expect(text).toContain('asker is undefined')
  })
})

describe('a hub call while a turn is held in a plugin prompt hook', () => {
  it('a hub call made while a prompt hook holds a starting turn answers at once, and its record lands after the turn, in order', async () => {
    const entered = Promise.withResolvers<void>()
    const gate = Promise.withResolvers<void>()
    const holder = Plugin.define({
      id: 'prompt-holder',
      async setup(ctx) {
        await ctx.session.hook('prompt', async () => {
          entered.resolve()
          await gate.promise
        })
      },
    })
    const home = tempDir('conciv-prompt-held-home-')
    withHomeDb(home, (db) => recordHubConnection(db, 'codex', Date.now()))
    const engine = await bootAt(home, tempDir('conciv-prompt-held-'), 'open', createFakeHarness(), [holder])
    onTestFinished(() => engine.stop())
    const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`
    const sessionId = (await makeRpcClient(base).sessions.create(undefined)).sessionId
    const viewer = new AbortController()
    onTestFinished(() => {
      gate.resolve()
      viewer.abort()
    })
    const turn = sseTurn(base, sessionId, 'held-run', 'hold me in the prompt hook', viewer.signal)
    await entered.promise
    const tab = makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
    const hub = makeRpcClient(base, {
      headers: {[CONCIV_SESSION_HEADER]: sessionId, [CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: 'codex'},
    })
    expect(await hub.page.changes()).toEqual([])
    gate.resolve()
    expect(await sseStream(await turn).ended()).toContain('RUN_FINISHED')
    const {messages} = await tab.chat.hydrate({sessionId})
    expect(
      messages.flatMap((message) =>
        message.parts.flatMap((part) => {
          if (part.type === 'text') return [`${message.role} text ${part.content}`]
          if (part.type === 'tool-call') return [`${message.role} call ${part.name}`]
          if (part.type === 'tool-result') return [`${message.role} result ${part.content}`]
          return []
        }),
      ),
    ).toEqual([
      'user text hold me in the prompt hook',
      'assistant text ok',
      'assistant call page_changes',
      'assistant result []',
    ])
  })
})

describe('engine plugin bundles', () => {
  const server = (id: string) => `export default {id: '${id}', async setup() {}}
`
  const bundle = (label: string) => `module.exports = {default: {setup() { return () => '${label}' }}}
`

  it('an engine lists its configured plugins with their browser parts, serves each bundle by id and announces a rebuilt one', async () => {
    const root = tempDir('conciv-bundles-')
    for (const id of ['pane', 'plain']) {
      mkdirSync(join(root, id))
      writeFileSync(join(root, id, 'index.ts'), server(id))
    }
    writeFileSync(join(root, 'pane', 'plugin-experimental.js'), bundle('first'))
    const engine = await start({
      options: {stateRoot: root, plugins: [['./pane', {greeting: 'hi'}], './plain']},
      root,
      launchEditor: () => {},
      harness: createFakeHarness(),
      homeDir: tempDir('conciv-home-'),
    })
    onTestFinished(() => engine.stop())
    const rpc = makeRpcClient(`http://127.0.0.1:${engine.port}/t/${engine.agentToken}`)
    const options = {signal: AbortSignal.timeout(5000)}

    const listed = await rpc.plugin.list(undefined, options)
    expect(listed.location).toEqual({directory: root})
    expect(listed.data.find((plugin) => plugin.id === 'pane')).toEqual({
      id: 'pane',
      source: {type: 'local', path: join(root, 'pane')},
      features: {server: true, experimental: true},
      state: {status: 'active'},
    })
    expect(listed.data.find((plugin) => plugin.id === 'plain')?.features).toEqual({server: true})

    const first = await rpc.plugin.experimental({id: 'pane'}, options)
    expect(first.location).toEqual({directory: root})
    expect(first.data.code).toBe(bundle('first'))
    expect(first.data.options).toEqual({greeting: 'hi'})
    expect(first.data.revision).toMatch(/^[0-9a-f]{64}$/)
    expect(first.data.file).toBe('plugin-experimental.js')
    expect(PluginExperimentalBundleSchema.safeParse({...first.data, file: 'plugin-experimental.ts'}).success).toBe(
      false,
    )
    expect(typeof evaluatePluginBundle(first.data.code, {require: () => ({})}).setup).toBe('function')

    for (const id of ['nobody', 'plain']) {
      await expect(rpc.plugin.experimental({id}, options)).rejects.toMatchObject({
        code: 'PLUGIN_NOT_FOUND',
        status: 404,
        data: {pluginId: id, message: `No active plugin with a ./plugin-experimental bundle: ${id}`},
      })
    }
    await expect(rpc.plugin.experimentalChunk({id: 'pane', file: 'x.cjs'}, options)).rejects.toMatchObject({
      code: 'PLUGIN_CHUNK_NOT_FOUND',
      status: 404,
      data: {pluginId: 'pane', file: 'x.cjs'},
    })
    await expect(rpc.plugin.experimentalChunk({id: 'nobody', file: 'x.cjs'}, options)).rejects.toMatchObject({
      code: 'PLUGIN_NOT_FOUND',
      data: {pluginId: 'nobody'},
    })
    for (const file of ['../package.json', '/x.cjs', 'plugin-experimental.js', `${'a'.repeat(253)}.cjs`])
      await expect(rpc.plugin.experimentalChunk({id: 'pane', file}, options)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })

    const listening = new AbortController()
    onTestFinished(() => listening.abort())
    const changes = await rpc.event.subscribe({types: ['plugin.updated']}, {signal: listening.signal})
    expect(await changes.next()).toEqual({
      done: false,
      value: {id: expect.stringMatching(/^evt_/), type: 'server.connected', data: {}},
    })
    const updated = {
      id: expect.stringMatching(/^evt_/),
      type: 'plugin.updated',
      created: expect.any(Number),
      location: {directory: root},
      data: {},
    }
    const rebuilt = async (label: string) => {
      writeFileSync(join(root, 'pane', 'plugin-experimental.js'), bundle(label))
      expect(await nextEvent(changes)).toEqual({done: false, value: updated})
      return (await rpc.plugin.experimental({id: 'pane'}, {signal: AbortSignal.timeout(5000)})).data
    }
    const second = await rebuilt('second')
    expect(second.code).toBe(bundle('second'))
    expect(second.revision).not.toBe(first.data.revision)
    writeFileSync(join(root, 'pane', 'plugin-experimental.js'), bundle('third'))
    expect(await nextEvent(changes)).toEqual({done: false, value: updated})
    const cancelled = nextEvent(changes)
    const third = (await rpc.plugin.experimental({id: 'pane'}, {signal: AbortSignal.timeout(5000)})).data
    expect(third.code).toBe(bundle('third'))
    expect(third.revision).not.toBe(second.revision)
    await changes.return()
    await expect(cancelled).rejects.toMatchObject({name: 'AbortError', message: 'Stream was cancelled'})
    expect(await changes.next()).toEqual({done: true, value: undefined})
  })
})

describe('page connection', () => {
  const tabId = `tab_${crypto.randomUUID()}`
  const tab: Page.Tab = {id: tabId, url: 'https://example.com/', title: 'Example', focused: true, visible: true}

  const HELPER_FIXTURE = `const LOOK = 'first look'

const Helper = {
  id: 'helper',
  methods: {look: {input: {type: 'object'}, output: {type: 'string'}}},
  events: {loaded: {schema: {type: 'object', properties: {look: {type: 'string'}}}}},
}

export default {
  id: 'helper',
  async setup(ctx) {
    await ctx.agent.transform((editor) =>
      editor.list().forEach((agent) => agent.permissions.push({action: '*', resource: '*', effect: 'allow'})),
    )
    const registration = await ctx.rpc.register(Helper, {look: async () => LOOK})
    await registration.events.emit('loaded', {look: LOOK})
  },
}
`

  const TAB_FIXTURE = `import {Definition} from '${fileURLToPath(import.meta.resolve('@conciv/plugin-page/rpc'))}'

const method = {input: {type: 'object'}, output: {type: 'object'}}
const Tabs = {
  id: 'page-tabs',
  methods: {open: method, close: method, report: method, next: method, reply: method, cancels: method, permissions: method, tool: method, asked: method, waiting: method, decide: method, ended: method, finished: method, operate: method},
  events: {},
}

export default {
  id: 'page-tabs',
  async setup(ctx) {
    const page = ctx.rpc(Definition)
    const open = new Map()
    const received = []
    const cancelled = []
    const arrived = new EventTarget()
    const stop = new AbortController()
    const asks = []
    const finished = []
    const follow = async () => {
      for await (const event of ctx.event.subscribe({types: ['permission.asked'], signal: stop.signal})) {
        const {id, sessionId, action, resources} = event.data
        asks.push({id, sessionId, action, resources})
        arrived.dispatchEvent(new CustomEvent('control', {detail: {type: 'asked'}}))
      }
    }
    follow().catch(() => {})
    page.events.on('control', async (event) => {
      const control = event.data
      if (control.type === 'cancel') cancelled.push(control.requestId)
      if (control.type === 'command') {
        const tab = open.get(control.connectionId)
        const command = await page.command({sessionId: tab.sessionId, connectionId: control.connectionId, requestId: control.requestId})
        received.push({connectionId: control.connectionId, requestId: control.requestId, command})
      }
      arrived.dispatchEvent(new CustomEvent('control', {detail: control}))
    }, {signal: stop.signal})
    page.events.on('queue.finished', (event) => {
      finished.push(event.data)
      arrived.dispatchEvent(new CustomEvent('control', {detail: {type: 'finished'}}))
    }, {signal: stop.signal})
    const until = async (found) => {
      for (;;) {
        const value = found()
        if (value) return value
        await new Promise((resolve) => arrived.addEventListener('control', resolve, {once: true}))
      }
    }
    await ctx.rpc.register(Tabs, {
      open: async ({sessionId, connectionId}) => {
        const controller = new AbortController()
        const ended = page.attach({sessionId, connectionId, version: 1}, {signal: controller.signal}).then(
          (outcome) => ({outcome}),
          (error) => ({error: error.message ?? String(error)}),
        )
        open.set(connectionId, {sessionId, controller, ended})
        const attached = new Promise((resolve) =>
          arrived.addEventListener('control', function listen(event) {
            if (event.detail.type !== 'attached' || event.detail.connectionId !== connectionId) return
            arrived.removeEventListener('control', listen)
            resolve({attached: true})
          }),
        )
        return Promise.race([attached, ended])
      },
      close: async ({connectionId}) => {
        const tab = open.get(connectionId)
        tab.controller.abort()
        await tab.ended
        return {closed: true}
      },
      report: async ({sessionId, connectionId, tab}) => {
        await page.state({sessionId, connectionId, state: tab})
        return {}
      },
      next: async ({connectionId}) => {
        const found = await until(() => received.find((entry) => entry.connectionId === connectionId))
        received.splice(received.indexOf(found), 1)
        return found
      },
      reply: async ({sessionId, connectionId, requestId, outcome}) =>
        page.result({sessionId, connectionId, requestId, outcome}).then(
          () => ({}),
          (error) => ({error: error.message}),
        ),
      cancels: async ({requestId}) => {
        await until(() => cancelled.includes(requestId))
        return {}
      },
      permissions: async ({sessionId}) => ({permissions: (await ctx.session.get({sessionId})).permissions ?? []}),
      asked: async () => until(() => asks.shift()),
      waiting: async () => ({waiting: asks.length}),
      finished: async () => until(() => finished.shift()),
      ended: async ({connectionId}) => open.get(connectionId).ended,
      decide: async ({sessionId, requestId, decision}) => {
        await ctx.permission.reply({sessionId, requestId, decision})
        return {}
      },
      operate: async (input, call) =>
        page.operate(input, {signal: call.signal}).then(
          (value) => ({ok: true, value}),
          (error) => ({ok: false, type: error.type, message: error.message, data: error.data ?? null}),
        ),
      tool: async ({sessionId, name, input, id}, call) => {
        const found = (await ctx.tool.list()).find((entry) => [entry.options?.namespace, entry.name].join('.') === 'page.' + name)
        try {
          const result = await found.execute(input, {sessionId, agent: 'build', messageId: undefined, id: id ?? 'call_' + crypto.randomUUID(), signal: call.signal, progress: async () => {}})
          return {ok: true, value: result.output ?? null}
        } catch (error) {
          return {ok: false, message: error.message, metadata: error.metadata ?? null}
        }
      },
    })
    return () => stop.abort()
  },
}
`

  const Received = z.object({connectionId: z.string(), requestId: z.string(), command: Page.Command})
  const SOURCE_MAP = Buffer.from(
    JSON.stringify({version: 3, sources: ['app/page.tsx'], names: [], mappings: ';AAgBI'}),
  ).toString('base64')
  const CHUNK = [
    'render()',
    'mount()',
    ['//#', `sourceMappingURL=data:application/json;base64,${SOURCE_MAP}`].join(' '),
  ].join('\n')
  const Asked = z.object({id: z.string(), sessionId: z.string(), action: z.string(), resources: z.array(z.string())})
  const Answer = z.union([
    z.object({ok: z.literal(true), value: z.unknown()}),
    z.object({ok: z.literal(false), message: z.string(), metadata: z.unknown()}),
  ])

  it('tabs attach, a call goes to the tab named or focused last, a lost tab resends only reading calls, timeouts and aborts cancel on the page, changing calls queue, the grant lives while a tab does, a call runs through the page tools, eval asks on every call and an answer saves no rule for a later eval, locate and symbolicate answer with the source file, a declared page error keeps its code, a queue plays its actions as commands of their own before a later call, changing calls journal and captures keep their tool call, the terminal runs an action through registry.call with its own id per call, deleting the session ends its tabs and drops its records, and a tab attaching to a never-seen id is refused and makes no session, then attaches once a first send makes it, while one on a deleted id is refused and nothing comes back, and a plugin operation runs on the tab through page.operate: with no tab a changing one fails, a reading one is resent once to the next tab, its value and raised error come back, and a closed tab or a deleted session ends one in flight as gone', async () => {
    const [home, root] = [tempDir('conciv-home-'), tempDir('conciv-page-connection-')]
    const files = {'tabs/server.ts': TAB_FIXTURE, 'conciv/plugins/helper.ts': HELPER_FIXTURE, 'chunk.js': CHUNK}
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), {recursive: true})
      writeFileSync(join(root, path), content)
    }
    const harness = createFakeHarness({id: 'page-connection'})
    const engine = await start({
      options: {stateRoot: root, hubAccess: 'session', plugins: ['./tabs']},
      root,
      launchEditor: () => {},
      harness,
      homeDir: home,
    })
    onTestFinished(async () => {
      await engine.stop()
      rmSync(root, {recursive: true, force: true})
      rmSync(home, {recursive: true, force: true})
    })
    const rpc = makeRpcClient(`http://127.0.0.1:${engine.port}/t/${engine.agentToken}`)
    const session = SessionId.parse((await rpc.sessions.resolve({})).sessionId)
    const call = (rpcId: string, method: string, input: Record<string, unknown>, signal?: AbortSignal) =>
      rpc.plugin
        .call({rpcId, method, input}, {signal: signal ?? AbortSignal.timeout(15_000)})
        .catch((error: unknown) => {
          throw new Error(`${rpcId}.${method} failed`, {cause: error})
        })
    const tabs = (method: string, input: Record<string, unknown>) => call('page-tabs', method, input)
    const ask = ({type, ...input}: Page.Action, signal?: AbortSignal) =>
      call('page-tabs', 'tool', {sessionId: session, name: type, input}, signal).then((answer) => Answer.parse(answer))
    const next = async (connectionId: string) => Received.parse(await tabs('next', {connectionId}))
    const reply = (connectionId: string, requestId: string, outcome: Page.Outcome) =>
      tabs('reply', {sessionId: session, connectionId, requestId, outcome})
    const succeeded = (value: Page.Result['value']): Page.Outcome => ({type: 'success', result: {value, files: []}})
    const routed = (href: string) => succeeded({pathname: href, search: '', href, title: 'Example', state: 'visible'})
    const granted = async () =>
      z
        .object({permissions: z.array(z.object({action: z.string(), effect: z.string()}))})
        .parse(await tabs('permissions', {sessionId: session}))
        .permissions.filter((rule) => rule.action === 'page' && rule.effect === 'allow')

    const offered = async () => {
      const mcp = await connectMcpClient(`http://127.0.0.1:${engine.port}/t/${engine.agentToken}/api/mcp`, {
        [CONCIV_SESSION_HEADER]: session,
      })
      try {
        const tool = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
        if (!tool) throw new Error('execute_typescript not on /api/mcp')
        const listed = await tool.execute({
          typescriptCode: 'return Object.keys(globalThis).filter((key) => key.startsWith("external_page_"))',
        })
        const names = z.object({result: z.array(z.string())}).parse(JSON.parse(String(listed))).result
        return {names: names.toSorted(), line: /^- page \(\d+ tools/m.exec(tool.description ?? '')?.[0]}
      } finally {
        await mcp.close()
      }
    }
    expect(await call('helper', 'look', {})).toBe('first look')
    expect(await offered()).toEqual({names: [], line: undefined})
    const decide = async (code: string, decision: string) => {
      const asked = Asked.parse(await tabs('asked', {}))
      expect(asked).toMatchObject({sessionId: session, action: 'page_eval', resources: [code]})
      await tabs('decide', {sessionId: session, requestId: asked.id, decision})
    }
    const refusedBeforeReload = ask({type: 'eval', code: 'document.domain'})
    await decide('document.domain', 'reject')
    expect(await refusedBeforeReload).toMatchObject({ok: false})
    const reloads = await rpc.event.subscribe()
    writeFileSync(
      join(root, 'conciv', 'plugins', 'helper.ts'),
      HELPER_FIXTURE.replace("const LOOK = 'first look'", "const LOOK = 'second look'"),
    )
    const reloaded = async (): Promise<unknown> => {
      const loaded = await reloads.next()
      if (loaded.done === true) return loaded
      if (loaded.value.type === 'rpc.helper.loaded') return loaded.value.data
      return reloaded()
    }
    expect(await reloaded()).toEqual({look: 'second look'})
    await reloads.return(undefined)
    const afterReload = await sseTurn(
      `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`,
      (await rpc.sessions.create(undefined)).sessionId,
      'after-reload',
      'read the domain',
    )
    await afterReload.text()
    const refusedAfterReload = ask({type: 'eval', code: 'document.domain'})
    await decide('document.domain', 'reject')
    expect(await refusedAfterReload).toMatchObject({ok: false})
    const neverSeen = SessionId.parse('conciv_missing')
    expect(await tabs('open', {sessionId: neverSeen, connectionId: 'conn_x'})).toEqual({
      error: `session "${neverSeen}" does not exist`,
    })
    await expect(rpc.sessions.get({sessionId: neverSeen})).rejects.toMatchObject({code: 'NOT_FOUND'})
    expect((await rpc.sessions.list(undefined)).sessions.map((meta) => meta.id)).not.toContain(neverSeen)
    await (await sseTurn(`http://127.0.0.1:${engine.port}/t/${engine.agentToken}`, neverSeen, 'born', 'hello')).text()
    expect(await tabs('open', {sessionId: neverSeen, connectionId: 'conn_x'})).toEqual({attached: true})
    expect(await tabs('close', {connectionId: 'conn_x'})).toEqual({closed: true})
    expect(await ask({type: 'route'})).toMatchObject({
      ok: false,
      message: expect.stringContaining('[page.disconnected]'),
    })
    await expect(
      registryCall(`http://127.0.0.1:${engine.port}/t/${engine.agentToken}`, session)('page_route', {}),
    ).rejects.toMatchObject({code: 'NO_PAGE_CLIENT', message: 'page_route: no widget connected to session'})

    expect(await tabs('open', {sessionId: session, connectionId: 'conn_a'})).toEqual({attached: true})
    expect(await granted()).toHaveLength(1)
    const second = `tab_${crypto.randomUUID()}`
    await tabs('report', {sessionId: session, connectionId: 'conn_a', tab})
    const attachedTools = {
      names: [
        'external_page_addclass',
        'external_page_attr',
        'external_page_check',
        'external_page_click',
        'external_page_console',
        'external_page_css',
        'external_page_dom',
        'external_page_effect',
        'external_page_eval',
        'external_page_exists',
        'external_page_fill',
        'external_page_fill_form',
        'external_page_find',
        'external_page_hmr',
        'external_page_hover',
        'external_page_insert',
        'external_page_inspect',
        'external_page_locate',
        'external_page_override',
        'external_page_press',
        'external_page_query',
        'external_page_queue',
        'external_page_queue_async',
        'external_page_reload',
        'external_page_remove',
        'external_page_removeattr',
        'external_page_removeclass',
        'external_page_route',
        'external_page_screenshot',
        'external_page_scroll',
        'external_page_select',
        'external_page_setattr',
        'external_page_sethtml',
        'external_page_setstyle',
        'external_page_settext',
        'external_page_snapshot',
        'external_page_submit',
        'external_page_tabs_list',
        'external_page_text',
        'external_page_track',
        'external_page_tree',
        'external_page_uncheck',
        'external_page_value',
        'external_page_wait',
      ],
      line: '- page (44 tools',
    }
    expect(await offered()).toEqual(attachedTools)
    expect(await tabs('open', {sessionId: session, connectionId: 'conn_b'})).toEqual({attached: true})
    await tabs('report', {sessionId: session, connectionId: 'conn_b', tab: {...tab, id: second, focused: false}})
    expect(await ask({type: 'tabs.list'})).toEqual({
      ok: true,
      value: {tabs: [tab, {...tab, id: second, focused: false}], focusedTabId: tabId},
    })

    const focused = ask({type: 'route'})
    const onA = await next('conn_a')
    expect(onA.command).toEqual({
      action: {type: 'route'},
      agentId: 'build',
      timeoutMs: 5000,
    })
    expect(await reply('conn_a', onA.requestId, {type: 'failure', code: 'timeout', message: 'forged'})).toEqual({
      error: 'The page cannot report timeout; only the engine does.',
    })
    await reply('conn_a', onA.requestId, routed('/a'))
    expect(await focused).toMatchObject({ok: true, value: {href: '/a'}})

    const named = ask({type: 'text', tabId: second, selector: 'h1'})
    const onB = await next('conn_b')
    expect(onB.command.action).toEqual({type: 'text', tabId: second, selector: 'h1'})
    await reply('conn_b', onB.requestId, succeeded({text: 'Hi'}))
    expect(await named).toEqual({ok: true, value: {text: 'Hi'}})

    const moved = ask({type: 'snapshot'})
    const lost = await next('conn_a')
    expect(await tabs('close', {connectionId: 'conn_a'})).toEqual({closed: true})
    const resent = await next('conn_b')
    expect(resent.requestId).not.toBe(lost.requestId)
    await reply('conn_b', resent.requestId, succeeded({nodes: []}))
    expect(await moved).toEqual({ok: true, value: {nodes: []}})
    expect(await granted()).toHaveLength(1)

    const waiting = ask({type: 'route'})
    await next('conn_b')
    await tabs('close', {connectionId: 'conn_b'})
    expect(await tabs('open', {sessionId: session, connectionId: 'conn_c'})).toEqual({attached: true})
    const returned = await next('conn_c')
    await reply('conn_c', returned.requestId, routed('/c'))
    expect(await waiting).toMatchObject({ok: true, value: {href: '/c'}})

    const first = ask({type: 'click', selector: '#one'})
    const firstOnC = await next('conn_c')
    const queued = ask({type: 'click', selector: '#two'})
    const reading = ask({type: 'route'})
    const readFirst = await next('conn_c')
    expect(readFirst.command.action).toEqual({type: 'route'})
    await reply('conn_c', readFirst.requestId, routed('/c'))
    expect(await reading).toMatchObject({ok: true, value: {href: '/c'}})
    await reply('conn_c', firstOnC.requestId, succeeded({ok: true}))
    expect(await first).toEqual({ok: true, value: {ok: true}})
    const secondOnC = await next('conn_c')
    expect(secondOnC.command.action).toEqual({type: 'click', selector: '#two'})

    expect(await tabs('close', {connectionId: 'conn_c'})).toEqual({closed: true})
    expect(await queued).toMatchObject({ok: false, message: expect.stringContaining('the action may already have run')})
    expect(await granted()).toHaveLength(0)
    expect(await offered()).toEqual({names: [], line: undefined})
    const operate = (input: Record<string, unknown>) => tabs('operate', {sessionId: session, ...input})
    expect(await operate({name: 'count', input: {n: 1}, reading: false})).toMatchObject({
      ok: false,
      type: 'failed',
      data: {code: 'disconnected'},
    })
    expect(await tabs('open', {sessionId: session, connectionId: 'conn_o'})).toEqual({attached: true})
    const counting = operate({name: 'count', input: {n: 1}, reading: true})
    const onO = await next('conn_o')
    expect(onO.command.action).toEqual({type: 'operation', name: 'count', input: {n: 1}})
    expect(await tabs('close', {connectionId: 'conn_o'})).toEqual({closed: true})
    expect(await tabs('open', {sessionId: session, connectionId: 'conn_p'})).toEqual({attached: true})
    const resentOnP = await next('conn_p')
    expect(resentOnP.command.action).toEqual({type: 'operation', name: 'count', input: {n: 1}})
    expect(await tabs('close', {connectionId: 'conn_p'})).toEqual({closed: true})
    expect(await counting).toMatchObject({ok: false, type: 'tab_gone', data: {dispatched: true}})
    expect(await tabs('open', {sessionId: session, connectionId: 'conn_s'})).toEqual({attached: true})
    const bumping = operate({name: 'bump', input: {by: 2}, reading: false})
    const onBump = await next('conn_s')
    await reply('conn_s', onBump.requestId, succeeded({count: 3}))
    expect(await bumping).toEqual({ok: true, value: {count: 3}})
    const raising = operate({name: 'bump', input: {by: -1}, reading: false})
    const onRaise = await next('conn_s')
    await reply('conn_s', onRaise.requestId, {
      type: 'failure',
      code: 'raised',
      message: 'negative',
      raised: {code: 'NEGATIVE', message: 'negative'},
    })
    expect(await raising).toMatchObject({
      ok: false,
      type: 'failed',
      data: {code: 'raised', raised: {code: 'NEGATIVE', message: 'negative'}},
    })
    const denying = operate({name: 'bump', input: {by: 0}, reading: false})
    const onDeny = await next('conn_s')
    await reply('conn_s', onDeny.requestId, {type: 'failure', code: 'plugin.denied', message: 'not for this plugin'})
    expect(await denying).toMatchObject({ok: false, type: 'failed', data: {code: 'plugin.denied'}})
    const orphaned = operate({name: 'bump', input: {by: 1}, reading: false})
    await next('conn_s')
    expect(await tabs('close', {connectionId: 'conn_s'})).toEqual({closed: true})
    expect(await orphaned).toMatchObject({ok: false, type: 'tab_gone', data: {dispatched: true}})
    expect(await tabs('open', {sessionId: session, connectionId: 'conn_d'})).toEqual({attached: true})
    const afterChange = ask({type: 'route'})
    const firstOnD = await next('conn_d')
    expect(firstOnD.command.action).toEqual({type: 'route'})
    await reply('conn_d', firstOnD.requestId, routed('/d'))
    expect(await afterChange).toMatchObject({ok: true, value: {href: '/d'}})

    const silent = ask({type: 'wait', selector: 'body', timeout: 100})
    const unanswered = await next('conn_d')
    expect(unanswered.command.timeoutMs).toBe(1100)
    expect(await silent).toMatchObject({ok: false, message: expect.stringContaining('[page.timeout] page.wait')})
    await tabs('cancels', {requestId: unanswered.requestId})

    const abort = new AbortController()
    const aborted = ask({type: 'route'}, abort.signal)
    const dropped = await next('conn_d')
    abort.abort()
    await expect(aborted).rejects.toThrow()
    await tabs('cancels', {requestId: dropped.requestId})

    const refused = ask({type: 'eval', code: 'document.cookie'})
    await decide('document.cookie', 'reject')
    expect(await refused).toMatchObject({ok: false})
    const always = ask({type: 'eval', code: 'document.title'})
    await decide('document.title', 'always')
    const onEval = await next('conn_d')
    expect(onEval.command.action).toEqual({type: 'eval', code: 'document.title'})
    await reply('conn_d', onEval.requestId, succeeded({result: 'Example'}))
    expect(await always).toEqual({ok: true, value: {result: 'Example'}})
    await expect(
      registryCall(`http://127.0.0.1:${engine.port}/t/${engine.agentToken}`, session)('page_eval', {
        code: 'location.href',
      }),
    ).rejects.toMatchObject({
      code: 'APPROVAL_DENIED',
      message: `Tool "page_eval" needs the user's approval. The request is shown to the user; retry once they approve it.`,
    })
    const askedAgain = ask({type: 'eval', code: 'location.href'})
    await decide('location.href', 'once')
    const again = await next('conn_d')
    expect(again.command.action).toEqual({type: 'eval', code: 'location.href'})
    await reply('conn_d', again.requestId, succeeded({result: 'Example'}))
    expect(await askedAgain).toEqual({ok: true, value: {result: 'Example'}})
    expect(await tabs('waiting', {})).toEqual({waiting: 0})

    const locating = ask({type: 'locate', selector: 'h1'})
    const onLocate = await next('conn_d')
    await reply('conn_d', onLocate.requestId, succeeded({frames: [{fileName: 'chunk.js', line: 2, column: 1}]}))
    expect(await locating).toMatchObject({ok: true, value: {source: {file: 'app/page.tsx', line: 17, column: 4}}})
    const frames = [{fileName: 'chunk.js', line: 2, column: 1}]
    expect(await call('experimental.page', 'symbolicate', {frames})).toEqual({
      file: 'app/page.tsx',
      line: 17,
      column: 4,
    })
    expect(await call('experimental.page', 'symbolicate', {frames: [{fileName: '../outside.js', line: 1}]})).toBeNull()

    const effecting = ask({type: 'effect', action: 'enable', effect: 'confetti'})
    const onEffect = await next('conn_d')
    await reply('conn_d', onEffect.requestId, {
      type: 'failure',
      code: 'raised',
      message: 'effect failed',
      raised: {code: 'UNKNOWN_EFFECT', message: ''},
    })
    expect(await effecting).toEqual({
      ok: false,
      message: 'no effect is registered under that name',
      metadata: {code: 'UNKNOWN_EFFECT'},
    })

    const page = (method: string, input = {}) => call('experimental.page', method, {sessionId: session, ...input})
    const descriptor = {tagName: 'H1', selectorPath: 'h1'}
    const before = {kind: 'before' as const, ts: 1, descriptor}
    const after = {kind: 'after' as const, ts: 2, descriptor, cssBundleId: 'css_1'}
    const edited = call('page-tabs', 'tool', {
      sessionId: session,
      name: 'settext',
      input: {selector: 'h1', text: 'Hello'},
      id: 'call_settext',
    })
    const onEdit = await next('conn_d')
    await reply('conn_d', onEdit.requestId, {
      type: 'success',
      result: {value: {ok: true}, files: [], capture: {before, after, cssBundles: [{hash: 'css_1', css: 'h1{}'}]}},
    })
    expect(await edited).toEqual({ok: true, value: {ok: true}})
    expect(await page('changes')).toMatchObject([
      {seq: 1, verb: 'page_click', selector: '#one', args: {}},
      {seq: 2, verb: 'page_eval', args: {code: 'document.title'}},
      {seq: 3, verb: 'page_eval', args: {code: 'location.href'}},
      {seq: 4, verb: 'page_settext', selector: 'h1', args: {text: 'Hello'}},
    ])
    const captured = {
      captures: [
        {toolCallId: 'call_settext', kind: 'before', capture: before},
        {toolCallId: 'call_settext', kind: 'after', capture: after},
      ],
      cssBundles: {css_1: 'h1{}'},
    }
    expect(await page('captures.list')).toEqual(captured)
    expect(await page('clearChanges')).toEqual({ok: true})
    expect(await page('changes')).toEqual([])

    const actions = [
      {tool: 'page_fill', selector: '#a', value: 'Ada'},
      {tool: 'page_click', selector: '#go'},
    ]
    const following = await rpc.chat.events({sessionId: session}, {signal: AbortSignal.timeout(15_000)})
    const queueing = call('page-tabs', 'tool', {sessionId: session, name: 'queue_async', input: {actions}, id: 'q1'})
    const accepting = await next('conn_d')
    const queueId = accepting.command.queued?.id ?? ''
    expect(accepting.command).toMatchObject({action: {type: 'queue', actions}, queued: {index: -1, of: 2}})
    expect(await queueing).toEqual({ok: true, value: {queueId, actions: 2}})
    const single = ask({type: 'click', selector: '#after'})
    await reply('conn_d', accepting.requestId, succeeded({queueId, status: 'playing', done: 0, of: 2}))
    const firstQueued = await next('conn_d')
    expect(firstQueued.command).toMatchObject({action: {type: 'fill', value: 'Ada'}, queued: {id: queueId, index: 0}})
    expect(await page('queue.startedBy', {toolCallIds: ['q1']})).toEqual([{queueId, actions: 2}])
    await reply('conn_d', firstQueued.requestId, succeeded({ok: true, value: 'Ada'}))
    const secondQueued = await next('conn_d')
    expect(secondQueued.command.queued).toEqual({id: queueId, index: 1, of: 2})
    await reply('conn_d', secondQueued.requestId, {type: 'failure', code: 'invalid-args', message: 'no #go'})
    const afterQueue = await next('conn_d')
    expect(afterQueue.command.action).toEqual({type: 'click', selector: '#after'})
    await reply('conn_d', afterQueue.requestId, succeeded({ok: true}))
    expect(await single).toEqual({ok: true, value: {ok: true}})
    const outcomes = [
      {index: 0, tool: 'page_fill', ok: true, result: {ok: true, value: 'Ada'}},
      {index: 1, tool: 'page_click', ok: false, error: '[page.invalid-args] no #go'},
    ]
    const result = {queueId, status: 'finished', outcomes, failed: 1, played: 2}
    expect(await tabs('finished', {})).toEqual({sessionId: session, queueId, toolCallId: 'q1', result})
    const followUpRun = async (): Promise<string> => {
      const step = await following.next()
      if (step.done === true) throw new Error('the chat events ended before the follow-up turn started')
      return sessionRunEvent.parse(step.value)?.runId ?? followUpRun()
    }
    const runId = await followUpRun()
    await following.return?.()
    const joined = webSocket(`ws://127.0.0.1:${engine.port}/t/${engine.agentToken}${CHAT_WS_PATH}`)
    for await (const chunk of joined.joinRun(runId, AbortSignal.timeout(15_000))) {
      if (chunk.type === ChatEventType.RUN_ERROR) break
      if (chunk.type === ChatEventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls') break
    }
    const hydrated = await rpc.chat.hydrate({sessionId: session})
    const replies = hydrated.messages
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.parts)
      .filter((part) => part.type === 'text')
    expect(replies).toEqual([{type: 'text', content: 'ok'}])
    expect(hydrated.activeRun).toBeNull()
    expect(await page('queue.owed', {excludeToolCallIds: [], claim: false})).toEqual([])
    expect(await page('queue.undelivered', {toolCallIds: ['q1']})).toEqual([])
    expect(await page('queue.wait', {queueId, waitMs: 0})).toEqual(result)
    expect(await page('changes')).toMatchObject([
      {verb: 'page_fill', selector: '#a', args: {value: 'Ada'}},
      {verb: 'page_click', selector: '#after'},
    ])

    const shot = ask({type: 'screenshot'})
    const onShot = await next('conn_d')
    const image = {id: `file_${crypto.randomUUID()}`, name: 'screenshot.webp', mime: 'image/webp', data: ONE_PIXEL_WEBP}
    await tabs('reply', {
      sessionId: session,
      connectionId: 'conn_d',
      requestId: onShot.requestId,
      outcome: {type: 'success', result: {value: {width: 800, height: 600}, files: [image]}},
    })
    const saved = z
      .object({
        ok: z.literal(true),
        value: z.object({width: z.number(), files: z.array(z.looseObject({path: z.string()}))}),
      })
      .parse(await shot)
    expect(saved.value).toMatchObject({width: 800, files: [{id: image.id, mime: 'image/webp', bytes: 550}]})
    expect(await readFile(join(root, saved.value.files[0]?.path ?? ''), 'base64')).toBe(ONE_PIXEL_WEBP)

    const stranded = ask({type: 'wait', selector: 'body', timeout: 100})
    await next('conn_d')
    await tabs('close', {connectionId: 'conn_d'})
    expect(await stranded).toMatchObject({
      ok: false,
      message: expect.stringContaining('the action may already have run'),
    })

    expect(await tabs('open', {sessionId: session, connectionId: 'conn_q'})).toEqual({attached: true})
    const clicks = ['#slow', '#gone'].map((selector) => ({tool: 'page_click', selector}))
    await call('page-tabs', 'tool', {sessionId: session, name: 'queue_async', input: {actions: clicks}, id: 'q2'})
    const stranding = await next('conn_q')
    const strandedId = stranding.command.queued?.id ?? ''
    await reply('conn_q', stranding.requestId, succeeded({queueId: strandedId, status: 'playing', done: 0, of: 2}))
    await next('conn_q')
    expect((await next('conn_q')).command.queued).toEqual({id: strandedId, index: 1, of: 2})
    await tabs('close', {connectionId: 'conn_q'})
    const lines = ['the page did not confirm page_click in time', 'the page reloaded or closed during page_click']
    expect(await page('queue.wait', {queueId: strandedId, waitMs: 5000})).toMatchObject({
      status: 'lost',
      outcomes: lines.map((text) => ({tool: 'page_click', ok: false, error: `${text}; it may already have run`})),
    })

    expect(await tabs('open', {sessionId: session, connectionId: 'conn_e'})).toEqual({attached: true})
    const ending = tabs('ended', {connectionId: 'conn_e'})
    await tabs('report', {sessionId: session, connectionId: 'conn_e', tab})
    expect(await page('captures.list')).toEqual(captured)
    const ran = registryCall(`http://127.0.0.1:${engine.port}/t/${engine.agentToken}`, session)
    const evaluated = ran('page_text', {selector: 'h1'})
    const onRun = await next('conn_e')
    expect(onRun.command).toEqual({
      action: {type: 'text', selector: 'h1'},
      agentId: 'build',
      timeoutMs: 5000,
    })
    await reply('conn_e', onRun.requestId, succeeded({text: 'a=1'}))
    expect(await evaluated).toEqual({text: 'a=1'})
    expect(await tabs('waiting', {})).toEqual({waiting: 0})
    for (const text of ['One', 'Two']) {
      const editing = ran('page_settext', {selector: 'h1', text})
      const onRunEdit = await next('conn_e')
      await reply('conn_e', onRunEdit.requestId, {
        type: 'success',
        result: {value: {ok: true}, files: [], capture: {before, after, cssBundles: []}},
      })
      expect(await editing).toEqual({ok: true})
    }
    const ranCaptures = Page.Definition.methods['captures.list'].output
      .parse(await page('captures.list'))
      .captures.filter((entry) => entry.toolCallId !== 'call_settext')
    const ranIds = uniq(ranCaptures.map((entry) => entry.toolCallId))
    expect(ranCaptures).toHaveLength(4)
    expect(ranIds).toHaveLength(2)
    expect(ranIds).toEqual(ranIds.map(() => expect.stringMatching(/^[0-9a-f-]{36}$/u)))
    const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`
    await (await sseTurn(base, session, 'before-delete', 'remember the form')).text()
    expect((await rpc.chat.hydrate({sessionId: session})).messages).not.toEqual([])
    const deleting = operate({name: 'bump', input: {by: 1}, reading: false})
    const onDelete = await next('conn_e')
    await rpc.sessions.delete({sessionId: session})
    expect(await ending).toEqual({outcome: 'closed'})
    expect(await deleting).toMatchObject({ok: false, type: 'tab_gone', data: {dispatched: true}})
    await tabs('cancels', {requestId: onDelete.requestId})
    expect(await page('captures.list')).toEqual({captures: [], cssBundles: {}})
    expect(await tabs('open', {sessionId: session, connectionId: 'conn_r'})).toEqual({
      error: `session "${session}" does not exist`,
    })
    expect(await page('sessions.attached')).not.toContain(session)
    expect((await rpc.sessions.list(undefined)).sessions.map((meta) => meta.id)).not.toContain(session)
    expect(await page('captures.list')).toEqual({captures: [], cssBundles: {}})
    await expect(page('queue.wait', {queueId: strandedId, waitMs: 0})).rejects.toMatchObject({
      cause: expect.objectContaining({message: expect.stringContaining(`no queue ${strandedId}`)}),
    })
  })
})
describe('prefixed serving', () => {
  const TOKEN = '8a1e7d5c-3b2f-4e6a-9c0d-1f2e3a4b5c6d'

  describe('prefixed serving over the real wire (start with an access token)', () => {
    let root: string
    let engine: Engine
    let base: string
    let rpc: RpcClient

    beforeAll(async () => {
      root = tempDir('conciv-prefixed-wire-')
      const harness: HarnessAdapter = createFakeHarness({id: 'fake-prefixed-wire', text: 'prefixed ok'})
      engine = await start({
        options: {stateRoot: root, systemPrompt: false, harness: 'fake-prefixed-wire'},
        root,
        harness,
        launchEditor: () => {},
        accessToken: TOKEN,
      })
      base = `http://127.0.0.1:${engine.port}/t/${TOKEN}`
      rpc = makeRpcClient(base)
    })

    afterAll(async () => {
      await engine?.stop()
      rmSync(root, {recursive: true, force: true})
    })

    it('the mcp url under the token prefix answers mcp and the bare one is refused', {timeout: 15_000}, async () => {
      const {sessionId} = await rpc.sessions.create(undefined)
      const mcp = await connectMcpClient(`${base}/api/mcp`, {[CONCIV_SESSION_HEADER]: sessionId})
      try {
        expect((await mcp.tools()).map((tool) => tool.name)).toContain('execute_typescript')
      } finally {
        await mcp.close()
      }
      await expect(connectMcpClient(`http://127.0.0.1:${engine.port}/api/mcp`)).rejects.toMatchObject({code: 401})
    })

    it('streams a chat turn over the prefixed delivery route', {timeout: 15_000}, async () => {
      const {sessionId} = await rpc.sessions.create(undefined)
      const abort = new AbortController()
      const connection = fetchServerSentEvents(`${base}${CHAT_SSE_PATH}`)
      const types: string[] = []
      for await (const chunk of connection.connect(
        [{id: randomUUID(), role: 'user', parts: [{type: 'text', content: 'hello through the prefix'}]}],
        {},
        abort.signal,
        {threadId: sessionId, runId: randomUUID()},
      )) {
        types.push(chunk.type)
        if (chunk.type === ChatEventType.RUN_FINISHED || chunk.type === ChatEventType.RUN_ERROR) break
      }
      abort.abort()

      expect(types).toContain(ChatEventType.RUN_FINISHED)
    })

    it('answers chat.permissionDecision through the prefixed route', {timeout: 15_000}, async () => {
      const {sessionId} = await rpc.sessions.create(undefined)
      const sessionRpc = makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
      await expect(
        sessionRpc.chat.permissionDecision({approvalId: 'none-pending', approved: false}),
      ).rejects.toMatchObject({code: 'UNKNOWN_REQUEST'})
    })
  })
})

describe('session terminal', () => {
  const SHELL = ['--noprofile', '--norc', '-i']
  const BUSY_MODEL = 'busy-model'
  const terminalHarness = (id: string, pidFile: string) => {
    const connects: HarnessConnectContext[] = []
    const command = (context: HarnessConnectContext): TtyCommand => {
      connects.push(context)
      const env = {TERM: 'xterm-256color', PS1: 'P> ', PID_FILE: pidFile}
      const busy = context.model === BUSY_MODEL ? `printf '\\033]9;4;1\\007'; ` : ''
      return {bin: 'bash', args: ['-c', `echo $$ > "$PID_FILE"; ${busy}exec bash ${SHELL.join(' ')}`], env}
    }
    return {connects, harness: createFakeHarness({id, history: [], tty: {command}})}
  }
  const processAlive = (pid: number): boolean => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  type PtyClient = RpcClient['experimental']['persistentPty']
  type PtyOutput = Awaited<ReturnType<PtyClient['output']>>
  type PtyItem = PtyOutput extends AsyncIterable<infer Item> ? Item : never
  type TerminalReader = {items: PtyItem[]; text: () => string; ended: Promise<unknown>; stop: () => void}

  const REPLAY_PIECE = 64 * 1024

  const drainOutput = async (stream: PtyOutput, items: PtyItem[]): Promise<unknown> => {
    try {
      for await (const item of stream) items.push(item)
      return 'ended'
    } catch (error) {
      return error
    }
  }

  const readTerminal = async (terminal: PtyClient, ptyId: string, cursor?: number): Promise<TerminalReader> => {
    const stop = new AbortController()
    const items: PtyItem[] = []
    const stream = await terminal.output(cursor === undefined ? {ptyId} : {ptyId, cursor}, {signal: stop.signal})
    const text = () => items.flatMap((item) => (item.type === 'output' ? [item.data] : [])).join('')
    return {items, text, ended: drainOutput(stream, items), stop: () => stop.abort()}
  }

  const shows = async (terminal: TerminalReader, text: string): Promise<void> => {
    await until(() => terminal.text().includes(text))
  }

  const metaCursor = (terminal: TerminalReader): number | undefined =>
    terminal.items.flatMap((item) => (item.type === 'meta' ? [item.cursor] : [])).at(0)

  type RpcSocketClient = {socket: WebSocket; closes: number[]; terminal: PtyClient}

  const openRpcSocket = async (
    url: string,
    options: {origin?: string; trust?: string} = {},
  ): Promise<RpcSocketClient> => {
    const socket = new WebSocket(url, options.origin === undefined ? {} : {headers: {origin: options.origin}})
    const closes: number[] = []
    socket.on('close', (code) => closes.push(code))
    await once(socket, 'open')
    if (options.trust !== undefined) socket.send(JSON.stringify({type: SOCKET_TRUST_FRAME, token: options.trust}))
    const rpc: RpcClient = createORPCClient(new WebsocketRpcLink({websocket: socket}))
    return {socket, closes, terminal: rpc.experimental.persistentPty}
  }

  const readPid = (file: string): number => z.coerce.number().int().positive().parse(readFileSync(file, 'utf8').trim())

  it(
    'creates one terminal per session running its harness CLI, reuses it, refuses removing it while busy, resumes a known transcript, and dies with the engine',
    {timeout: 20_000},
    async () => {
      const root = tempDir('conciv-terminal-')
      const transcripts = join(root, 'transcripts')
      mkdirSync(transcripts)
      const pidFile = join(root, 'pid')
      const fake = terminalHarness('fake-terminal', pidFile)
      if (fake.harness.history === undefined) throw new Error('the fake harness has no history')
      const harness: HarnessAdapter = {
        ...fake.harness,
        history: {
          ...fake.harness.history,
          transcriptRoot: () => transcripts,
          transcriptPath: (_cwd: string, token: HarnessSessionId) => join(transcripts, `${token}.jsonl`),
        },
      }
      const engine = await start({
        options: {stateRoot: root, systemPrompt: false, harness: 'fake-terminal'},
        root,
        harness,
        launchEditor: () => {},
        homeDir: tempDir('conciv-home-'),
      })
      const stopped = {current: false}
      onTestFinished(async () => {
        if (!stopped.current) await engine.stop()
      })
      const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`
      const rpc = makeRpcClient(base)
      const terminal = rpc.experimental.persistentPty
      const {sessionId} = await rpc.sessions.create(undefined)

      const created = await terminal.create({sessionId, size: {cols: 100, rows: 30}, model: 'claude-x'})
      expect(created).toEqual({id: expect.stringMatching(/^pty_/), sessionId, size: {cols: 100, rows: 30}, busy: false})
      expect(fake.connects).toHaveLength(1)
      const first = fake.connects[0]
      expect(first).toMatchObject({cwd: root, concivSessionId: sessionId, model: 'claude-x', resume: false})
      expect(first?.mcpUrl).toBe(`${base}/api/mcp`)
      expect(first?.harnessSessionId).toEqual(expect.any(String))

      expect(await terminal.create({sessionId, size: {cols: 90, rows: 20}})).toEqual({
        ...created,
        size: {cols: 90, rows: 20},
      })
      expect(fake.connects).toHaveLength(1)

      expect(await terminal.remove({ptyId: created.id})).toEqual({ok: true})
      await expect(terminal.remove({ptyId: created.id})).rejects.toMatchObject({
        code: 'PTY_NOT_FOUND',
        status: 404,
        data: {ptyId: created.id},
      })

      writeFileSync(join(transcripts, `${first?.harnessSessionId}.jsonl`), '')
      const resumed = await terminal.create({sessionId, model: BUSY_MODEL})
      expect(resumed.id).not.toBe(created.id)
      expect(fake.connects[1]).toMatchObject({resume: true, harnessSessionId: first?.harnessSessionId})
      const banner = await readTerminal(terminal, resumed.id)
      await shows(banner, '\u2500 conciv: resumed session \u2500')
      banner.stop()

      await expect.poll(async () => (await terminal.create({sessionId})).busy).toBe(true)
      await expect(terminal.remove({ptyId: resumed.id})).rejects.toMatchObject({code: 'BUSY'})
      expect((await terminal.create({sessionId})).id).toBe(resumed.id)

      const pid = readPid(pidFile)
      expect(processAlive(pid)).toBe(true)
      stopped.current = true
      await engine.stop()
      await until(() => !processAlive(pid))
    },
  )

  it(
    'a session says whether its harness has a terminal, one switched to another harness never gets the old terminal back, and one with no terminal command is refused NO_TTY',
    {timeout: 20_000},
    async () => {
      const root = tempDir('conciv-terminal-switch-')
      const first = terminalHarness('fake-terminal-a', join(root, 'pid-a'))
      const second = terminalHarness('fake-terminal-b', join(root, 'pid-b'))
      const bare = createFakeHarness({id: 'fake-no-terminal'})
      const kit = await bootKit({cwd: root, harnesses: [second.harness, bare]}, first.harness)
      onTestFinished(() => kit.cleanup())
      const terminal = kit.rpc.experimental.persistentPty
      const {sessionId} = await kit.rpc.sessions.create(undefined)

      expect((await kit.rpc.meta.models({sessionId})).harness.persistentPty).toBe(true)
      const onFirst = await terminal.create({sessionId})
      await kit.rpc.sessions.switchHarness({sessionId, harnessId: 'fake-terminal-b'})
      const onSecond = await terminal.create({sessionId})
      expect(onSecond.id).not.toBe(onFirst.id)
      expect(first.connects).toHaveLength(1)
      expect(second.connects).toHaveLength(1)
      await expect(terminal.remove({ptyId: onFirst.id})).rejects.toMatchObject({code: 'PTY_NOT_FOUND'})

      await kit.rpc.sessions.switchHarness({sessionId, harnessId: 'fake-terminal-a'})
      const back = await terminal.create({sessionId})
      expect(back.id).not.toBe(onFirst.id)
      expect(first.connects).toHaveLength(2)
      await expect(terminal.remove({ptyId: onSecond.id})).rejects.toMatchObject({code: 'PTY_NOT_FOUND'})

      await kit.rpc.sessions.switchHarness({sessionId, harnessId: 'fake-no-terminal'})
      expect((await kit.rpc.meta.models({sessionId})).harness.persistentPty).toBe(false)
      await expect(terminal.create({sessionId})).rejects.toMatchObject({code: 'NO_TTY'})
    },
  )

  const startTerminalEngine = async (prefix: string, id: string) => {
    const root = tempDir(prefix)
    const fake = terminalHarness(id, join(root, 'pid'))
    const engine = await start({
      options: {stateRoot: root, systemPrompt: false, harness: id},
      root,
      harness: fake.harness,
      launchEditor: () => {},
      homeDir: tempDir('conciv-home-'),
    })
    onTestFinished(() => engine.stop())
    const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`
    const rpc = makeRpcClient(base)
    const {sessionId} = await rpc.sessions.create(undefined)
    return {root, engine, base, rpc, sessionId, terminal: rpc.experimental.persistentPty}
  }

  it(
    'the terminal procedures carry the terminal both ways, replay to a late reader in bounded pieces before a meta frame with the cursor, resume from that cursor without repeating output, refuse an unknown pty or a never-admitted origin, and outside agents cannot use the terminal',
    {timeout: 30_000},
    async () => {
      const {engine, base, rpc, sessionId, terminal} = await startTerminalEngine(
        'conciv-terminal-socket-',
        'fake-terminal-socket',
      )
      const pty = await terminal.create({sessionId, size: {cols: 100, rows: 30}})

      const first = await readTerminal(terminal, pty.id)
      await terminal.write({ptyId: pty.id, data: 'echo ws-roundtrip-$((40+2))\r'})
      await shows(first, 'ws-roundtrip-42')
      expect(first.items).toContainEqual({type: 'busy', busy: false})
      await terminal.write({ptyId: pty.id, data: 'stty size\r'})
      await shows(first, '30 100')
      expect(await terminal.resize({ptyId: pty.id, cols: 91, rows: 27})).toEqual({ok: true})
      await terminal.write({ptyId: pty.id, data: 'stty size\r'})
      await shows(first, '27 91')
      expect(await terminal.inject({ptyId: pty.id, text: 'conciv says hi'})).toEqual({ok: true})
      await shows(first, '\r\nconciv says hi\r\n')
      await terminal.write({
        ptyId: pty.id,
        data: "head -c 200000 /dev/zero | tr '\\0' x; echo; echo bulk-$((1+1))-done\r",
      })
      await shows(first, 'bulk-2-done')
      first.stop()

      const late = await readTerminal(terminal, pty.id)
      await until(() => metaCursor(late) !== undefined)
      const replay = late.items.slice(
        0,
        late.items.findIndex((item) => item.type === 'meta'),
      )
      const pieces = replay.flatMap((item) => (item.type === 'output' ? [item.data.length] : []))
      expect(pieces.length).toBeGreaterThan(2)
      expect(Math.max(...pieces)).toBeLessThanOrEqual(REPLAY_PIECE)
      expect(late.text()).toContain('ws-roundtrip-42')
      expect(late.text()).toContain('\r\nconciv says hi\r\n')
      const cursor = metaCursor(late) ?? 0
      expect(cursor).toBe(late.text().length)
      late.stop()

      await terminal.write({ptyId: pty.id, data: 'echo after-$((5+5))\r'})
      const resumed = await readTerminal(terminal, pty.id, cursor)
      await shows(resumed, 'after-10')
      await until(() => metaCursor(resumed) !== undefined)
      expect(resumed.text()).not.toContain('ws-roundtrip-42')
      expect(resumed.text()).not.toContain('bulk-2-done')
      expect(metaCursor(resumed)).toBeGreaterThan(cursor)
      resumed.stop()

      const unknown = `pty_${randomUUID()}`
      await expect(terminal.output({ptyId: unknown})).rejects.toMatchObject({code: 'PTY_NOT_FOUND'})
      await expect(terminal.write({ptyId: unknown, data: 'x'})).rejects.toMatchObject({code: 'PTY_NOT_FOUND'})

      const widget = 'http://localhost:5173'
      const other = await rpc.sessions.create(undefined)
      const fromWidget = makeRpcClient(base, {headers: {origin: widget}}).experimental.persistentPty
      const widgetPty = await fromWidget.create({sessionId: other.sessionId})
      const sameOrigin = await readTerminal(fromWidget, widgetPty.id)
      await fromWidget.write({ptyId: widgetPty.id, data: 'echo widget-$((2+2))\r'})
      await shows(sameOrigin, 'widget-4')
      sameOrigin.stop()
      const elsewhere = await openRpcSocket(`ws://127.0.0.1:${engine.port}/t/${engine.agentToken}${RPC_WS_PATH}`, {
        origin: 'http://127.0.0.1:5173',
      })
      onTestFinished(() => elsewhere.socket.close())
      for (const stranger of [elsewhere.terminal, terminal]) {
        const refused = {code: 'PTY_NOT_FOUND'}
        await expect(stranger.output({ptyId: widgetPty.id})).rejects.toMatchObject(refused)
        await expect(stranger.write({ptyId: widgetPty.id, data: 'x'})).rejects.toMatchObject(refused)
        await expect(stranger.resize({ptyId: widgetPty.id, cols: 80, rows: 24})).rejects.toMatchObject(refused)
        await expect(stranger.inject({ptyId: widgetPty.id, text: 'x'})).rejects.toMatchObject(refused)
      }

      const outside = makeRpcClient(base, {
        headers: {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: 'terminal'},
      }).experimental.persistentPty
      const denied = {code: 'APPROVAL_DENIED'}
      await expect(outside.create({sessionId})).rejects.toMatchObject(denied)
      await expect(outside.remove({ptyId: pty.id})).rejects.toMatchObject(denied)
      await expect(outside.output({ptyId: pty.id})).rejects.toMatchObject(denied)
      await expect(outside.write({ptyId: pty.id, data: 'x'})).rejects.toMatchObject(denied)
      await expect(outside.resize({ptyId: pty.id, cols: 80, rows: 24})).rejects.toMatchObject(denied)
      await expect(outside.inject({ptyId: pty.id, text: 'x'})).rejects.toMatchObject(denied)
      expect((await terminal.create({sessionId})).id).toBe(pty.id)

      expect(await terminal.remove({ptyId: pty.id})).toEqual({ok: true})
      await expect(terminal.output({ptyId: pty.id})).rejects.toMatchObject({code: 'PTY_NOT_FOUND'})
    },
  )

  it(
    'a reader that stops reading its rpc socket gets SLOW_CONSUMER instead of the engine buffering the output for it',
    {timeout: 60_000},
    async () => {
      const {root, engine, sessionId, terminal} = await startTerminalEngine(
        'conciv-terminal-slow-',
        'fake-terminal-slow',
      )
      const pty = await terminal.create({sessionId})
      const slow = await openRpcSocket(`ws://127.0.0.1:${engine.port}/t/${engine.agentToken}${RPC_WS_PATH}`)
      onTestFinished(() => slow.socket.close())
      const reader = await readTerminal(slow.terminal, pty.id)
      await until(() => metaCursor(reader) !== undefined)
      slow.socket.pause()
      const flood = "head -c 33554432 /dev/zero | tr '\\0' x; echo; echo flood-$((3+3))-over; touch flood-done\r"
      await terminal.write({ptyId: pty.id, data: flood})
      await until(() => existsSync(join(root, 'flood-done')), {hangGuardMs: 30_000})
      slow.socket.resume()
      const delivered = until(() =>
        reader.items
          .slice(-8)
          .flatMap((item) => (item.type === 'output' ? [item.data] : []))
          .join('')
          .includes('flood-6-over'),
      ).then(
        () => 'all delivered',
        () => 'never delivered',
      )
      expect(await Promise.race([reader.ended, delivered])).toMatchObject({code: 'SLOW_CONSUMER'})
    },
  )

  const trustedBrowserTerminal = async (prefix: string) => {
    const {root, engine, rpc, sessionId, terminal} = await startTerminalEngine(prefix, 'fake-terminal-revoke')
    const pty = await rpc.experimental.persistentPty.create({sessionId})
    const browserToken = engine.trustBrowser(
      {browser: 'Chrome 156 | macOS', origin: 'http://localhost:5173'},
      Date.now(),
    )
    const openAsBrowser = async () => {
      const opened = await openRpcSocket(`ws://127.0.0.1:${engine.port}${RPC_WS_PATH}`, {trust: browserToken})
      onTestFinished(() => opened.socket.close())
      return opened
    }
    const revoke = (): void => {
      revokeBrowsers(concivStateDir(root), 'all')
    }
    const shownToEngine = async (proof: string): Promise<string> => {
      const witness = await readTerminal(terminal, pty.id)
      await terminal.write({ptyId: pty.id, data: `\recho ${proof}-$((3+4))\r`})
      await shows(witness, `${proof}-7`)
      witness.stop()
      return witness.text()
    }
    const written = (client: PtyClient, data: string): Promise<string> =>
      client.write({ptyId: pty.id, data}).then(
        () => 'written',
        () => 'refused',
      )
    return {ptyId: pty.id, openAsBrowser, revoke, shownToEngine, written}
  }

  it(
    'revoking a browser fails its terminal output with UNAUTHORIZED, closes its rpc socket with 1008, and nothing it writes afterwards reaches the terminal',
    {timeout: 20_000},
    async () => {
      const browser = await trustedBrowserTerminal('conciv-terminal-revoke-live-')
      const kept = await browser.openAsBrowser()
      const reader = await readTerminal(kept.terminal, browser.ptyId)
      expect(await browser.written(kept.terminal, '\recho kept-$((40+2))\r')).toBe('written')
      await shows(reader, 'kept-42')

      browser.revoke()
      expect(await reader.ended).toMatchObject({code: 'UNAUTHORIZED'})
      await until(() => kept.closes.length > 0)
      expect(kept.closes).toEqual([1008])
      expect(await browser.written(kept.terminal, '\recho late-$((5+6))\r')).toBe('refused')
      expect(await browser.shownToEngine('after-late')).not.toContain('late-11')
    },
  )

  it(
    'a browser that opens its rpc socket after its revoke gets no terminal: its output and writes are refused UNAUTHORIZED and nothing reaches the terminal',
    {timeout: 20_000},
    async () => {
      const browser = await trustedBrowserTerminal('conciv-terminal-revoke-stale-')
      browser.revoke()

      const stale = await browser.openAsBrowser()
      const unauthorized = {code: 'UNAUTHORIZED'}
      await expect(stale.terminal.output({ptyId: browser.ptyId})).rejects.toMatchObject(unauthorized)
      await expect(stale.terminal.write({ptyId: browser.ptyId, data: '\recho stale-$((2+3))\r'})).rejects.toMatchObject(
        unauthorized,
      )
      expect(await browser.shownToEngine('after-stale')).not.toContain('stale-5')
    },
  )
})
