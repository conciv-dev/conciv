import {until} from '@conciv/harness-testkit/until'
import {
  mkdtempSync,
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
import {on, once} from 'node:events'
import {open, writeFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {createServer, request as httpRequest} from 'node:http'
import {DatabaseSync} from 'node:sqlite'
import {tmpdir} from 'node:os'
import {join, dirname} from 'node:path'
import {afterAll, beforeAll, describe, expect, it, afterEach, onTestFinished, test, vi, beforeEach} from 'vitest'
import {createMCPClient, imageToolProvisioner, makeTextAdapter} from '@conciv/ai/server'
import {foldChatEvents} from '@conciv/ai/testkit'
import {abortableFetch, cappedValue, codeExecuteReply, type EngineStaleness} from '@conciv/contract'
import {
  defineExtension,
  defineTool,
  makeExtRpcClient,
  type ServerApi,
  type ToolMiddleware,
  imageResult,
  toolError,
  defineAttachment,
} from '@conciv/extension'
import {openSource} from '@conciv/extension/client'
import {getHarness} from '@conciv/harness'
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
import {isEqual} from 'es-toolkit'
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
} from '@conciv/harness-testkit'
import {claude} from '@conciv/harness/claude'
import {codex as codexHarness} from '@conciv/harness/codex'
import {pi as piHarness} from '@conciv/harness/pi'
import {defineBundlerBridge} from '@conciv/protocol/bundler-types'
import {
  approvalAskOf,
  type ChatEvent,
  ChatEventType,
  pageQueueEvent,
  sessionRunEvent,
} from '@conciv/protocol/chat-event-types'
import {webSocket} from '@conciv/ai/client'
import {type ChatMessage} from '@conciv/protocol/chat-message-types'
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
import {type ElementCapture, type ElementCaptureKind} from '@conciv/protocol/element-capture-types'
import {type HarnessChatDeps, type HarnessListCursor, type HarnessModel} from '@conciv/protocol/harness-types'
import {
  type PageOutcome,
  PageQuerySchema,
  PageQueueResultSchema,
  PAGE_TRANSPORT_ERROR_CODES,
} from '@conciv/protocol/page-types'
import {PUSH_SESSION_PARAM, PUSH_WS_PATH} from '@conciv/protocol/push-types'
import {type RpcContext} from '@conciv/protocol/rpc-types'
import {type TokenUsage} from '@conciv/protocol/usage-types'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/fetch'
import {onError, ORPCError, os, type RouterClient} from '@orpc/server'
import WebSocket from 'ws'
import {z} from 'zod'
import {makeApp, type MadeApp} from '../src/app.js'
import {callTrace} from '../src/api/call-trace.js'
import {resolveConfig} from '../src/config.js'
import {openSourceFromFrames} from '../src/editor/open-source.js'
import {originAllowed} from '../src/lib/cors.js'
import {start, type Engine} from '../src/start.js'
import {sampleServerExtension, sampleState} from './fixtures/sample-server-extension.js'
import corePackage from '../package.json' with {type: 'json'}
import {
  bootKit,
  bootMadeApp,
  requireClaude,
  bootCoreApp,
  requireTranscriptPath,
  connectWidget,
  chunkWithInlineMap,
  cleanupChunks,
  hydratedSnapshot,
  runTurn,
  userTexts,
  type FakeWidget,
} from './helpers.js'

function groupAlive(group: number): boolean {
  try {
    process.kill(-group, 0)
    return true
  } catch {
    return false
  }
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
    const root = mkdtempSync(join(tmpdir(), 'conciv-staleness-di-'))
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
      expect(description).toMatch(/^WARNING: this engine is running outdated code/)
      expect(description).toContain('@conciv/injected-probe')
      expect(description).toContain('Rules of the sandbox:')
      expect(description.length).toBeLessThanOrEqual(4096)
      expect(description).toContain('call discover_tools with their names')
      expect(description).toContain('More capabilities, by name only: ')
      expect(description).toContain('external_page_insert')
      expect(sandboxNames.length).toBeGreaterThan(0)
      expect(sandboxNames.filter((name) => !description.includes(name))).toEqual([])
      expect(discoverDescription.length).toBeLessThanOrEqual(4096)
      expect(discoverDescription).not.toContain('external_page_insert')
      expect(calls.count).toBeGreaterThanOrEqual(3)
    }, 20_000)

    it('bounds the staleness notice and the names list so a huge changed list keeps the description within budget', async () => {
      const changed = Array.from({length: 2000}, (_, index) => `@conciv/changed-package-${index}`)
      const served = await serveWithProbe(() => ({...INJECTED, changed}))
      const {description, sandboxNames} = await executeTool(served.base)

      expect(description.length).toBeLessThanOrEqual(4096)
      expect(sandboxNames.filter((name) => !description.includes(name)).length).toBeGreaterThan(0)
      expect(description).toMatch(/^WARNING: this engine is running outdated code/)
      expect(description).toContain('@conciv/changed-package-0')
      expect(description).toMatch(/, and \d+ more\)\. Restart the dev server/)
      expect(description).toContain('Run TypeScript in a secure sandbox wired to this project.')
      expect(description).toContain('Rules of the sandbox:')
      expect(description).toContain('return Object.keys(globalThis).filter((key) => key.startsWith("external_"))')
    }, 20_000)

    it('the execute tool description says nothing about staleness while the engine matches the code on disk', async () => {
      const served = await serveWithProbe(() => ({...INJECTED, stale: false, changed: []}))
      const {description} = await executeTool(served.base)
      expect(description).toContain('Rules of the sandbox:')
      expect(description).not.toMatch(/outdated|restart the dev server/i)
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
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-mount-'))
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
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-mount-dup-'))
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
      const surface = server.harness(sessionId)
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
    const root = mkdtempSync(join(tmpdir(), 'conciv-installed-harnesses-'))
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
  const root = join(realpathSync(tmpdir()), `conciv-connect-hub-${randomUUID()}`)
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
  const root = mkdtempSync(join(tmpdir(), 'conciv-codex-turns-'))
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
  const root = mkdtempSync(join(tmpdir(), 'conciv-claude-turns-'))
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
    made.app.chat.db.update(sessions).set({model, effort}).where(eq(sessions.id, sessionId)).run()
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
    return db().select().from(sessions).where(eq(sessions.id, sessionId)).get()
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
          models: [{id: 'a-model', name: 'A'}],
          defaultModel: 'a-model',
          modelsFailed: false,
        },
        {
          id: 'beta',
          name: 'Beta',
          imageInput: false,
          models: [{id: 'b-model', name: 'B'}],
          defaultModel: 'b-model',
          modelsFailed: false,
        },
        {
          id: 'gamma',
          name: 'Gamma',
          imageInput: false,
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
    db().update(sessions).set({effort: 'high'}).where(eq(sessions.id, sessionId)).run()

    expect(await kit().rpc.sessions.switchHarness({sessionId, harnessId: 'beta', model: 'b-model'})).toEqual({
      harnessId: 'beta',
    })

    expect(row(sessionId)).toMatchObject({harnessKind: 'beta', harnessSessionId: null, model: 'b-model', effort: null})
    expect(await turn(sessionId, 'second question')).toMatchObject({harness: 'beta', model: 'b-model'})
  })

  it('rejects a switch naming a model the target harness does not list, and changes nothing', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await turn(sessionId, 'stay on alpha')
    const before = row(sessionId)

    await expect(
      kit().rpc.sessions.switchHarness({sessionId, harnessId: 'beta', model: 'a-model'}),
    ).rejects.toMatchObject({code: 'UNKNOWN_MODEL'})

    expect(row(sessionId)).toEqual(before)
  })

  it('a switch resets the session, the next turn replays the whole chat, and each reply keeps its harness', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await kit().rpc.sessions.model({sessionId, model: 'a-model'})
    expect(await turn(sessionId, 'first question')).toMatchObject({harness: 'alpha', resumeSessionId: null})
    const native = row(sessionId)?.harnessSessionId
    expect(native).toBeTruthy()
    expect(await turn(sessionId, 'second question')).toMatchObject({harness: 'alpha', resumeSessionId: native})
    db()
      .insert(chatMetadata)
      .values({namespace: TRANSCRIPT_NAMESPACE, key: anchorKey(sessionId), valueJson: {nativeId: 'alpha-tail'}})
      .run()

    expect(await kit().rpc.sessions.switchHarness({sessionId, harnessId: 'beta'})).toEqual({harnessId: 'beta'})

    expect(row(sessionId)).toMatchObject({harnessKind: 'beta', harnessSessionId: null, model: null})
    expect(
      db()
        .select()
        .from(chatMetadata)
        .where(eq(chatMetadata.key, anchorKey(sessionId)))
        .all(),
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
      resumeSessionId: row(sessionId)?.harnessSessionId,
    })

    const hydration = await kit().hydrate(sessionId)
    const assistants = hydration.messages.filter((message) => message.role === 'assistant')
    expect(assistants.map((message) => hydration.messageHarness[message.id])).toEqual([
      'alpha',
      'alpha',
      'beta',
      'beta',
    ])
    const runs = db()
      .select({harnessId: chatRuns.harnessId})
      .from(chatRuns)
      .where(eq(chatRuns.threadId, sessionId))
      .orderBy(asc(chatRuns.startedAt))
      .all()
    expect(runs.map((run) => run.harnessId)).toEqual(['alpha', 'alpha', 'beta', 'beta'])
  })

  it('a turn never resumes a native session that belongs to another harness', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await turn(sessionId, 'remember this')
    expect(row(sessionId)?.harnessSessionId).toBeTruthy()
    db().update(sessions).set({harnessKind: 'uninstalled'}).where(eq(sessions.id, sessionId)).run()
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
      expect(row(sessionId)?.harnessKind).toBe('alpha')
    } finally {
      alpha.script.release()
      await running.done()
    }
  })

  it('switching to the current harness changes nothing', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await turn(sessionId, 'stay')
    const before = row(sessionId)
    expect(await kit().rpc.sessions.switchHarness({sessionId, harnessId: 'alpha'})).toEqual({harnessId: 'alpha'})
    expect(row(sessionId)).toEqual(before)
  })

  it('a native transcript a session owned before a switch never lists as a separate session, and never resumes', async () => {
    const sessionId = (await kit().rpc.sessions.create()).sessionId
    await kit().rpc.sessions.switchHarness({sessionId, harnessId: 'beta'})
    await turn(sessionId, 'written into a beta transcript')
    const owned = row(sessionId)?.harnessSessionId
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
    expect(row(sessionId)?.deletedAt).not.toBeNull()
    expect(await listings(false)).toEqual({owner: 1, phantoms: 0})
    expect(row(sessionId)?.deletedAt).toBeNull()
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
        return raced.app.chat.db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
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
      expect(raced.row(sessionId)).toMatchObject({harnessKind: 'quick', model: null, effort: null})
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
      expect(raced.row(sessionId)).toMatchObject({harnessKind: 'quick', model: null, effort: null})
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
      const root = mkdtempSync(join(tmpdir(), 'conciv-native-token-'))
      const nativeDir = mkdtempSync(join(tmpdir(), 'conciv-native-dist-'))
      const endpointDir = mkdtempSync(join(tmpdir(), 'conciv-native-ep-'))
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
        const match = /<script src="([^"]+)"><\/script>/.exec(html)
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

    it('a call its rpc caller aborts drops its page query, so the late reply settles nothing', async () => {
      const listening = new AbortController()
      onTestFinished(() => listening.abort())
      const queries = await kit().rpc.page.queries(undefined, {signal: listening.signal})
      const calling = new AbortController()
      const called = kit().rpc.registry.call({name: 'page_route', input: {}}, {signal: calling.signal})
      const asked = await queries.next()
      calling.abort()
      await expect(called).rejects.toThrow()
      const requestId = asked.done === true ? '' : asked.value.requestId
      await expect(kit().rpc.page.reply({requestId, outcome: {ok: true, result: {}}})).rejects.toMatchObject({
        code: 'UNKNOWN_REQUEST',
      })
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

    it('a failed handler becomes HANDLER_ERROR naming the tool, and a refused mutation is not journaled', async () => {
      state.widget = await connectWidget(kit(), (name) =>
        name === 'page_text'
          ? {ok: false, error: {code: 'handler-error', message: 'handler-error says no'}}
          : {ok: false, error: {code: 'invalid-args', message: 'no element for selector #email'}},
      )
      await expect(callPage(kit(), 'page_text', {selector: '#h'})).rejects.toMatchObject({
        code: 'HANDLER_ERROR',
        message: 'page_text: handler-error says no',
      })
      await expect(callPage(kit(), 'page_fill', {selector: '#email', value: 'a@b.c'})).rejects.toMatchObject({
        code: 'INVALID_ARGS',
      })
      expect(ChangesSchema.parse(await kit().rpc.page.changes(undefined))).toEqual([])
    })

    it('journals a fill with its value but never a read, and clear empties the journal', async () => {
      state.widget = await connectWidget(kit(), (name) =>
        name === 'page_text' ? {ok: true, result: {text: 'hi'}} : {ok: true, result: {ok: true, value: 'a@b.c'}},
      )
      await callPage(kit(), 'page_text', {selector: '#h'})
      expect(await callPage(kit(), 'page_fill', {selector: '#email', value: 'a@b.c'})).toEqual({
        ok: true,
        value: 'a@b.c',
      })
      const changes = ChangesSchema.parse(await kit().rpc.page.changes(undefined))
      expect(changes).toMatchObject([{verb: 'page_fill', selector: '#email', args: {value: 'a@b.c'}}])
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
      await kit().rpc.sessions.delete({sessionId})
      const stored = await kit().rpc.captures.list({sessionId})
      expect(stored.captures).toEqual([])
      expect(stored.cssBundles).toEqual({})
    })
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
        const aborted = (error: unknown) => {
          if (!abort.signal.aborted) throw error
        }
        await consumed.catch(aborted)
        await iterator.return(undefined).catch(aborted)
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
      const {sessionId} = await kit.rpc.sessions.create(undefined)
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
      app.harness = recordingHarness(createTestHarness(requireClaude()))
      app.kit = await createTestkit(
        app.harness,
        bootCoreApp({extensions: [fixtureExtension()], firstChunkTimeoutMs: SILENCE_MS}),
      ).setup()
      app.widget = await connectWidget(app.kit, answerFor)
      app.mcpSession = await newSession()
      app.mcp = await connectMcpClient(`${app.kit.base}/api/mcp`, {[CONCIV_SESSION_HEADER]: app.mcpSession})
    }, 60_000)

    afterAll(async () => {
      app.widget?.end()
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
        await chatKit().rpc.drafts.set({sessionId, text: 'a saved draft', selectionStart: 0, selectionEnd: 0})
        const ended = nextTurnEnd(sessionId)
        const events = await finished(sessionId, 'hello', {runId: 'client-run', messageId: 'client-user'})
        await ended()
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
        await chatKit().rpc.sessions.model({sessionId, model: 'haiku'})
        await finished(sessionId, 'second question')
        expect(lastRunOf(sessionId)).toMatchObject({model: 'haiku', resumeSessionId: null})
        expect(lastRunOf(sessionId).messages).toContain('first question')
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
        expect(lastRunOf(sessionId)).toMatchObject({model: undefined, effort: 'high'})

        await chatKit().rpc.sessions.effort({sessionId, effort: null})
        script().scriptTurn({toolCalls: [], text: 'default effort'})
        await finished(sessionId, 'again')
        expect(lastRunOf(sessionId).effort).toBeUndefined()

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
        await Promise.all(sends.map((turn) => turn.done()))
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
        expect((await chatKit().join('ask-run').done()).custom('approval-requested')).toHaveLength(1)
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
        await expect(browserRpc.server.config(undefined)).rejects.toMatchObject({code: 'NO_BUNDLER'})
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
            const ask = approvalAskOf(chunk)
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
        const {tools} = await chatKit().rpc.meta.tools(undefined)
        expect(tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(FIXTURE_TOOLS))
        expect(tools.every((tool) => tool.description.length > 0)).toBe(true)
        expect(tools.find((tool) => tool.name === 'fixture_echo')?.description).toBe(ECHO_DESCRIPTION)
        const models = await chatKit().rpc.meta.models({sessionId: await newSession()})
        expect(models.models.map((model) => model.id)).toEqual(expect.arrayContaining(['opus', 'sonnet', 'haiku']))
        expect(models.defaultModel).toBe('opus')
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
        const boundary = (await thread(sessionId)).at(-1)?.id
        script().hold()
        const compacts = [chatKit().rpc.sessions.compact({sessionId}), chatKit().rpc.sessions.compact({sessionId})]
        await Promise.race(compacts)
        await until(async () => (await sessionMeta(sessionId)).running, GUARD)
        script().release()
        await Promise.all(compacts)
        expect(lastRunOf(sessionId).kind).toBe('compact')
        expect(lastRunOf(sessionId).messages).toContain('/compact')
        expect(overlapping(runsOf(sessionId))).toBe(false)
        expect(boundary).toBeDefined()
        expect(await compactMarkers(sessionId)).toEqual([boundary, boundary])
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
        expect(overlapping(runsOf(sessionId))).toBe(false)
        expect(await threadUserTexts(sessionId)).toEqual(['first in line', 'second in line'])
      })

      it('a new message ends the running turn before its own turn starts', async () => {
        const sessionId = await newSession()
        const {turn} = await heldTurn(sessionId, 'interrupted', 'steer-first')
        const second = await send(sessionId, 'resent', {runId: 'steer-second'})
        const first = await turn.done().finally(() => script().release())
        expect(first.all.some((chunk) => chunk.type === ChatEventType.RUN_FINISHED)).toBe(true)
        expect(eventRunIdsOf(await second.done(), ChatEventType.RUN_STARTED)).toContain('steer-second')
      })
    })

    describe('silent CLI', () => {
      it('a CLI that says nothing fails the turn with "no output", tells the viewer, and fires the hook', async () => {
        const sessionId = await newSession()
        script().holdTools()
        const ended = nextTurnEnd(sessionId)
        const turn = await send(sessionId, 'silence', {runId: 'silent-run'})
        await turn.waitForRunStart({runId: 'silent-run'})
        const error = turn.waitFor((chunk) => chunk.type === ChatEventType.RUN_ERROR, {hangGuardMs: SILENCE_MS * 2})
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
        rmSync(transcriptPathOf(gone))
        const after = await chatKit().rpc.sessions.list({includeHidden: true})
        expect(after.sessions.map((meta) => meta.id)).not.toContain(listed.id)
        expect(await chatKit().rpc.sessions.get({sessionId: listed.id})).toMatchObject({id: listed.id})
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
          searched.cwd = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-search-cwd-')))
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
          const hitOf = async (term: string) => {
            const {sessions: listed} = await searchKit().rpc.sessions.search({term, limit: 100})
            return listed.map(({excerpt, matched}) => ({excerpt, matched}))
          }

          expect(await hitOf('curl')).toEqual([{excerpt: 'the Curlews jetted past the jetty', matched: ['Curlews']}])
          expect(await hitOf('jetti')).toEqual([{excerpt: 'the Curlews jetted past the jetty', matched: ['jetty']}])
          expect(await hitOf('packd')).toEqual([
            {excerpt: 'first we packed\nthe Curlews jetted past the jetty', matched: ['packed']},
          ])

          const {sessions: listed} = await searchKit().rpc.sessions.list({limit: 100})
          const owned = listed.find((meta) => meta.native?.nativeId === curlew)
          if (owned === undefined) throw new Error('the curlew session was not listed')
          await searchKit().rpc.sessions.rename({sessionId: owned.id, title: 'the godwit count'})
          expect(await hitOf('godwit')).toEqual([{excerpt: null, matched: ['godwit']}])

          const tabbed = claudeId('claude-tabbed')
          writeClaudeTurn(tabbed, 'a tabbed tally', `${'alpha\t'.repeat(100)}phalarope`)
          await foundOnceIndexed('phalarope', [tabbed])
          const [phalarope] = await hitOf('phalarope')
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
          const folder = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-preview-unindexed-')))
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

          const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-preview-elsewhere-')))
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
          const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'conciv-search-elsewhere-')))
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
        for (const names of [lastRunOf(sessionId).tools, offered.map((tool) => tool.name)]) {
          expect(names).toEqual(expect.arrayContaining(['execute_typescript', 'discover_tools', 'fixture_ask']))
          expect(names).not.toContain('fixture_echo')
        }
        const description = offered.find((tool) => tool.name === 'execute_typescript')?.description ?? ''
        expect(description).toContain('discover_tools')
        expect(description).toContain('external_fixture_echo')
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
        const listening = new AbortController()
        onTestFinished(() => listening.abort())
        const page = callerWith(sessionId)
        const queries = await page.page.queries(undefined, {signal: listening.signal})
        return {
          asked: async () => {
            const next = await queries.next()
            return next.done === true ? '' : next.value.requestId
          },
          lateReply: (requestId: string) => page.page.reply({requestId, outcome: {ok: true, result: {}}}),
        }
      }

      it('stopping a turn whose program waits on the page drops the page query', async () => {
        const sessionId = await newSession()
        const page = await silentPage(sessionId)
        codeTurn('return await external_page_route({})')
        await send(sessionId, 'route', {runId: 'page-stop-run'})
        const requestId = await page.asked()
        const ended = nextTurnEnd(sessionId)
        await chatKit().rpc.chat.stop({sessionId, runIds: ['page-stop-run']})
        await ended()
        await expect(page.lateReply(requestId)).rejects.toMatchObject({code: 'UNKNOWN_REQUEST'})
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
        await expect(page.lateReply(await page.asked())).rejects.toMatchObject({code: 'UNKNOWN_REQUEST'})
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
        const requestId = await page.asked()
        cancelling.abort()
        await expect(running).rejects.toThrow()
        await stream.waitFor((chunk) => chunk.type === ChatEventType.RUN_FINISHED)
        const result = events.findLast((chunk) => chunk.type === ChatEventType.TOOL_CALL_RESULT)
        expect(JSON.stringify(result)).toMatch(/abort/i)
        await expect(page.lateReply(requestId)).rejects.toMatchObject({code: 'UNKNOWN_REQUEST'})
      })

      it('discover_tools shows a tool output shape and declared error codes; the catalog lives on execute_typescript', async () => {
        const discover = await mcpTool('discover_tools')
        const found = JSON.stringify(await discover.execute({toolNames: ['fixture_fail']}))
        expect(found).toContain('Returns JSON matching')
        expect(found).toContain('PROBE_BROKE: the probe broke')
        expect(JSON.stringify(await discover.execute({toolNames: ['fixture_echo']}))).toContain('echoed')
        const execute = await mcpTool('execute_typescript')
        expect(execute.description).toContain('external_fixture_fail')
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
        const results = resultsOf(await thread(sessionId))
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
        await turn.done()
      })
    })

    describe('page tools', () => {
      it('a page tool reaches the page without an ask and its change lands in the page journal', async () => {
        const sessionId = await chatKit().session()
        codeTurn('return await external_page_click({selector: "#go"})')
        const events = await finished(sessionId, 'click')
        expect(events.custom('approval-requested')).toEqual([])
        expect(widget().seen()).toContain('page_click')
        expect(await chatKit().rpc.page.changes(undefined)).toContainEqual(
          expect.objectContaining({verb: 'page_click', selector: '#go'}),
        )
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
  const UNKNOWN_SESSION = `conciv_unknown-but-valid-${'x'.repeat(110)}`
  const NEVER_MADE = 'conciv_never-made'
  const DECLARED_MESSAGE = 'PROBE_BROKE: the probe broke'
  const FIXTURE_TOOLS = ['fixture_echo', 'fixture_read', 'fixture_ask']
  const CHILD_CARDS = ['fixture_echo', 'fixture_echo', 'fixture_echo', 'fixture_fail', 'fixture_huge']
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
    widget: FakeWidget | null
    mcp: McpClient | null
    mcpSession: string
    mcpTools: () => Promise<McpTool[]>
  }

  const app: SharedApp = {
    kit: null,
    harness: null,
    widget: null,
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
    }).server(() => undefined)
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

  function widget(): FakeWidget {
    if (app.widget === null) throw new Error('the widget is not connected')
    return app.widget
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

  async function readSse(response: Response, stopType: string): Promise<string[]> {
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
      if (types.includes(stopType)) {
        await reader.cancel()
        return seen
      }
    }
  }

  function fakeNativeId(sessionId: string): string {
    return `fake-${sessionId}`
  }

  function transcriptPathOf(nativeId: string): string {
    return requireTranscriptPath(requireClaude())(chatKit().stateRoot, HarnessSessionId.parse(nativeId))
  }

  function writeNativeAt(nativeId: string, task: string, updatedAt: number): void {
    const path = writeTranscript(nativeId, [JSON.stringify({type: 'user', message: {content: task}})])
    utimesSync(path, updatedAt / 1000, updatedAt / 1000)
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

const tempDir = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix))

function bootAt(
  homeDir: string,
  root = tempDir('conciv-outside-'),
  hubAccess: HubAccess = 'session',
  harness = createFakeHarness(),
): Promise<Engine> {
  return start({
    options: {stateRoot: root, hubAccess},
    root,
    launchEditor: () => {},
    harness,
    homeDir,
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
    const kit = sharedKit(() => {
      mkdirSync(join(repo, '.git'))
      mkdirSync(app, {recursive: true})
      writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/feature-x\n')
      writeFileSync(join(app, 'package.json'), JSON.stringify({name: 'tabs-fixture'}))
      const boot = bootCoreApp({cwd: app, systemPromptText: instructions})
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

    async function joinPage(answers: boolean): Promise<void> {
      if (answers) {
        pages.push((await connectWidget(kit(), () => ({ok: true, result: {...route, search: ''}}))).end)
        return
      }
      const abort = new AbortController()
      await kit().rpc.page.queries(undefined, {signal: abort.signal})
      pages.push(() => abort.abort())
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
      await joinPage(true)
      expect(await tabOpen()).toEqual({open: true, instructions})
      const session = {title: expect.any(String), updatedAt: expect.any(Number), running: false}
      const page = {href: route.href, title: route.title, state: route.state}
      expect(await listTabs()).toEqual({
        project: {name: 'tabs-fixture', root: app, branch: 'feature-x'},
        tabs: [
          {
            sessionId: await kit().session(),
            harness: 'fake-tabs',
            browserTabs: [{id: expect.stringMatching(/^b\d+$/), page}],
            session,
            page,
          },
        ],
      })
    })

    it('a page query goes to the one browser tab focused last, and the listing names every browser tab', async () => {
      const sessionId = await kit().session()
      const asSession = makeRpcClient(kit().base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
      async function browserTab(pathname: string) {
        const heard: string[] = []
        const answers = {silent: false}
        const socket = new WebSocket(`${kit().wsBase}${PUSH_WS_PATH}?${PUSH_SESSION_PARAM}=${sessionId}`)
        const listening = AbortSignal.timeout(10_000)
        const frames = on(socket, 'message', {signal: listening})
        await once(socket, 'open')
        const report = (focused: boolean) =>
          socket.send(JSON.stringify({channel: 'page-serving', serving: true, focus: {focused, visible: true}}))
        report(false)
        const Frame = z.object({channel: z.string(), requestId: z.string().optional()})
        const ready = Promise.withResolvers<void>()
        const answering = async () => {
          for await (const [data] of frames) {
            const frame = Frame.parse(JSON.parse(String(data)))
            if (frame.channel === 'ready') ready.resolve()
            if (frame.channel !== 'page' || frame.requestId === undefined) continue
            heard.push(pathname)
            if (answers.silent) continue
            const result = {...route, href: `http://localhost:5173${pathname}`, pathname, search: ''}
            await asSession.page.reply({requestId: frame.requestId, outcome: {ok: true, result}})
          }
        }
        answering().catch((error: unknown) => {
          if (!listening.aborted) throw error
        })
        await ready.promise
        pages.push(() => socket.close())
        const silence = () => {
          answers.silent = true
        }
        return {heard, report, silence, close: () => socket.close()}
      }
      const first = await browserTab('/first')
      const second = await browserTab('/second')
      const listedFirst = async () => (await listTabs()).tabs[0]?.browserTabs[0]?.page?.href
      const routeCall = {name: 'page_route', input: {}}
      const routed = async () => z.object({href: z.string()}).parse(await asSession.registry.call(routeCall)).href
      second.report(true)
      await vi.waitFor(async () => expect(await listedFirst()).toBe('http://localhost:5173/second'), {timeout: 3000})
      const listing = await listTabs()
      expect(listing.tabs[0]?.browserTabs.map((entry) => entry.page?.href)).toEqual([
        'http://localhost:5173/second',
        'http://localhost:5173/first',
      ])
      expect(listing.tabs[0]?.page?.href).toBe('http://localhost:5173/second')
      const [firstHeard, secondHeard] = [first.heard.length, second.heard.length]
      expect(await routed()).toBe('http://localhost:5173/second')
      expect([first.heard.length - firstHeard, second.heard.length - secondHeard]).toEqual([0, 1])
      first.report(true)
      await vi.waitFor(async () => expect(await listedFirst()).toBe('http://localhost:5173/first'), {timeout: 3000})
      expect(await routed()).toBe('http://localhost:5173/first')
      first.close()
      await vi.waitFor(async () => expect((await listTabs()).tabs[0]?.browserTabs).toHaveLength(1), {timeout: 3000})
      expect(await routed()).toBe('http://localhost:5173/second')
      second.silence()
      const waited = second.heard.length
      const inFlight = expect(routed()).rejects.toThrow(/browser tab b\d+ closed before it replied/)
      await vi.waitFor(() => expect(second.heard.length).toBe(waited + 1), {timeout: 3000})
      second.close()
      await inFlight
    })

    it.skipIf(process.getuid?.() === 0)(
      'an unreadable package.json leaves the project name out and keeps every tab listed',
      async () => {
        const sessionId = await kit().session()
        await joinPage(true)
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
  type Booted = {base: string; stopped: AbortSignal; answering: Array<Promise<void>>; stop: () => Promise<void>}
  const engines: Booted[] = []
  const pages = new AbortController()
  afterAll(async () => {
    pages.abort()
    const stops = await Promise.allSettled([...engines].map((engine) => engine.stop()))
    const failures = stops.flatMap((stop) => (stop.status === 'rejected' ? [stop.reason] : []))
    if (failures.length > 0) throw new AggregateError(failures, 'stopping the consent engines failed')
  })

  function track(engine: Engine): string {
    const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`
    const stopped = new AbortController()
    const booted: Booted = {
      base,
      stopped: stopped.signal,
      answering: [],
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
    return track(await bootAt(home, tempDir('conciv-consent-'), hubAccess))
  }

  async function openTab(base: string, silent?: () => void, heard: string[] = []): Promise<string> {
    const engine = engines.find((booted) => booted.base === base)
    if (engine === undefined) throw new Error(`no engine was booted at ${base}`)
    const sessionId = await newSession(base)
    const listening = AbortSignal.any([pages.signal, engine.stopped])
    const queries = await rpcOf(base, sessionId).page.queries(undefined, {signal: listening})
    const replies = async () => {
      for await (const {requestId, query} of queries) {
        heard.push(queryName(query))
        if (silent) silent()
        else await rpcOf(base, sessionId).page.reply({requestId, outcome: {ok: true, result: pageAnswer(query)}})
      }
    }
    engine.answering.push(
      replies().catch((error: unknown) => {
        if (!listening.aborted) throw error
      }),
    )
    const tabOpen = async () => TabOpenSchema.parse(await makeRpcClient(base).tabs.get({sessionId}))
    await vi.waitFor(async () => expect((await tabOpen()).open).toBe(true), {timeout: 3000})
    return sessionId
  }

  const outside = (base: string, code: string): Promise<string> => executeOverMcp(base, HUB, code).then(String, String)

  const SCREENSHOT = {image: 'UklGRhYAAABXRUJQVlA4', width: 1, height: 1}

  const queryName = (query: unknown) => z.object({name: z.string()}).safeParse(query).data?.name ?? ''

  const pageAnswer = (query: unknown) => (queryName(query) === 'page_screenshot' ? SCREENSHOT : ROUTE)

  const rpcOf = (base: string, sessionId: string) =>
    makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})

  const newSession = async (base: string) => (await makeRpcClient(base).sessions.create(undefined)).sessionId

  const hubCall = (base: string, sessionId: string): Promise<string> =>
    executeOverMcp(base, {[CONCIV_SESSION_HEADER]: sessionId, ...HUB}, 'return 1').then(String, String)

  const pendingOf = async (base: string, sessionId: string) =>
    (await rpcOf(base, sessionId).chat.hydrate({sessionId})).pendingApprovals

  async function toolStarts(base: string, sessionId: string, count = 1): Promise<() => Promise<unknown[]>> {
    const events = await rpcOf(base, sessionId).chat.events({sessionId}, {signal: pages.signal})
    return async () => {
      const seen: unknown[] = []
      for await (const chunk of events) {
        if (chunk.type === ChatEventType.TOOL_CALL_START) seen.push(chunk)
        if (seen.length === count) return seen
      }
      return seen
    }
  }

  async function askRaised(base: string, sessionId: string): Promise<ReturnType<typeof approvalAskOf>> {
    const raised = new AbortController()
    const signal = AbortSignal.any([raised.signal, pages.signal])
    const events = await rpcOf(base, sessionId).chat.events({sessionId}, {signal})
    try {
      for await (const chunk of events) {
        const ask = approvalAskOf(chunk)
        if (ask !== null) return ask
      }
      return null
    } finally {
      raised.abort()
    }
  }

  async function decideOutside(base: string, sessionId: string, approved: boolean): Promise<void> {
    expect(await askRaised(base, sessionId)).toMatchObject(OUTSIDE_ASK)
    const pending = await pendingOf(base, sessionId)
    expect(pending).toHaveLength(1)
    const [ask] = pending
    expect(ask).toMatchObject({...OUTSIDE_ASK, runId: null})
    const decision = await rpcOf(base, sessionId).chat.permissionDecision({approvalId: ask?.approvalId ?? '', approved})
    expect(decision.startsTurn).toBe(false)
  }

  it('session policy holds hub calls until the user answers: one allow releases every waiting call of its session only, a deny fails them and sticks until allowed', async () => {
    const base = await boot()
    const [first, second] = [await newSession(base), await newSession(base)]
    const lister = await connectMcpClient(`${base}/api/mcp`, {[CONCIV_SESSION_HEADER]: first, ...HUB})
    await lister.tools()
    await lister.close()
    expect(await pendingOf(base, first)).toEqual([])
    const waiting = [hubCall(base, first), hubCall(base, first)]
    await decideOutside(base, first, true)
    expect(await Promise.all(waiting)).toEqual([expect.stringMatching(RAN), expect.stringMatching(RAN)])
    expect(await hubCall(base, first)).toMatch(RAN)
    const refused = hubCall(base, second)
    await decideOutside(base, second, false)
    expect(await refused).toContain(DENIED)
    expect(await hubCall(base, second)).toContain(DENIED)
    expect(await pendingOf(base, second)).toEqual([])
    const rpc = rpcOf(base, second)
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
    const events = await rpcOf(base, sessionId).chat.events({sessionId}, {signal: AbortSignal.timeout(2000)})
    const first = await events[Symbol.asyncIterator]()
      .next()
      .catch((error: unknown): {done: true; value: string} => ({done: true, value: String(error)}))
    expect(first.done === false ? approvalAskOf(first.value) : first.value).toMatchObject({
      toolName: 'Allow codex to use this tab',
      input: {client: 'codex'},
    })
    await decideOutside(base, sessionId, true)
    expect(await waiting).toMatch(RAN)
  })

  it("an outside run lists every engine's tabs and refuses other capabilities with NO_TAB; a hub call naming the tab runs it after allow, marked in its chat", async () => {
    const home = tempDir('conciv-home-')
    const [runner, owner] = [await boot('open', home), await boot('session', home)]
    const [mine, theirs] = [await openTab(runner), await openTab(owner)]
    const hung = createServer(() => {})
    hung.listen(0, '127.0.0.1')
    await once(hung, 'listening')
    onTestFinished(() => {
      hung.closeAllConnections()
      hung.close()
    })
    const hungAddress = z.object({port: z.number()}).parse(hung.address())
    const hungRoot = tempDir('conciv-hung-')
    const hungBase = `http://127.0.0.1:${hungAddress.port}/t/${randomUUID()}`
    withHomeDb(home, (db) =>
      registerEngine(db, {id: randomUUID(), pid: process.pid, root: hungRoot, apiBase: hungBase}),
    )
    const inPage = 'return [typeof external_tabs, typeof external_use_tab]'
    expect(String(await executeOverMcp(runner, {[CONCIV_SESSION_HEADER]: mine}, inPage))).toContain(
      '["function","undefined"]',
    )
    const listed = await outside(runner, 'return await external_tabs({})')
    expect(listed).toContain(`"tab":"${mine}"`)
    expect(listed).toContain(`"tab":"${theirs}"`)
    expect(listed).toContain(`"unreachable":[{"root":"${hungRoot}"`)
    expect(listed).not.toMatch(new RegExp(`${new URL(runner).pathname}|${new URL(owner).pathname}`))
    expect(await outside(runner, 'return await external_page_route({})')).toContain(
      'NO_TAB: pass tab to execute_typescript; external_tabs({}) lists the open tabs',
    )
    const onTab = (code: string) => executeOverMcp(owner, {[CONCIV_SESSION_HEADER]: theirs, ...HUB}, code)
    const routed = onTab('return await external_page_route({})').then(String)
    await decideOutside(owner, theirs, true)
    expect(await routed).toContain(ROUTE.href)
    const ownerCalls = await rpcOf(owner, theirs).chat.hydrate({sessionId: theirs})
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
    const asked = hubRpc.page.changes(undefined).then(String, String)
    await decideOutside(base, sessionId, false)
    expect(await asked).toContain(DENIED)
    expect(await hubRpc.page.clearChanges(undefined).then(String, String)).toContain(DENIED)
    expect(await hubRpc.chat.allowOutside({sessionId}).then(String, String)).toContain("outside agents can't answer")
    expect(await hubRpc.chat.hydrate({sessionId}).then(String, String)).toContain(DENIED)
    const own = rpcOf(base, sessionId)
    expect(await own.chat.outsideAccess({sessionId})).toEqual({denied: true})
    expect(await own.page.changes(undefined)).toEqual([])
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
    const extOf = (headers: Record<string, string>): RouterClient<typeof router> =>
      createORPCClient(new RPCLink({url: `${base}/rpc/ext/consent-probe`, fetch: abortableFetch, headers}))
    const asked = extOf(HUB).touch({sessionId}).then(String, String)
    await decideOutside(base, sessionId, false)
    expect(await asked).toContain(DENIED)
    expect(touched).toEqual([])
    expect(await extOf({}).touch({sessionId})).toEqual({touched: true})
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
    await vi.waitFor(async () => expect(await pendingOf(base, sessionId)).toHaveLength(1), {timeout: 3000})
    const [ask] = await pendingOf(base, sessionId)
    expect(ask).toMatchObject({toolName: 'Allow terminal to use this tab', input: {client: 'terminal'}})
    await rpcOf(base, sessionId).chat.permissionDecision({approvalId: ask?.approvalId ?? '', approved: false})
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
    await vi.waitFor(async () => expect(await pendingOf(base, sessionId)).toHaveLength(1), {timeout: 3000})
    forget()
    await decideOutside(base, sessionId, true)
    expect(await overMcp).toContain('Codex is disconnected from conciv')
    connectedHome(home)
    const tab = await openTab(base)
    const overRpc = makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: tab, ...HUB}})
      .registry.call({name: 'page_route', input: {}})
      .then(String, String)
    await vi.waitFor(async () => expect(await pendingOf(base, tab)).toHaveLength(1), {timeout: 3000})
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
      await vi.waitFor(async () => expect(await pendingOf(base, sessionId)).toHaveLength(1), {timeout: 3000})
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

  it('an allowed outside agent still cannot answer permission requests: its decision and allow are refused and the card stays', async () => {
    const base = await boot()
    const sessionId = await newSession(base)
    const allowed = hubCall(base, sessionId)
    await decideOutside(base, sessionId, true)
    expect(await allowed).toMatch(RAN)
    const own = rpcOf(base, sessionId)
    const waiting = own.registry.call({name: 'server_restart', input: {}}).then(String, String)
    const raised = await askRaised(base, sessionId)
    const [card] = await pendingOf(base, sessionId)
    expect(card?.approvalId).toBe(raised?.approvalId)
    const hubRpc = makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId, ...HUB}})
    const decision = {approvalId: card?.approvalId ?? '', approved: true}
    const refusal = "outside agents can't answer permission requests; decide it in the tab"
    expect(await hubRpc.chat.permissionDecision(decision).then(String, String)).toContain(refusal)
    expect(await hubRpc.chat.allowOutside({sessionId}).then(String, String)).toContain(refusal)
    expect(await pendingOf(base, sessionId)).toEqual([card])
    await own.chat.permissionDecision({approvalId: card?.approvalId ?? '', approved: false})
    await waiting
  })

  it('a stopped engine leaves the listing, a page that never answers lists no href, and a corrupt home db names the folder', async () => {
    const home = tempDir('conciv-home-')
    const [runner, owner] = [await boot('open', home), await boot('open', home)]
    const silent = await openTab(owner, () => {})
    const listing = await outside(runner, 'return await external_tabs({})')
    expect([listing.includes(`"tab":"${silent}"`), listing.includes('href')]).toEqual([true, false])
    await engines.at(-1)?.stop()
    expect(await outside(runner, 'return await external_tabs({})')).toContain('{"tabs":[],"unreachable":[]}')
    writeFileSync(join(home, 'home.db'), 'garbage '.repeat(512))
    expect(await outside(runner, 'return await external_tabs({})')).toContain(home)
  })

  it('a hub-origin rpc tool call waits for the allow and runs marked, a caller that leaves stops waiting, a plain rpc call never asks, project policy allows every session', async () => {
    const base = await boot('project')
    const sessionId = await openTab(base)
    const route = {name: 'page_route', input: {}}
    const hubRpc = makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId, ...HUB}})
    expect(await rpcOf(base, sessionId).registry.call(route)).toMatchObject({href: ROUTE.href})
    expect(await pendingOf(base, sessionId)).toEqual([])
    const leaving = new AbortController()
    const left = hubRpc.registry.call(route, {signal: leaving.signal})
    expect(await askRaised(base, sessionId)).toMatchObject(OUTSIDE_ASK)
    leaving.abort()
    await expect(left).rejects.toThrow()
    expect(await pendingOf(base, sessionId)).toHaveLength(1)
    const starts = await toolStarts(base, sessionId, 2)
    const waiting = hubRpc.registry.call(route)
    await decideOutside(base, sessionId, true)
    expect(await waiting).toMatchObject({href: ROUTE.href})
    await expect(hubRpc.server.urls()).rejects.toMatchObject({code: 'NO_BUNDLER'})
    expect(await starts()).toEqual([
      expect.objectContaining({
        toolCallName: 'page_route',
        metadata: {conciv: {origin: 'hub', client: 'codex', run: expect.any(String)}},
      }),
      expect.objectContaining({toolCallName: 'server_urls'}),
    ])
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
    expect(await pendingOf(base, second)).toEqual([])
    await rpcOf(base, first).chat.allowOutside({sessionId: first})
    const allowed = await raise()
    await decideOutside(base, second, true)
    expect(await Promise.all(allowed)).toEqual([expect.stringMatching(RAN), expect.stringMatching(RAN)])
    expect(await pendingOf(base, first)).toEqual([])
  })

  it('an outside agent runs an asking tool with no Approve card, while the agent inside the tab is still asked', async () => {
    const base = await boot('open')
    const sessionId = await newSession(base)
    const restart = {name: 'server_restart', input: {}}
    const overMcp = async (headers: Record<string, string>) => {
      const mcp = await connectMcpClient(`${base}/api/mcp`, headers)
      try {
        const tool = (await mcp.tools()).find((entry) => entry.name === restart.name)
        return String(await tool?.execute(restart.input).then(JSON.stringify, String))
      } finally {
        await mcp.close()
      }
    }
    const overRpc = (headers: Record<string, string>) =>
      makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId, ...headers}})
        .registry.call(restart)
        .then(String, String)
    const outsideCalls = [
      await overRpc({...HUB, [CONCIV_NAMED_TAB_HEADER]: '1'}),
      await overMcp({[CONCIV_SESSION_HEADER]: sessionId, ...HUB}),
      await overMcp({[CONCIV_CLAUDE_SESSION_HEADER]: 'plugin-bridge-native'}),
    ]
    const ran = expect.stringMatching(/no dev server is attached to conciv/)
    expect(outsideCalls).toEqual([ran, ran, ran])
    expect(await pendingOf(base, sessionId)).toEqual([])
    expect(await overRpc(HUB)).toMatch(/needs the user/)
    expect((await pendingOf(base, sessionId)).map((ask) => ask.toolName)).toEqual([restart.name])
    const insideCalls = [
      await rpcOf(base, sessionId).registry.call(restart).then(String, String),
      await overMcp({[CONCIV_SESSION_HEADER]: sessionId}),
    ]
    expect(insideCalls).toEqual([expect.stringMatching(/needs the user/), expect.stringMatching(/needs the user/)])
    expect((await pendingOf(base, sessionId)).map((ask) => ask.toolName)).toEqual([restart.name])
  })

  it('open policy never asks, and hub calls are marked in the transcript', async () => {
    const base = await boot('open')
    const sessionId = await newSession(base)
    const starts = await toolStarts(base, sessionId)
    expect(await hubCall(base, sessionId)).toMatch(RAN)
    expect(await starts()).toMatchObject([{metadata: {conciv: {origin: 'hub', client: 'codex'}}}])
    expect(await pendingOf(base, sessionId)).toEqual([])
    const together = await Promise.all(Array.from({length: 12}, () => hubCall(base, sessionId)))
    expect(together).toEqual(Array.from({length: 12}, () => expect.stringMatching(RAN)))
    const saved = (await rpcOf(base, sessionId).chat.hydrate({sessionId})).messages.flatMap((message) =>
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
    made().chat.db.update(sessions).set({updatedAt: ROW_AT}).where(eq(sessions.id, sessionId)).run()
    return sessionId
  }

  it('a hub tool call recorded through the call trace alone bumps lastActive', async () => {
    const sessionId = await staleSession()
    const hub: Record<string, string> = {[CONCIV_ORIGIN_HEADER]: 'hub', [CONCIV_CLIENT_HEADER]: 'codex'}
    const trace = callTrace((name) => hub[name] ?? null)
    const run = {threadId: sessionId, live: false}
    const before = Date.now()
    const mirror = trace.mirror(run, {publish: () => {}, record: (chunks) => made().plane.record(sessionId, chunks)})
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
    made().chat.db.update(sessions).set({harnessSessionId: nativeId}).where(eq(sessions.id, native)).run()
    const before = Date.now()
    await runTurn(kit(), 'a message to a native session', native)
    const row = made().chat.db.select().from(sessions).where(eq(sessions.id, native)).get()
    expect(row?.title).toBeNull()
    expect(row?.updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('importing a transcript stamps lastActive with its newest message time, not the time it was opened', async () => {
    const sessionId = await staleSession()
    made().chat.db.update(sessions).set({harnessSessionId: IMPORTED_NATIVE}).where(eq(sessions.id, sessionId)).run()
    await kit().hydrate(sessionId)
    const reopened = await kit().hydrate(sessionId)
    const row = made().chat.db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    expect(reopened.messages.map((message) => message.id)).toEqual(['imported-user', 'imported-reply'])
    expect(row).toMatchObject({title: null, updatedAt: WRITTEN_AT})
  })

  it('a session with no messages keeps its row time and the New session title', async () => {
    const sessionId = await staleSession()
    expect(await kit().rpc.sessions.get({sessionId})).toMatchObject({title: 'New session', updatedAt: ROW_AT})
  })

  it('the fix-up migration repairs a stale row from its newest message and first user message, and leaves a native-backed row untitled', () => {
    const stateRoot = tempDir('conciv-activity-fixup-')
    const stateDir = join(stateRoot, '.conciv')
    mkdirSync(stateDir, {recursive: true})
    const client = new DatabaseSync(join(stateDir, 'conciv.db'))
    const fixup = migrations.findIndex((migration) => migration.name.endsWith('_session_activity_fixup'))
    migrateSync(migrations.slice(0, fixup), drizzle({client})._.session)
    const row = {harnessKind: 'claude', origin: 'chat', cwd: stateRoot, createdAt: ROW_AT, updatedAt: ROW_AT} as const
    const stale = drizzle({client})
    stale
      .insert(sessions)
      .values([
        {...row, id: SessionId.parse('conciv_stale'), title: null},
        {...row, id: SessionId.parse('conciv_titled'), title: 'kept'},
        {...row, id: SessionId.parse('conciv_quiet'), title: null},
        {
          ...row,
          id: SessionId.parse('conciv_native'),
          title: null,
          harnessSessionId: HarnessSessionId.parse(randomUUID()),
        },
      ])
      .run()
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
    const db = openDb(stateRoot)
    const repaired = db
      .select({id: sessions.id, title: sessions.title, updatedAt: sessions.updatedAt})
      .from(sessions)
      .orderBy(asc(sessions.id))
      .all()
    db.$client.close()
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
  const pages = new AbortController()
  const engines: Engine[] = []
  afterAll(async () => {
    pages.abort()
    await Promise.all(engines.map((engine) => engine.stop()))
  })

  type QueuedOnTab = {id: string; replies: string[]}

  async function engineWithTab(harness = createFakeHarness()) {
    const home = tempDir('conciv-queue-home-')
    withHomeDb(home, (db) => recordHubConnection(db, 'codex', Date.now()))
    const engine = await bootAt(home, tempDir('conciv-queue-'), 'open', harness)
    engines.push(engine)
    const base = `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`
    const sessionId = (await makeRpcClient(base).sessions.create(undefined)).sessionId
    const tab = makeRpcClient(base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}})
    const closed = new AbortController()
    const queries = await tab.page.queries(undefined, {signal: AbortSignal.any([pages.signal, closed.signal])})
    const accepted: QueuedOnTab[] = []
    const arrivals = new EventTarget()
    const answer = async (): Promise<void> => {
      for await (const {requestId, query} of queries) {
        const parsed = PageQuerySchema.parse(query)
        if (parsed.queue === undefined) {
          await tab.page.reply({requestId, outcome: {ok: true, result: {}}})
          continue
        }
        const {id, replies} = parsed.queue
        await tab.page.reply({requestId, outcome: {ok: true, result: {queueId: id, actions: replies.length}}})
        accepted.push({id, replies})
        arrivals.dispatchEvent(new Event('queue'))
      }
    }
    const answering = answer().catch((error: unknown) => {
      if (!closed.signal.aborted && !pages.signal.aborted) throw error
    })
    const nextQueue = async (): Promise<QueuedOnTab> => {
      const known = accepted.shift()
      if (known !== undefined) return known
      await once(arrivals, 'queue')
      return nextQueue()
    }
    const play = (queued: QueuedOnTab, index: number, outcome: PageOutcome) =>
      tab.page.reply({requestId: queued.replies[index] ?? '', outcome})
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
      const joined = webSocket(`ws://127.0.0.1:${engine.port}/t/${engine.agentToken}${CHAT_WS_PATH}`)
      for await (const chunk of joined.joinRun(runId, pages.signal)) {
        if (chunk.type === ChatEventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls') return
      }
    }
    const tabOpen = async () => TabOpenSchema.parse(await makeRpcClient(base).tabs.get({sessionId}))
    await vi.waitFor(async () => expect((await tabOpen()).open).toBe(true), {timeout: 3000})
    const hub = (code: string) => executeOverMcp(base, {...HUB, [CONCIV_SESSION_HEADER]: sessionId}, code)
    const close = async () => {
      closed.abort()
      await answering
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
      sessionId,
      engine,
      tab,
      nextQueue,
      play,
      hub,
      discover,
      close,
      queueEvents,
      finishedEvent,
      followUpFinished,
      runIds,
      seenChunk,
    }
  }

  const queued = (actions: unknown[] = ACTIONS) =>
    `return await external_page_queue_async({actions: ${JSON.stringify(actions)}})`

  const played = `return await external_page_queue({actions: ${JSON.stringify(ACTIONS)}})`

  function handleOf(reply: unknown): {queueId: string; actions: number} {
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
    await page.play(onTab, 0, {ok: true, result: {ok: true, value: 'Ada'}})
    await page.play(onTab, 1, {ok: true, result: {ok: true, checked: true}})
    await page.finishedEvent(onTab.id)
    expect(await typed.page.queue.wait({sessionId: page.sessionId, queueId: onTab.id, waitMs: 0})).toMatchObject({
      queueId: onTab.id,
      status: 'finished',
      played: 2,
    })
  })

  it('external_page_queue_async answers with a queue id before the tab has played anything', async () => {
    const page = await engineWithTab()
    const handle = handleOf(await page.hub(queued()))
    expect(handle).toEqual({queueId: expect.stringMatching(/^q_/), actions: 2})
    expect((await page.nextQueue()).id).toBe(handle.queueId)
  })

  it('a page.queue.wait its caller aborts stops waiting, so the result it never handed over leads the next reply', async () => {
    const page = await engineWithTab()
    const {queueId} = handleOf(await page.hub(queued()))
    const onTab = await page.nextQueue()
    const caller = new AbortController()
    const typed = makeRpcClient(page.base, {headers: HUB})
    const waiting = typed.page.queue.wait({sessionId: page.sessionId, queueId, waitMs: 60_000}, {signal: caller.signal})
    expect(await typed.tabs.get({sessionId: page.sessionId})).toMatchObject({open: true})
    caller.abort()
    await expect(waiting).rejects.toMatchObject({name: 'AbortError'})
    expect(await typed.tabs.get({sessionId: page.sessionId})).toMatchObject({open: true})
    await page.play(onTab, 0, {ok: true, result: {ok: true, value: 'Ada'}})
    await page.play(onTab, 1, {ok: true, result: {ok: true, checked: true}})
    await page.finishedEvent(queueId)
    expect(JSON.stringify(await page.hub('return 1'))).toContain(`queue ${queueId} finished: 2 played, 0 failed`)
  }, 5000)

  it('a code.execute its caller aborts hands over no finished result, so that result leads the next reply', async () => {
    const page = await engineWithTab()
    const {queueId} = handleOf(await page.hub(queued()))
    const first = await page.nextQueue()
    await page.play(first, 0, {ok: true, result: {ok: true, value: 'Ada'}})
    await page.play(first, 1, {ok: true, result: {ok: true, checked: true}})
    await page.finishedEvent(queueId)
    const caller = new AbortController()
    const typed = makeRpcClient(page.base, {headers: HUB})
    const running = typed.code.execute({sessionId: page.sessionId, typescriptCode: played}, {signal: caller.signal})
    const blocking = await page.nextQueue()
    caller.abort()
    await expect(running).rejects.toMatchObject({name: 'AbortError'})
    await page.seenChunk(
      (chunk) => chunk.type === ChatEventType.TOOL_CALL_RESULT && chunk.content.includes('Code execution was stopped'),
    )
    expect(blocking.id).not.toBe(queueId)
    expect(JSON.stringify(await page.hub('return 1'))).toContain(`queue ${queueId} finished: 2 played, 0 failed`)
  }, 5000)

  it('the next reply for that session carries the finished result once, and the reply after does not', async () => {
    const page = await engineWithTab()
    const {queueId} = handleOf(await page.hub(queued()))
    const onTab = await page.nextQueue()
    await page.play(onTab, 0, {ok: true, result: {ok: true, value: 'Ada'}})
    await page.play(onTab, 1, {ok: false, error: {code: 'invalid-args', message: 'That element is disabled.'}})
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
        {index: 1, tool: 'page_check', ok: false, error: 'That element is disabled.'},
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
            ? {ok: true, result: {ok: true, value: 'v'.repeat(3000)}}
            : {ok: false, error: {code: 'invalid-args', message: 'e'.repeat(3000)}},
        )
      }
    }
    const expected = actions.map((_, index) =>
      index % 2 === 0
        ? {index, tool: 'page_fill', ok: true, result: expect.any(Object)}
        : {index, tool: 'page_fill', ok: false, error: expect.stringMatching(/^e+/)},
    )
    const noticed = (text: string | undefined) =>
      PageQueueResultSchema.parse(JSON.parse(text?.split('\n').slice(1).join('\n') ?? ''))
    const {queueId} = handleOf(await page.hub(queued(actions)))
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
    const {queueId} = handleOf(await page.hub(queued()))
    const onTab = await page.nextQueue()
    await page.play(onTab, 0, {ok: true, result: {ok: true, value: 'Ada'}})
    await page.play(onTab, 1, {ok: true, result: {ok: true, checked: true}})
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
    await page.play(onTab, 0, {ok: true, result: {ok: true, value: 'Ada'}})
    await page.play(onTab, 1, {ok: true, result: {ok: true, checked: true}})
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
    await page.play(onTab, 0, {ok: true, result: {ok: true, value: 'Ada'}})
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
    const handle = page.tab.registry.call({name: 'page_queue_async', input: {actions: ACTIONS}})
    const onTab = await page.nextQueue()
    const {queueId} = z.object({queueId: z.string()}).parse(await handle)
    await page.play(onTab, 0, {ok: true, result: {ok: true, value: 'Ada'}})
    await page.play(onTab, 1, {ok: true, result: {ok: true, checked: true}})
    await page.finishedEvent(queueId)
    expect(page.queueEvents()).toEqual([expect.objectContaining({queueId, status: 'finished', played: 2, failed: 0})])
    await page.followUpFinished()
    const hydrated = await page.tab.chat.hydrate({sessionId: page.sessionId})
    const parts = hydrated.messages
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.parts)
    expect(parts).toContainEqual(expect.objectContaining({type: 'tool-call', name: 'page_queue_async'}))
    expect(parts).toContainEqual({type: 'text', content: 'ok'})
    expect(hydrated.activeRun).toBeNull()
    expect(page.queueEvents()).toHaveLength(1)
  })

  it('an in-page queue that finishes while its run is live starts the follow-up turn once that run ends', async () => {
    const harness = createFakeHarness()
    const page = await engineWithTab(harness)
    harness.script.hold()
    const viewer = new AbortController()
    onTestFinished(() => viewer.abort())
    const turn = fetch(`${page.base}${CHAT_SSE_PATH}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        threadId: page.sessionId,
        runId: 'queueing-run',
        messages: [{id: 'queueing-run-user', role: 'user', content: 'fill the form'}],
        tools: [],
        context: [],
      }),
      signal: viewer.signal,
    })
    await page.seenChunk(() => page.runIds().includes('queueing-run'))
    const handle = page.tab.registry.call({name: 'page_queue_async', input: {actions: ACTIONS}})
    const onTab = await page.nextQueue()
    const {queueId} = z.object({queueId: z.string()}).parse(await handle)
    await page.play(onTab, 0, {ok: true, result: {ok: true, value: 'Ada'}})
    await page.play(onTab, 1, {ok: true, result: {ok: true, checked: true}})
    await page.finishedEvent(queueId)
    harness.script.release()
    await (await turn).text()
    await page.followUpFinished(['queueing-run'])
    expect(page.runIds().filter((runId) => runId !== 'queueing-run')).toHaveLength(1)
    expect((await page.tab.chat.hydrate({sessionId: page.sessionId})).activeRun).toBeNull()
  })
})
