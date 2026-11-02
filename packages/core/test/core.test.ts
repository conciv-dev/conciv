import {spawnSync} from 'node:child_process'
import {mkdtempSync, rmSync, readFileSync, statSync, writeFileSync, mkdirSync, utimesSync} from 'node:fs'
import {createServer} from 'node:net'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, it, expect, afterEach, afterAll, beforeAll, test, beforeEach} from 'vitest'
import {makeTextAdapter} from '@conciv/ai/server'
import {createToolCallChunks} from '@conciv/ai/testkit'
import {
  cappedValue,
  createChatPlane,
  registryCapabilities,
  safeStringify,
  type ChatPlane,
  type CodeCapability,
  type SessionPort,
} from '@conciv/chat'
import {type EngineStaleness} from '@conciv/contract'
import {openDb, type ConcivDb} from '@conciv/db'
import {defineTool, defineExtension} from '@conciv/extension'
import {type SandboxTool} from '@conciv/extension/registry'
import {type HarnessAdapter, defineHarness} from '@conciv/harness'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {type ChatMessage} from '@conciv/protocol/chat-message-types'
import {CHAT_SSE_PATH, SessionId} from '@conciv/protocol/chat-types'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import getPort from 'get-port'
import {defineWebSocketHelper} from 'hono/ws'
import {z} from 'zod'
import {serverInstructions} from '../src/api/mcp.js'
import {hostDocument} from '../src/api/native-page.js'
import {resolveConfig, defineConfig} from '../src/config.js'
import {symbolicateFrame} from '../src/editor/symbolicate.js'
import {readDevEndpoint, removeDevEndpoint, writeDevEndpoint} from '../src/lib/dev-endpoint.js'
import {makeStalenessProbe} from '../src/lib/engine-stamp.js'
import {statePaths} from '../src/lib/state-paths.js'
import {makePageTabs, type PageTab} from '../src/page-bus.js'
import {makeCoreRuntime} from '../src/runtime/core-runtime.js'
import {makeSessionPrimitives, type SessionPrimitives} from '../src/runtime/primitives.js'
import {type CoreRuntime} from '../src/runtime/scope-types.js'
import {runWithSession} from '../src/runtime/session-context.js'
import {start, composeSystemPrompt} from '../src/start.js'
import {chunkWithInlineMap, cleanupChunks, makeChatFixture, type ChatFixture} from './helpers.js'

describe('api mcp instructions', () => {
  const FRESH = {stale: false, changed: [], tracked: ['@conciv/core'], bootedAt: 0, fingerprint: 'aaaa1111'}

  describe('mcp server instructions', () => {
    it('says nothing about staleness while the engine matches the code on disk', () => {
      const text = serverInstructions('page', FRESH)

      expect(text).not.toMatch(/outdated|restart the dev server/i)
    })
  })
})

describe('api native page document', () => {
  describe('native host document', () => {
    it('pins the viewport so the WebView cannot pinch-zoom or rescale the overlay', () => {
      const html = hostDocument()
      const viewport = /<meta name="viewport" content="([^"]+)">/.exec(html)?.[1]
      expect(viewport).toContain('maximum-scale=1')
      expect(viewport).toContain('user-scalable=no')
      expect(viewport).toContain('viewport-fit=cover')
    })
  })
})

describe('chat plane', () => {
  afterEach(() => {
    for (const db of opened.splice(0)) db.$client.close()
    for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
  })

  describe('result cap', () => {
    it('unserializable values become "value could not be serialized"; small values pass through unchanged', () => {
      const circular: Record<string, unknown> = {}
      circular.self = circular
      expect(cappedValue({big: 1n})).toMatchObject({error: 'value could not be serialized'})
      expect(JSON.parse(safeStringify(circular))).toMatchObject({error: 'value could not be serialized'})
      expect(cappedValue({ok: 1})).toEqual({ok: 1})
      expect(safeStringify({ok: 1})).toBe('{"ok":1}')
    })
  })

  describe('code mode capabilities', () => {
    it('a tool description folds in its hint', () => {
      const [capability] = registryCapabilities([sandboxTool('Prefer small inputs')], async () => null)
      expect(capability?.description).toBe('Do the unit thing. Prefer small inputs.\n\nReturns JSON matching: {}')
    })

    it('a capability with a credential-shaped parameter fails its own execution, not the turn', async () => {
      const root = stateRoot()
      const secret = echoCapability({name: 'unit_secret', inputSchema: z.object({apiKey: z.string()})})
      const chat = await plane({root, harness: cliHarness(fakeCli()), capabilities: [echoCapability(), secret]})
      const seen = await readUntil(await startTurn(chat, sessionId('secret'), 'secret-run', 'hi'), 'end')
      expect(seen).toContain(ChatEventType.RUN_FINISHED)
      const runner = await chat.codeRunner(SessionId.parse(sessionId('secret')), () => undefined)
      await expect(runner?.run('return await external_unit_secret({apiKey: "k"})', 'parent')).rejects.toThrow(/secret/i)
    })
  })

  describe('system prompt', () => {
    it('an unreadable systemPromptFile logs a line with the path and the turn uses systemPromptText', async () => {
      const root = stateRoot()
      const cli = fakeCli()
      const log: string[] = []
      const missing = join(root, 'no-such-prompt.md')
      const chat = await plane({
        root,
        harness: cliHarness(cli),
        systemPrompt: {systemPromptFile: missing, systemPromptText: 'the fallback prompt'},
        log,
      })
      await readUntil(await startTurn(chat, sessionId('prompt'), 'prompt-run', 'hi'), 'end')
      expect(cli.systemPrompts.flat()).toContain('the fallback prompt')
      expect(log.some((line) => line.includes(missing))).toBe(true)
    })
  })

  describe('boot recovery and restart', () => {
    it('a run a dead process left running becomes aborted with a finish time on the next boot', async () => {
      const root = stateRoot()
      const cli = fakeCli()
      cli.steps.push('partial')
      const first = await plane({root, harness: cliHarness(cli)})
      await readUntil(
        await startTurn(first, sessionId('reclaim'), 'reclaim-run', 'interrupted'),
        ChatEventType.TEXT_MESSAGE_CONTENT,
      )
      const next = await plane({root, harness: cliHarness(fakeCli())})
      const lastRun = (await next.hydrate(SessionId.parse(sessionId('reclaim')))).lastRun
      expect(lastRun).toMatchObject({runId: 'reclaim-run', phase: 'aborted'})
      expect(lastRun?.finishedAt).toEqual(expect.any(Number))
      cli.release()
    })

    it('finished turns and a turn interrupted by a restart all show after the restart', async () => {
      const root = stateRoot()
      const cli = fakeCli()
      cli.steps.push('reply', 'partial')
      const first = await plane({root, harness: cliHarness(cli)})
      const id = sessionId('durable')
      await readUntil(await startTurn(first, id, 'durable-1', 'finished turn'), 'end')
      await readUntil(await startTurn(first, id, 'durable-2', 'interrupted turn'), ChatEventType.TEXT_MESSAGE_CONTENT)
      const next = await plane({root, harness: cliHarness(fakeCli())})
      const texts = (await next.history(SessionId.parse(id))).map((message) =>
        message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(''),
      )
      expect(texts).toEqual(['finished turn', 'partial reply', 'interrupted turn', 'partial reply'])
      cli.release()
    })
  })

  describe('stop', () => {
    it('a hydrate after Stop shows every word the client saw, not the last throttled snapshot', async () => {
      const root = stateRoot()
      const cli = fakeCli()
      cli.steps.push('streaming')
      const chat = await plane({root, harness: cliHarness(cli)})
      const id = SessionId.parse(sessionId('stopped-mid-text'))
      const seen = await readText(await startTurn(chat, id, 'stopped-mid-text', 'keep talking'), STREAMED_TEXT)
      await chat.stop(id)
      const texts = (await chat.hydrate(id)).messages.map((message) =>
        message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(''),
      )
      expect(seen).toBe(STREAMED_TEXT)
      expect(texts).toEqual(['keep talking', STREAMED_TEXT])
      cli.release()
    })

    it('a stopped turn keeps its tool call after the next turn answers', async () => {
      const root = stateRoot()
      const cli = fakeCli()
      cli.steps.push('tooling', 'reply')
      const chat = await plane({root, harness: cliHarness(cli)})
      const id = SessionId.parse(sessionId('stopped-tool'))
      await readUntil(await startTurn(chat, id, 'stopped-tool', 'run the tool'), ChatEventType.TOOL_CALL_END)
      await chat.stop(id)
      const stopped = partTypes(await chat.history(id))
      await readUntil(await startTurn(chat, id, 'after-stop', 'follow up'), 'end')
      expect(partTypes(await chat.history(id))).toEqual([...stopped, ['text'], ['text']])
      expect(stopped.flat()).toContain('tool-call')
      cli.release()
    })
  })

  type CliStep = 'reply' | 'partial' | 'streaming' | 'tooling'

  const STREAMED_TEXT = 'partial reply and the words after the last snapshot'

  type FakeCli = {steps: CliStep[]; systemPrompts: string[][]; gate: Promise<void>; release: () => void}

  const roots: string[] = []
  const opened: ConcivDb[] = []

  function stateRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'conciv-chat-unit-'))
    roots.push(root)
    return root
  }

  function fakeCli(): FakeCli {
    const held: {release: () => void} = {release: () => undefined}
    const gate = new Promise<void>((resolve) => {
      held.release = resolve
    })
    return {steps: [], systemPrompts: [], gate, release: () => held.release()}
  }

  function aborted(signal: AbortSignal | undefined): Promise<void> {
    return new Promise((settle) => signal?.addEventListener('abort', () => settle(), {once: true}))
  }

  const FIRST_DELTA = 'partial reply'

  type StepRun = {cli: FakeCli; step: CliStep; run: {threadId: string; runId: string}; signal: AbortSignal | undefined}

  async function* answer({cli, step, run}: StepRun): AsyncGenerator<ChatEvent> {
    yield {type: ChatEventType.TEXT_MESSAGE_START, messageId: `${run.runId}-a`, role: 'assistant'}
    yield {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: `${run.runId}-a`, delta: FIRST_DELTA}
    if (step === 'partial') await cli.gate
    yield {type: ChatEventType.TEXT_MESSAGE_END, messageId: `${run.runId}-a`}
    yield {type: ChatEventType.RUN_FINISHED, ...run}
  }

  async function* cutOffMidText({cli, run, signal}: StepRun): AsyncGenerator<ChatEvent> {
    yield {type: ChatEventType.TEXT_MESSAGE_START, messageId: `${run.runId}-a`, role: 'assistant'}
    yield {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: `${run.runId}-a`, delta: FIRST_DELTA}
    yield {
      type: ChatEventType.TEXT_MESSAGE_CONTENT,
      messageId: `${run.runId}-a`,
      delta: STREAMED_TEXT.slice(FIRST_DELTA.length),
    }
    await Promise.race([cli.gate, aborted(signal)])
  }

  async function* stuckInTool({cli, run, signal}: StepRun): AsyncGenerator<ChatEvent> {
    yield* createToolCallChunks('Read', {file_path: 'a.ts'}, {parentMessageId: `${run.runId}-a`})
    await Promise.race([cli.gate, aborted(signal)])
  }

  const STEP_BODY: Record<CliStep, (stepRun: StepRun) => AsyncGenerator<ChatEvent>> = {
    reply: answer,
    partial: answer,
    streaming: cutOffMidText,
    tooling: stuckInTool,
  }

  function cliHarness(cli: FakeCli): HarnessAdapter {
    const shared = {
      id: 'fake-cli',
      binName: 'true',
      models: undefined,
      tty: undefined,
      chatConfig: () => ({
        adapter: makeTextAdapter('fake-cli', async function* (options) {
          cli.systemPrompts.push([...(options.systemPrompts ?? [])].map(String))
          const step = cli.steps.shift() ?? 'reply'
          const run = {threadId: options.threadId ?? '', runId: options.runId ?? ''}
          yield {type: ChatEventType.RUN_STARTED, ...run}
          yield* STEP_BODY[step]({cli, step, run, signal: options.request?.signal ?? undefined})
        }),
      }),
    }
    const base = {
      resume: false,
      permissionGate: 'none',
      compaction: false,
      systemPrompt: 'file',
      mcp: 'none',
      imageInput: false,
      init: 'none',
      slashCommands: 'none',
    } as const
    return defineHarness({...shared, capabilities: {...base, transcriptHistory: false}})
  }

  function sessionPort(): SessionPort {
    return {
      row: () => ({model: null, nativeId: null, cwd: '/workspace'}),
      ensure: async () => undefined,
      recordNativeId: async () => undefined,
      recordUsage: async () => undefined,
      recordContextTokens: async () => undefined,
      recordTitle: async () => undefined,
      onRunStart: async () => undefined,
      publish: () => undefined,
      onRunEnd: async () => undefined,
    }
  }

  type PlaneOptions = {
    root: string
    harness: HarnessAdapter
    capabilities?: CodeCapability[]
    systemPrompt?: {systemPromptFile?: string; systemPromptText?: string}
    log?: string[]
  }

  async function plane(options: PlaneOptions): Promise<ChatPlane> {
    const db = openDb(options.root)
    opened.push(db)
    return createChatPlane({
      db,
      stateRoot: options.root,
      cwd: options.root,
      harness: options.harness,
      systemPrompt: options.systemPrompt ?? {},
      sessions: sessionPort(),
      toolNames: new Set(),
      capabilities: () => options.capabilities ?? [],
      attachmentExpanders: {},
      firstOutputTimeoutMs: 30_000,
      log: (line) => options.log?.push(line),
    })
  }

  const noUpgrade = defineWebSocketHelper(async () => undefined)

  const ChunkSchema = z.object({type: z.string(), delta: z.string().optional()}).loose()

  type WireChunk = z.infer<typeof ChunkSchema>

  async function startTurn(chat: ChatPlane, sessionId: string, runId: string, text: string): Promise<Response> {
    return chat.routes(noUpgrade).request(CHAT_SSE_PATH, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        threadId: sessionId,
        runId,
        messages: [{id: `${runId}-user`, role: 'user', content: text}],
        tools: [],
        context: [],
      }),
    })
  }

  async function readChunks(response: Response, enough: (seen: WireChunk[]) => boolean): Promise<WireChunk[]> {
    const body = response.body
    if (body === null) throw new Error('the turn has no body')
    const reader = body.pipeThrough(new TextDecoderStream()).getReader()
    const seen: WireChunk[] = []
    const buffer = {text: ''}
    for (;;) {
      const next = await reader.read()
      if (next.done) return seen
      buffer.text += next.value
      const frames = buffer.text.split('\n\n')
      buffer.text = frames.pop() ?? ''
      const chunks = frames
        .flatMap((frame) => frame.split('\n'))
        .flatMap((line) => (line.startsWith('data: ') ? [ChunkSchema.safeParse(JSON.parse(line.slice(6)))] : []))
        .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
      seen.push(...chunks)
      if (enough(seen)) {
        await reader.cancel()
        return seen
      }
    }
  }

  async function readUntil(response: Response, type: ChatEvent['type'] | 'end'): Promise<string[]> {
    const seen = await readChunks(response, (chunks) => type !== 'end' && chunks.some((chunk) => chunk.type === type))
    return seen.map((chunk) => chunk.type)
  }

  function streamedText(chunks: WireChunk[]): string {
    return chunks
      .flatMap((chunk) => (chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT && chunk.delta ? [chunk.delta] : []))
      .join('')
  }

  async function readText(response: Response, expected: string): Promise<string> {
    return streamedText(await readChunks(response, (chunks) => streamedText(chunks) === expected))
  }

  function partTypes(messages: ChatMessage[]): string[][] {
    return messages.map((message) => message.parts.map((part) => part.type))
  }

  function sessionId(name: string): string {
    return SessionId.parse(`conciv_${name}`)
  }

  function echoCapability(overrides: Partial<CodeCapability> = {}): CodeCapability {
    return {
      name: 'unit_echo',
      description: 'Echo the text back.',
      errors: [],
      inputSchema: z.object({text: z.string()}),
      execute: async (input) => input,
      ...overrides,
    }
  }

  function sandboxTool(hint: string): SandboxTool {
    return {
      name: 'unit_tool',
      path: ['unit', 'tool'],
      binding: 'server',
      summary: 'Do the unit thing',
      mutating: false,
      mirrors: false,
      reachable: true,
      inputSchema: {},
      outputSchema: {},
      errors: [],
      schema: z.object({}),
      run: async () => null,
      keywords: [],
      hint,
    }
  }
})

describe('client request hook', () => {
  test('onClientRequest fires once on the first token request', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-client-request-hook-'))
    let fired = 0
    try {
      const engine = await start({
        options: {harnessBin: 'true', stateRoot: root},
        root,
        launchEditor: () => {},
        accessToken: '0b6f9c2e-8f6d-4a5c-9e1f-2d3a4b5c6d7e',
        onClientRequest: () => {
          fired += 1
        },
      })
      try {
        expect(fired).toBe(0)
        await fetch(`http://127.0.0.1:${engine.port}/t/0b6f9c2e-8f6d-4a5c-9e1f-2d3a4b5c6d7e/health`)
        await fetch(`http://127.0.0.1:${engine.port}/t/0b6f9c2e-8f6d-4a5c-9e1f-2d3a4b5c6d7e/health`)
        expect(fired).toBe(1)
      } finally {
        await engine.stop()
      }
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })
})

describe('config', () => {
  const saved = {...process.env}
  afterEach(() => {
    process.env = {...saved}
  })

  describe('defineConfig (generic typed factory)', () => {
    it('returns the config unchanged and preserves the literal harness type', () => {
      const cfg = defineConfig({harness: 'codex'})
      expect(cfg).toEqual({harness: 'codex'})
    })
  })

  describe('resolveConfig (generalized)', () => {
    it('defaults: harness=claude, stateRoot=root', () => {
      const cfg = resolveConfig({}, '/root')
      expect(cfg.harness).toBe('claude')
      expect(cfg.stateRoot).toBe('/root')
      expect(typeof cfg.systemPrompt).toBe('string')
    })

    it('options win over env; new env vars resolve', () => {
      process.env.CONCIV_HARNESS = 'codex'
      process.env.CONCIV_HARNESS_BIN = 'codex-bin'
      process.env.CONCIV_SESSION_ID = 'conciv_env-sess'
      const cfg = resolveConfig({harness: 'claude'}, '/root')
      expect(cfg.harness).toBe('claude')
      expect(cfg.harnessBin).toBe('codex-bin')
      expect(cfg.sessionId).toBe('conciv_env-sess')
    })

    it('honours deprecated CONCIV_CLAUDE_* + claudeSessionId aliases for one cycle', () => {
      process.env.CONCIV_CLAUDE_PATH = 'old-claude'
      process.env.CONCIV_CLAUDE_SESSION_ID = 'old-sess'
      const cfg = resolveConfig({}, '/root')
      expect(cfg.harnessBin).toBe('old-claude')
      expect(cfg.harnessSessionId).toBe('old-sess')
    })
  })
})

describe('dev endpoint', () => {
  describe('dev endpoint pairing file', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'conciv-dev-endpoint-'))
    })

    afterEach(() => {
      rmSync(dir, {recursive: true, force: true})
    })

    it('writes an owner-only readable file and reads it back', () => {
      writeDevEndpoint(dir, {apiBase: 'http://127.0.0.1:4599/t/secret', token: 'secret', pid: 4242})
      const endpoint = readDevEndpoint(dir)
      expect(endpoint).toEqual({apiBase: 'http://127.0.0.1:4599/t/secret', token: 'secret', pid: 4242})
      const mode = statSync(join(dir, 'dev-endpoint.json')).mode & 0o777
      expect(mode).toBe(0o600)
    })

    it('returns null for a missing file and for malformed contents', () => {
      expect(readDevEndpoint(dir)).toBeNull()
      writeFileSync(join(dir, 'dev-endpoint.json'), 'not json')
      expect(readDevEndpoint(dir)).toBeNull()
      writeFileSync(join(dir, 'dev-endpoint.json'), JSON.stringify({apiBase: '', token: null, pid: -1}))
      expect(readDevEndpoint(dir)).toBeNull()
    })

    it('removes the file only when the pid matches the owner', () => {
      writeDevEndpoint(dir, {apiBase: 'http://127.0.0.1:4599', token: null, pid: 100})
      removeDevEndpoint(dir, 999)
      expect(readDevEndpoint(dir)?.pid).toBe(100)
      removeDevEndpoint(dir, 100)
      expect(readDevEndpoint(dir)).toBeNull()
    })
  })
})

describe('editor symbolicate', () => {
  afterEach(async () => {
    await cleanupChunks()
  })

  const ROOT = tmpdir()

  describe('symbolicateFrame', () => {
    it('strips the about://React/Server/ prefix and ?query', async () => {
      const path = await chunkWithInlineMap('app/page.tsx', 17, 4)
      const loc = await symbolicateFrame({fileName: `about://React/Server/file://${path}?42`, line: 2, column: 1}, ROOT)
      expect(loc?.file).toBe('app/page.tsx')
    })

    it('resolves an http frame via the injected fetch', async () => {
      const gen = new GenMapping()
      addMapping(gen, {generated: {line: 2, column: 0}, source: 'src/App.tsx', original: {line: 9, column: 0}})
      const b64 = Buffer.from(JSON.stringify(toEncodedMap(gen))).toString('base64')
      const body = `void 0;\nvoid 1;\n//# sourceMappingURL=data:application/json;base64,${b64}`
      const fakeFetch = (async () => new Response(body)) as unknown as typeof fetch
      const loc = await symbolicateFrame(
        {fileName: 'http://localhost:3000/src/App.tsx?x=1', line: 2, column: 1},
        ROOT,
        fakeFetch,
      )
      expect(loc?.file).toBe('src/App.tsx')
    })

    it('refuses a non-loopback http frame (SSRF)', async () => {
      const reached = {hit: false}
      const fakeFetch = (async () => {
        reached.hit = true
        return new Response('void 0;')
      }) as unknown as typeof fetch
      const loc = await symbolicateFrame(
        {fileName: 'http://169.254.169.254/latest/meta-data', line: 1, column: 1},
        ROOT,
        fakeFetch,
      )
      expect(loc).toBeNull()
      expect(reached.hit).toBe(false)
    })
  })
})

describe('engine port', () => {
  function bootEngine(root: string) {
    return start({
      options: {harnessBin: 'true', stateRoot: root, systemPrompt: false},
      root,
      launchEditor: () => {},
    })
  }

  function recordedPort(root: string): unknown {
    return JSON.parse(readFileSync(statePaths(root).server, 'utf8'))
  }

  test('start reuses the port persisted in the state dir across restarts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
    try {
      const first = await bootEngine(root)
      const firstPort = first.port
      await first.stop()
      expect(recordedPort(root)).toEqual({port: firstPort})

      const second = await bootEngine(root)
      try {
        expect(second.port).toBe(firstPort)
      } finally {
        await second.stop()
      }
      expect(recordedPort(root)).toEqual({port: firstPort})
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })
})

describe('engine stamp', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  function tmpFile(name: string, contents: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'conciv-stamp-'))
    dirs.push(dir)
    const path = join(dir, name)
    writeFileSync(path, contents)
    return path
  }

  function ageForward(path: string, seconds: number): void {
    const when = new Date(Date.now() + seconds * 1000)
    utimesSync(path, when, when)
  }

  describe('engine staleness probe', () => {
    it('turns stale and names only the package whose file was rewritten on disk', () => {
      const core = tmpFile('core.js', 'export const a = 1')
      const tools = tmpFile('tools.js', 'export const b = 1')
      const probe = makeStalenessProbe([
        {label: '@conciv/core', path: core},
        {label: '@conciv/tools', path: tools},
      ])
      expect(probe().stale).toBe(false)

      writeFileSync(tools, 'export const b = 2')
      ageForward(tools, 5)

      expect(probe().stale).toBe(true)
      expect(probe().changed).toEqual(['@conciv/tools'])
    })

    it('stays fresh when a rebuild rewrites identical bytes and only moves the mtime forward', () => {
      const path = tmpFile('core.js', 'export const a = 1')
      const probe = makeStalenessProbe([{label: '@conciv/core', path}])

      writeFileSync(path, 'export const a = 1')
      ageForward(path, 5)

      expect(probe().stale).toBe(false)
      expect(probe().changed).toEqual([])
    })

    it('holds one fingerprint while nothing moves and mints a new one after a rebuild', () => {
      const path = tmpFile('core.js', 'export const a = 1')
      const probe = makeStalenessProbe([{label: '@conciv/core', path}])
      const first = probe().fingerprint

      expect(probe().fingerprint).toBe(first)

      writeFileSync(path, 'export const a = 2')

      expect(probe().fingerprint).not.toBe(first)
    })
  })

  const EndpointSchema = z.object({mcpUrl: z.string(), token: z.string()})

  function recordedEndpoint(root: string): z.infer<typeof EndpointSchema> {
    return EndpointSchema.parse(JSON.parse(readFileSync(join(statePaths(root).dir, 'mcp-endpoint.json'), 'utf8')))
  }

  const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'endpoint-test', version: '0.0.0'}},
  }

  describe('boot writes .conciv/mcp-endpoint.json', () => {
    it('start records the MCP endpoint a headless stdio bridge reads, and the endpoint answers', async () => {
      const root = mkdtempSync(join(tmpdir(), 'conciv-engine-mcp-'))
      try {
        const engine = await start({options: {harnessBin: 'true', stateRoot: root}, root, launchEditor: () => {}})
        try {
          const {mcpUrl, token} = recordedEndpoint(root)
          expect(token).toBe(engine.loginToken)
          expect(mcpUrl).toBe(`http://127.0.0.1:${engine.port}/t/${engine.loginToken}/api/mcp`)
          expect(statSync(join(statePaths(root).dir, 'mcp-endpoint.json')).mode & 0o777).toBe(0o600)
          const response = await fetch(mcpUrl, {
            method: 'POST',
            headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream'},
            body: JSON.stringify(initialize),
          })
          expect(response.status).toBe(200)
          await response.body?.cancel()
        } finally {
          await engine.stop()
        }
      } finally {
        rmSync(root, {recursive: true, force: true})
      }
    })

    it('releases the port when the endpoint file cannot be written', async () => {
      const root = mkdtempSync(join(tmpdir(), 'conciv-engine-mcp-'))
      const port = await getPort()
      try {
        mkdirSync(join(statePaths(root).dir, 'mcp-endpoint.json'), {recursive: true})
        await expect(
          start({options: {harnessBin: 'true', stateRoot: root}, root, launchEditor: () => {}, port: {exact: port}}),
        ).rejects.toThrow()
        const probe = createServer()
        await new Promise<void>((resolve, reject) => {
          probe.once('error', reject)
          probe.listen(port, '127.0.0.1', () => resolve())
        })
        await new Promise<void>((resolve) => probe.close(() => resolve()))
      } finally {
        rmSync(root, {recursive: true, force: true})
      }
    })
  })
})

describe('engine log redaction', () => {
  const LEAKY_ENGINE = `
import {start} from '@conciv/core'
import {defineExtension} from '@conciv/extension'
const leaky = defineExtension({name: 'leaky'}).server((server) => {
  throw new Error('cannot reach ' + server.agentPath + '/api?devframe_auth_token=' + process.env.LEAK_TOKEN)
})
const root = process.env.LEAK_ROOT
const engine = await start({
  options: {harnessBin: 'true', stateRoot: root},
  root,
  accessToken: process.env.LEAK_TOKEN,
  launchEditor: () => {},
  extensions: [leaky],
})
await engine.stop()
`

  it('strips the engine token from a real engine log line', () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-engine-redact-'))
    const token = crypto.randomUUID()
    try {
      const run = spawnSync(process.execPath, ['--input-type=module', '-e', LEAKY_ENGINE], {
        cwd: join(import.meta.dirname, '..'),
        env: {...process.env, LEAK_ROOT: root, LEAK_TOKEN: token},
        encoding: 'utf8',
        timeout: 20_000,
      })
      expect(run.status).toBe(0)
      expect(run.stderr).toContain('extension "leaky" failed to mount')
      expect(run.stderr).toContain('/t/<redacted>/api?devframe_auth_token=<redacted>')
      expect(run.stderr).not.toContain(token)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  }, 25_000)
})

describe('page tabs inflight teardown', () => {
  const SESSION = SessionId.parse('conciv_inflight')

  function heldTab(id: number): {tab: PageTab; reply: (outcome: unknown) => void} {
    const pending = Promise.withResolvers<unknown>()
    return {tab: {id, live: () => true, query: () => pending.promise}, reply: pending.resolve}
  }

  it('a reply still settles the in-flight ask after the asking tab leaves and a fresh one joins', async () => {
    const tabs = makePageTabs(2000)
    const asking = heldTab(1)
    tabs.join(SESSION, asking.tab)
    const answered = tabs.ask(SESSION, {name: 'fixture_click', input: {}})
    await Promise.resolve()

    tabs.leave(SESSION, 1)
    tabs.join(SESSION, heldTab(2).tab)

    asking.reply({ok: true, result: {clicked: 'yes'}})
    await expect(answered).resolves.toEqual({result: {clicked: 'yes'}})
  }, 10_000)
})

describe('runtime ambient session', () => {
  const SESSION_A = SessionId.parse('conciv_ambient_a')
  const SESSION_B = SessionId.parse('conciv_ambient_b')

  const FRESH: EngineStaleness = {stale: false, changed: [], tracked: [], bootedAt: 0, fingerprint: 'test'}

  const clicker = defineTool({
    name: 'fixture_click',
    description: 'Click something on the page',
    inputSchema: z.object({ref: z.string()}),
    outputSchema: z.object({clicked: z.string()}),
    meta: {summary: 'click a page element', category: 'fixture', mutating: true},
  }).client()

  const shared: {fixture: ChatFixture | undefined} = {fixture: undefined}

  beforeAll(async () => {
    shared.fixture = await makeChatFixture()
  }, 30_000)

  afterAll(async () => {
    await shared.fixture?.dispose()
  })

  async function madeRuntime(): Promise<{runtime: CoreRuntime; primitives: SessionPrimitives}> {
    const fixture = shared.fixture
    if (fixture === undefined) throw new Error('the chat fixture did not boot')
    const primitives = makeSessionPrimitives({
      db: fixture.db,
      root: fixture.stateRoot,
      storeCapture: () => Promise.resolve(),
      bundler: () => undefined,
      openInEditor: () => {},
    })
    primitives.registry.register(clicker, {owner: 'a fixture'})
    const runtime = makeCoreRuntime({
      primitives,
      plane: fixture.plane,
      db: fixture.db,
      model: () => null,
      staleness: () => FRESH,
    })
    await primitives.page.journal.clear(SESSION_A)
    return {runtime, primitives}
  }

  function widgetOn(primitives: SessionPrimitives, id: SessionId, reply: Record<string, unknown>): () => void {
    const tabId = Math.random()
    primitives.page.tabs.join(id, {id: tabId, live: () => true, query: async () => ({ok: true, result: reply})})
    return () => primitives.page.tabs.leave(id, tabId)
  }

  function reachableIn(catalog: {list: () => {name: string; reachable: boolean}[]}, name: string): boolean | undefined {
    return catalog.list().find((entry) => entry.name === name)?.reachable
  }

  describe('the page forwarder reads its session from the established scope, not from its parameter', () => {
    it('asks the widget of the established session even when the request names another one', async () => {
      const {runtime, primitives} = await madeRuntime()
      const unsubscribe = widgetOn(primitives, SESSION_A, {clicked: 'a'})
      const result = await runWithSession(runtime.forSession(SESSION_A), () =>
        primitives.registry.call('fixture_click', {ref: 'r1'}, {request: {sessionId: SESSION_B, model: null}}),
      )
      expect(result).toEqual({clicked: 'a'})
      unsubscribe()
    })

    it('journals the mutation under the established session, not under the one the request names', async () => {
      const {runtime, primitives} = await madeRuntime()
      const unsubscribe = widgetOn(primitives, SESSION_A, {clicked: 'a'})
      await runWithSession(runtime.forSession(SESSION_A), () =>
        primitives.registry.call('fixture_click', {ref: 'r1'}, {request: {sessionId: SESSION_B, model: null}}),
      )
      unsubscribe()
      expect(await runtime.forSession(SESSION_A).page.changes()).toHaveLength(1)
      expect(await runtime.forSession(SESSION_B).page.changes()).toHaveLength(0)
    })
  })

  describe('catalog reachability is answered per scope', () => {
    it('a page tool is reachable for the session holding the widget and unreachable for another', async () => {
      const {runtime, primitives} = await madeRuntime()
      const unsubscribe = widgetOn(primitives, SESSION_A, {clicked: 'a'})
      expect(reachableIn(runtime.forSession(SESSION_A).tools.catalog, 'fixture_click')).toBe(true)
      expect(reachableIn(runtime.forSession(SESSION_B).tools.catalog, 'fixture_click')).toBe(false)
      unsubscribe()
    })
  })
})

describe('system prompt', () => {
  const demoTool = defineTool({
    name: 'demo_tool',
    description: 'Does a demo thing.',
    inputSchema: z.object({}),
    promptSnippet: 'NEVER-IN-PROMPT',
    approval: 'ask',
  }).server(async () => ({}))

  const demoExtension = defineExtension({
    name: 'demo',
    systemPrompt: 'Demo extension rules.',
    tools: [demoTool],
  })

  test('standing prompt contains extension systemPrompt but never tool prose', () => {
    const prompt = composeSystemPrompt('base prompt', [demoExtension], {cwd: '/repo'})
    expect(prompt).toContain('base prompt')
    expect(prompt).toContain('Demo extension rules.')
    expect(prompt).not.toContain('NEVER-IN-PROMPT')
  })

  function emptyToUndefined(raw: unknown): unknown {
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0) return undefined
    return raw
  }

  const configuredExtension = defineExtension({
    name: 'ios',
    systemPrompt: 'iOS overlay rules.',
    configSchema: z.preprocess(emptyToUndefined, z.object({projectRoot: z.string()}).optional()),
  })

  const groundedExtension = defineExtension({
    name: 'ios',
    systemPrompt: (config, context) => `project ${config.projectRoot} under ${context.cwd}`,
    configSchema: z.preprocess(emptyToUndefined, z.object({projectRoot: z.string()}).optional()),
  })

  const transformedExtension = defineExtension({
    name: 'ios',
    systemPrompt: (config) => `simulator ${config.simulator} in ${config.projectRoot}`,
    configSchema: z.preprocess(
      emptyToUndefined,
      z
        .object({projectRoot: z.string(), simulator: z.string().default('iPhone 17 Pro')})
        .transform((config) => ({...config, projectRoot: config.projectRoot.replace(/\/+$/, '')}))
        .optional(),
    ),
  })

  test('an extension whose config is absent contributes no systemPrompt', () => {
    const prompt = composeSystemPrompt('base prompt', [configuredExtension], {cwd: '/repo', extensions: {}})
    expect(prompt).toBe('base prompt')
    expect(prompt).not.toContain('iOS overlay rules.')
  })

  test('an extension can ground its prompt in its own config and the working directory', () => {
    const prompt = composeSystemPrompt('base prompt', [groundedExtension], {
      cwd: '/repo',
      extensions: {ios: {projectRoot: '/app'}},
    })
    expect(prompt).toContain('project /app under /repo')
  })

  test('a prompt factory receives the parsed config, not the raw options', () => {
    const prompt = composeSystemPrompt(undefined, [transformedExtension], {
      cwd: '/repo',
      extensions: {ios: {projectRoot: '/app/'}},
    })
    expect(prompt).toBe('simulator iPhone 17 Pro in /app')
  })
})
