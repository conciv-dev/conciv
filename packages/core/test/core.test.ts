import {
  existsSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
  utimesSync,
  watch,
} from 'node:fs'
import {once} from 'node:events'
import {request as httpRequest} from 'node:http'
import {createServer} from 'node:net'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {text as bodyText} from 'node:stream/consumers'
import {randomUUID} from 'node:crypto'
import {setImmediate, setTimeout as wait} from 'node:timers/promises'
import {describe, it, expect, afterEach, onTestFinished, test, vi} from 'vitest'
import {makeTextAdapter} from '@conciv/ai/server'
import {createToolCallChunks, fakeText} from '@conciv/ai/testkit'
import {
  cappedValue,
  createChatPlane,
  registryCapabilities,
  safeStringify,
  type ChatPlane,
  type CodeCapability,
  type SessionPort,
} from '@conciv/chat'
import {makeBrowserRpcClient, makeRpcClient, SOCKET_TRUST_FRAME, type EngineStaleness} from '@conciv/contract'
import {chatRuns, openDb, type ConcivDb} from '@conciv/db'
import {
  createClientSettings,
  defineTool,
  defineExtension,
  makeExtRpcClient,
  type AnyExtension,
  type ExtensionScope,
  type SettingsStore,
} from '@conciv/extension'
import {createToolRegistry} from '@conciv/extension/registry'
import {type HarnessAdapter, defineHarness, resolveHarnessModels} from '@conciv/harness'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {type ChatMessage} from '@conciv/protocol/chat-message-types'
import {CHAT_SSE_PATH, HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {PUSH_SESSION_PARAM, PUSH_WS_PATH} from '@conciv/protocol/push-types'
import {eq} from 'drizzle-orm'
import {isEqual} from 'es-toolkit'
import getPort from 'get-port'
import {defineWebSocketHelper} from 'hono/ws'
import {z} from 'zod'
import {hostDocument} from '../src/api/native-page.js'
import {resolveConfig} from '../src/config.js'
import {symbolicateFrame} from '../src/editor/symbolicate.js'
import {readDevEndpoint, removeDevEndpoint, writeDevEndpoint} from '../src/lib/dev-endpoint.js'
import {makeStalenessProbe} from '../src/lib/engine-stamp.js'
import {withSavedModels} from '../src/lib/saved-models.js'
import {statePaths} from '../src/lib/state-paths.js'
import {makePageBus} from '../src/page-bus.js'
import {makeCoreRuntime} from '../src/runtime/core-runtime.js'
import {makeSessionPrimitives} from '../src/runtime/primitives.js'
import {createSettingsStorage, settingsOnDisk} from '../src/settings/settings-storage.js'
import {runWithSession} from '../src/runtime/session-context.js'
import {start, composeSystemPrompt} from '../src/start.js'
import {makeApp} from '../src/app.js'
import {CODE_LIFETIME_MS, OPEN_PATHS, isOpenPath, makeCodeStore} from '../src/engine-login.js'
import {serveHono} from '@conciv/serve'
import {Hono} from 'hono'
import {exchangePrintedCode, loginThroughTerminal, requestPrintedCode} from '@conciv/harness-testkit'
import {os} from '@orpc/server'
import {createORPCClient} from '@orpc/client'
import {RPCLink as FetchRpcLink} from '@orpc/client/fetch'
import {RPCLink as WebsocketRpcLink} from '@orpc/client/websocket'
import {CONCIV_VERSION_HEADER, type RpcContext} from '@conciv/protocol/rpc-types'
import {serveRpcRouter} from '@conciv/harness-testkit/rpc-mounts'
import coreManifest from '../package.json' with {type: 'json'}
import {chunkWithInlineMap, cleanupChunks, makeChatFixture} from './helpers.js'

const NO_CAPABILITIES = {
  resume: false,
  permissionGate: 'none',
  compaction: false,
  systemPrompt: 'file',
  mcp: 'none',
  imageInput: false,
  init: 'none',
  slashCommands: 'none',
} as const

const JSON_TYPE = {'content-type': 'application/json'}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-core-unit-'))
  onTestFinished(() => rmSync(dir, {recursive: true, force: true}))
  return dir
}

function bootEngine(root: string, overrides: Partial<Parameters<typeof start>[0]> = {}) {
  const options = {harnessBin: 'true', stateRoot: root, systemPrompt: false}
  return start({options, root, launchEditor: () => {}, ...overrides})
}

async function serveCore(
  root: string,
  extensions: AnyExtension[],
  overrides: Partial<Parameters<typeof makeApp>[0]>,
  port = 0,
) {
  const made = await makeApp({
    cfg: resolveConfig({}, root),
    cwd: root,
    openInEditor: () => {},
    extensions,
    ...overrides,
  })
  const served = await serveHono({fetch: made.fetch, port})
  const stop = async () => {
    await served.close()
    await made.dispose()
  }
  return {made, origin: `http://127.0.0.1:${served.port}`, stop}
}

function rawRequest(port: number, path: string, headers: Record<string, string> = {}, body?: string) {
  const method = body === undefined ? 'GET' : 'POST'
  const options = {host: '127.0.0.1', port, path, method, agent: false, headers: {...JSON_TYPE, ...headers}}
  return new Promise<{status: number; text: string; error?: string}>((resolve) => {
    const request = httpRequest(options, async (response) =>
      resolve({status: response.statusCode ?? 0, text: await bodyText(response)}),
    )
    request.on('error', (error: NodeJS.ErrnoException) => resolve({status: 0, text: '', error: error.code}))
    request.end(body)
  })
}

describe('api native page document', () => {
  it('pins the viewport so the WebView cannot pinch-zoom or rescale the overlay', () => {
    const viewport = /<meta name="viewport" content="([^"]+)">/.exec(hostDocument())?.[1]
    expect(viewport).toContain('maximum-scale=1')
    expect(viewport).toContain('user-scalable=no')
    expect(viewport).toContain('viewport-fit=cover')
  })
})

describe('chat plane', () => {
  it('unserializable values become "value could not be serialized"; small values pass through unchanged', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(cappedValue({big: 1n})).toMatchObject({error: 'value could not be serialized'})
    expect(JSON.parse(safeStringify(circular))).toMatchObject({error: 'value could not be serialized'})
    expect(cappedValue({ok: 1})).toEqual({ok: 1})
    expect(safeStringify({ok: 1})).toBe('{"ok":1}')
  })

  it('a tool description folds in its hint', () => {
    const registry = createToolRegistry()
    const meta = {summary: 'Do the unit thing', hint: 'Prefer small inputs'}
    const schemas = {inputSchema: z.object({}), outputSchema: z.object({})}
    const tool = defineTool({name: 'unit_tool', description: 'unit', ...schemas, meta}).server(() => ({}))
    registry.register(tool, {owner: 'unit'})
    const [capability] = registryCapabilities(registry.sandboxTools(), async () => null)
    expect(capability?.description).toMatch(/^Do the unit thing\. Prefer small inputs\.\n\nReturns JSON matching: /)
  })

  it('a turn falls back to systemPromptText and logs an unreadable systemPromptFile, and a credential-shaped capability fails only its own run', async () => {
    const root = tempDir()
    const cli = fakeCli()
    const log: string[] = []
    const missing = join(root, 'no-such-prompt.md')
    const echo: CodeCapability = {
      name: 'unit_echo',
      description: 'Echo the text back.',
      errors: [],
      inputSchema: z.object({text: z.string()}),
      execute: async (input) => input,
    }
    const secret = {...echo, name: 'unit_secret', inputSchema: z.object({apiKey: z.string()})}
    const chat = await plane(cliHarness(cli), root, {
      systemPrompt: {systemPromptFile: missing, systemPromptText: 'the fallback prompt'},
      log: (line) => log.push(line),
      capabilities: () => [echo, secret],
    })
    const seen = await readUntil(await startTurn(chat, sessionId('prompt'), 'prompt-run', 'hi'), 'end')
    expect(seen).toContain(ChatEventType.RUN_FINISHED)
    expect(cli.systemPrompts.flat()).toContain('the fallback prompt')
    expect(log.some((line) => line.includes(missing))).toBe(true)
    const runner = await chat.codeRunner(sessionId('prompt'), () => undefined)
    await expect(runner?.run('return await external_unit_secret({apiKey: "k"})', 'parent')).rejects.toThrow(/secret/i)
  })

  it('after a restart the finished and interrupted turns all show, and the interrupted run is aborted with a finish time', async () => {
    const root = tempDir()
    const cli = fakeCli('reply', 'partial')
    const first = await plane(cliHarness(cli), root)
    const id = sessionId('durable')
    await readUntil(await startTurn(first, id, 'durable-1', 'finished turn'), 'end')
    await readUntil(await startTurn(first, id, 'durable-2', 'interrupted turn'), ChatEventType.TEXT_MESSAGE_CONTENT)
    const next = await plane(cliHarness(fakeCli()), root)
    const {lastRun} = await next.hydrate(id)
    expect(lastRun).toMatchObject({runId: 'durable-2', phase: 'aborted', finishedAt: expect.any(Number)})
    expect(textsOf(await next.history(id))).toEqual([
      'finished turn',
      'partial reply',
      'interrupted turn',
      'partial reply',
    ])
    cli.release()
  })

  it('an older page is read from the stored thread without reading the native transcript again', async () => {
    const said = (id: string, role: 'user' | 'assistant', content: string): ChatMessage => ({
      id,
      role,
      parts: [{type: 'text', content}],
    })
    const native: NativeTranscript = {
      reads: 0,
      messages: [0, 1, 2].flatMap((turn) => [
        said(`native-u${turn}`, 'user', `question ${turn}`),
        said(`native-a${turn}`, 'assistant', `answer ${turn}`),
      ]),
    }
    const sessions = sessionPort(HarnessSessionId.parse('native-session'), 'native')
    const chat = await plane(nativeHarness(native), tempDir(), {sessions})
    const id = sessionId('native-paged')
    const newest = await chat.hydrate(id, {limit: 2})
    const readsForNewest = native.reads
    const older = await chat.hydrate(id, {limit: 2, before: newest.page?.truncated === true ? newest.page.cursor : ''})
    expect(textsOf(newest.messages)).toEqual(['question 2', 'answer 2'])
    expect(textsOf(older.messages)).toEqual(['question 1', 'answer 1'])
    expect(readsForNewest).toBe(1)
    expect(native.reads).toBe(readsForNewest)
  })

  it('Stop keeps every word the client saw, not the last throttled snapshot, and a stopped tool call survives the next turn', async () => {
    const cli = fakeCli('streaming', 'tooling', 'reply')
    const chat = await plane(cliHarness(cli))
    const id = sessionId('stopped')
    const seen = await readChunks(
      await startTurn(chat, id, 'stopped-mid-text', 'keep talking'),
      (chunks) => streamedText(chunks) === STREAMED_TEXT,
    )
    await chat.stop(id)
    expect(streamedText(seen)).toBe(STREAMED_TEXT)
    expect(textsOf((await chat.hydrate(id)).messages)).toEqual(['keep talking', STREAMED_TEXT])
    await readUntil(await startTurn(chat, id, 'stopped-tool', 'run the tool'), ChatEventType.TOOL_CALL_END)
    await chat.stop(id)
    const stopped = partTypes(await chat.history(id))
    expect(stopped.flat()).toContain('tool-call')
    await readUntil(await startTurn(chat, id, 'after-stop', 'follow up'), 'end')
    expect(partTypes(await chat.history(id))).toEqual([...stopped, ['text'], ['text']])
    cli.release()
  })

  it('engine stop refuses new requests, ends a run held mid-stream as aborted, and never queries a closed database', async () => {
    const root = tempDir()
    const cli = fakeCli('streaming')
    const written = vi.spyOn(process.stderr, 'write')
    const engine = await bootEngine(root, {harness: cliHarness(cli)})
    const turn = await fetch(`http://127.0.0.1:${engine.port}/t/${engine.agentToken}${CHAT_SSE_PATH}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: turnBody(sessionId('engine-stop'), 'engine-stop-run', 'keep talking'),
    })
    await readUntil(turn, ChatEventType.TEXT_MESSAGE_CONTENT)
    const stopping = engine.stop()
    const late = await rawRequest(engine.port, '/health')
    await stopping
    const db = openDatabase(root)
    const runs = db.select({status: chatRuns.status}).from(chatRuns).where(eq(chatRuns.runId, 'engine-stop-run')).all()
    const logged = written.mock.calls.map(([chunk]) => String(chunk)).join('')
    written.mockRestore()
    cli.release()
    expect.soft(late.error).toBe('ECONNREFUSED')
    expect.soft(runs).toEqual([{status: 'aborted'}])
    expect.soft(logged).not.toMatch(/DrizzleQueryError|database is not open/)
  })

  type CliStep = 'reply' | 'partial' | 'streaming' | 'tooling'

  type FakeCli = {steps: CliStep[]; systemPrompts: string[][]; gate: Promise<void>; release: () => void}

  const FIRST_DELTA = 'partial reply'

  const STREAMED_TEXT = 'partial reply and the words after the last snapshot'

  function fakeCli(...steps: CliStep[]): FakeCli {
    const gate = Promise.withResolvers<void>()
    return {steps, systemPrompts: [], gate: gate.promise, release: () => gate.resolve()}
  }

  function cliHarness(cli: FakeCli): HarnessAdapter {
    return defineHarness({
      id: 'fake-cli',
      binName: 'true',
      chatConfig: () => ({
        adapter: makeTextAdapter('fake-cli', async function* (options) {
          cli.systemPrompts.push([...(options.systemPrompts ?? [])].map(String))
          const step = cli.steps.shift() ?? 'reply'
          const run = {threadId: options.threadId ?? '', runId: options.runId ?? ''}
          const messageId = `${run.runId}-a`
          const signal = options.request?.signal
          const heldOrAborted = () =>
            Promise.race([cli.gate, new Promise((settle) => signal?.addEventListener('abort', settle, {once: true}))])
          yield {type: ChatEventType.RUN_STARTED, ...run}
          if (step === 'tooling') {
            yield* createToolCallChunks('Read', {file_path: 'a.ts'}, {parentMessageId: messageId})
            return await heldOrAborted()
          }
          yield {type: ChatEventType.TEXT_MESSAGE_START, messageId, role: 'assistant'}
          yield {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId, delta: FIRST_DELTA}
          if (step === 'streaming') {
            yield {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId, delta: STREAMED_TEXT.slice(FIRST_DELTA.length)}
            return await heldOrAborted()
          }
          if (step === 'partial') await cli.gate
          yield {type: ChatEventType.TEXT_MESSAGE_END, messageId}
          yield {type: ChatEventType.RUN_FINISHED, ...run}
        }),
      }),
      capabilities: {...NO_CAPABILITIES, transcriptHistory: false},
    })
  }

  type NativeTranscript = {reads: number; messages: ChatMessage[]}

  function nativeHarness(native: NativeTranscript): HarnessAdapter {
    const missing = async () => ({ok: false, reason: 'missing', detail: 'no live transcript'}) as const
    return defineHarness({
      id: 'native',
      binName: 'true',
      chatConfig: () => ({adapter: fakeText()}),
      history: {
        messages: async () => {
          native.reads += 1
          return native.messages
        },
        observe: () => ({revision: missing, read: missing, close: () => undefined}),
        list: async () => ({sessions: [], next: null}),
        meta: async () => null,
      },
      resume: {command: ({nativeId}) => ({bin: 'native', args: [nativeId]})},
      capabilities: {...NO_CAPABILITIES, transcriptHistory: true},
    })
  }

  function sessionPort(nativeId: HarnessSessionId | null = null, harnessKind = 'fake-cli'): SessionPort {
    return {
      row: () => ({model: null, effort: null, nativeId, cwd: '/workspace', harnessKind}),
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

  async function plane(
    harness: HarnessAdapter,
    root = tempDir(),
    overrides: Partial<Parameters<typeof createChatPlane>[0]> = {},
  ): Promise<ChatPlane> {
    const db = openDatabase(root)
    return createChatPlane({
      db,
      stateRoot: root,
      hubAccess: 'session',
      hubGeneration: () => 0,
      cwd: root,
      harnessFor: () => harness,
      systemPrompt: {},
      sessions: sessionPort(),
      toolNames: new Set(),
      capabilities: () => [],
      attachmentExpanders: {},
      firstOutputTimeoutMs: 30_000,
      log: () => undefined,
      ...overrides,
    })
  }

  const noUpgrade = defineWebSocketHelper(async () => undefined)

  const ChunkSchema = z.object({type: z.string(), delta: z.string().optional()}).loose()

  type WireChunk = z.infer<typeof ChunkSchema>

  function turnBody(threadId: string, runId: string, text: string): string {
    const messages = [{id: `${runId}-user`, role: 'user', content: text}]
    return JSON.stringify({threadId, runId, messages, tools: [], context: []})
  }

  async function startTurn(chat: ChatPlane, threadId: string, runId: string, text: string): Promise<Response> {
    return chat.routes(noUpgrade).request(CHAT_SSE_PATH, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: turnBody(threadId, runId, text),
    })
  }

  async function readChunks(response: Response, enough: (seen: WireChunk[]) => boolean): Promise<WireChunk[]> {
    const seen: WireChunk[] = []
    const buffer = {text: ''}
    for await (const text of response.body?.pipeThrough(new TextDecoderStream()) ?? []) {
      const frames = (buffer.text + text).split('\n\n')
      buffer.text = frames.pop() ?? ''
      const lines = frames.flatMap((frame) => frame.split('\n')).filter((line) => line.startsWith('data: '))
      seen.push(...lines.flatMap((line) => ChunkSchema.safeParse(JSON.parse(line.slice(6))).data ?? []))
      if (enough(seen)) break
    }
    return seen
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

  function partTypes(messages: ChatMessage[]): string[][] {
    return messages.map((message) => message.parts.map((part) => part.type))
  }

  function textsOf(messages: ChatMessage[]): string[] {
    return messages.map((message) =>
      message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(''),
    )
  }

  function openDatabase(root: string): ConcivDb {
    const db = openDb(root)
    onTestFinished(() => db.$client.close())
    return db
  }

  function sessionId(name: string): SessionId {
    return SessionId.parse(`conciv_${name}`)
  }
})

describe('config', () => {
  const saved = {...process.env}
  afterEach(() => {
    process.env = {...saved}
  })

  it('defaults to claude under the root, options win over env, and the deprecated CONCIV_CLAUDE_* aliases resolve', () => {
    const defaults = resolveConfig({}, '/root')
    expect(defaults).toMatchObject({harness: 'claude', stateRoot: '/root', systemPrompt: expect.any(String)})
    process.env.CONCIV_HARNESS = 'codex'
    process.env.CONCIV_HARNESS_BIN = 'codex-bin'
    process.env.CONCIV_SESSION_ID = 'conciv_env-sess'
    const fromEnv = {harness: 'claude', harnessBin: 'codex-bin', sessionId: 'conciv_env-sess'}
    expect(resolveConfig({harness: 'claude'}, '/root')).toMatchObject(fromEnv)
    process.env = {...saved, CONCIV_CLAUDE_PATH: 'old-claude', CONCIV_CLAUDE_SESSION_ID: 'old-sess'}
    expect(resolveConfig({}, '/root')).toMatchObject({harnessBin: 'old-claude', harnessSessionId: 'old-sess'})
  })
})

describe('local state files', () => {
  it('the dev endpoint file is owner-only, reads null when missing or malformed, and only its owner pid removes it', () => {
    const dir = tempDir()
    const file = join(dir, 'dev-endpoint.json')
    expect(readDevEndpoint(dir)).toBeNull()
    writeFileSync(file, 'not json')
    expect(readDevEndpoint(dir)).toBeNull()
    writeFileSync(file, JSON.stringify({apiBase: '', token: null, pid: -1}))
    expect(readDevEndpoint(dir)).toBeNull()
    const endpoint = {apiBase: 'http://127.0.0.1:4599/t/secret', token: 'secret', pid: 100}
    writeDevEndpoint(dir, endpoint)
    expect(readDevEndpoint(dir)).toEqual(endpoint)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    removeDevEndpoint(dir, 999)
    expect(readDevEndpoint(dir)?.pid).toBe(100)
    removeDevEndpoint(dir, 100)
    expect(readDevEndpoint(dir)).toBeNull()
  })

  it('the staleness probe turns stale on a content change only, names that package, and mints a new fingerprint', () => {
    const dir = tempDir()
    const [core, tools] = [join(dir, 'core.js'), join(dir, 'tools.js')]
    writeFileSync(core, 'export const a = 1')
    writeFileSync(tools, 'export const b = 1')
    const probe = makeStalenessProbe([
      {label: '@conciv/core', path: core},
      {label: '@conciv/tools', path: tools},
    ])
    const fresh = probe()
    expect(fresh).toMatchObject({stale: false, changed: []})
    writeFileSync(tools, 'export const b = 1')
    const later = new Date(Date.now() + 5000)
    utimesSync(tools, later, later)
    expect(probe()).toEqual(fresh)
    writeFileSync(tools, 'export const b = 2')
    expect(probe()).toMatchObject({stale: true, changed: ['@conciv/tools']})
    expect(probe().fingerprint).not.toBe(fresh.fingerprint)
  })

  describe('saved harness models', () => {
    type Listed = {id: string; name: string; group: string}
    const OPUS: Listed = {id: 'opus', name: 'Opus 5.5', group: 'Claude'}
    const SONNET: Listed = {id: 'sonnet', name: 'Sonnet 5.5', group: 'Claude'}

    function listing(dir: string, models: () => Promise<Listed[]>): HarnessAdapter {
      const harness = defineHarness({
        id: 'listing',
        binName: 'listing',
        models,
        chatConfig: () => ({adapter: fakeText()}),
        capabilities: {...NO_CAPABILITIES, transcriptHistory: false},
      })
      return withSavedModels(harness, dir)
    }

    it('waits for the first live list, then answers from the saved one at once while a refresh, a failure or an empty list lands', async () => {
      const dir = tempDir()
      const savedFile = () => JSON.parse(readFileSync(join(dir, 'listing-models.json'), 'utf8'))
      expect(await resolveHarnessModels(listing(dir, async () => [OPUS]))).toEqual([OPUS])
      expect(savedFile()).toEqual([OPUS])
      expect(await resolveHarnessModels(listing(dir, () => Promise.reject(new Error('probe failed'))))).toEqual([OPUS])
      expect(savedFile()).toEqual([OPUS])
      const grown = Promise.withResolvers<Listed[]>()
      const growing = listing(dir, () => grown.promise)
      expect(await resolveHarnessModels(growing)).toEqual([OPUS])
      grown.resolve([OPUS, SONNET])
      await setImmediate()
      expect(savedFile()).toEqual([OPUS, SONNET])
      expect(await resolveHarnessModels(growing)).toEqual([OPUS, SONNET])
      const emptied = Promise.withResolvers<Listed[]>()
      const emptying = listing(dir, () => emptied.promise)
      expect(await resolveHarnessModels(emptying)).toEqual([OPUS, SONNET])
      emptied.resolve([])
      await setImmediate()
      expect(await resolveHarnessModels(emptying)).toEqual([])
      expect(savedFile()).toEqual([])
    })

    it('reports the failure when nothing is saved and retries on the next call', async () => {
      const outcomes: Promise<Listed[]>[] = [Promise.reject(new Error('probe failed')), Promise.resolve([OPUS])]
      outcomes[0]?.catch(() => {})
      const harness = listing(tempDir(), () => outcomes.shift() ?? Promise.resolve([]))
      await expect(resolveHarnessModels(harness)).rejects.toThrow('probe failed')
      expect(await resolveHarnessModels(harness)).toEqual([OPUS])
    })
  })
})

describe('editor symbolicate', () => {
  afterEach(() => cleanupChunks())

  it('reads a React server frame, fetches a loopback http frame, and never fetches another host', async () => {
    const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const fetched: string[] = []
    const fakeFetch: typeof fetch = async (input) => {
      fetched.push(String(input))
      return new Response(readFileSync(chunk, 'utf8'))
    }
    const at = (fileName: string) => symbolicateFrame({fileName, line: 2, column: 1}, tmpdir(), fakeFetch)
    expect((await at(`about://React/Server/file://${chunk}?42`))?.file).toBe('app/page.tsx')
    expect((await at('http://localhost:3000/src/App.tsx?x=1'))?.file).toBe('app/page.tsx')
    expect(await at('http://169.254.169.254/latest/meta-data')).toBeNull()
    expect(fetched.some((url) => url.includes('169.254'))).toBe(false)
  })
})

describe('engine boot writes .conciv/mcp-endpoint.json', () => {
  it('start records the MCP endpoint a headless stdio bridge reads, and the endpoint answers', async () => {
    const root = tempDir()
    const engine = await bootEngine(root)
    try {
      const file = join(statePaths(root).dir, 'mcp-endpoint.json')
      const {mcpUrl} = z.object({mcpUrl: z.string()}).parse(JSON.parse(readFileSync(file, 'utf8')))
      expect(mcpUrl).toBe(`http://127.0.0.1:${engine.port}/t/${engine.agentToken}/api/mcp`)
      expect(statSync(file).mode & 0o777).toBe(0o600)
      const params = {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'endpoint', version: '0.0.0'}}
      const response = await fetch(mcpUrl, {
        method: 'POST',
        headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream'},
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params}),
      })
      expect(response.status).toBe(200)
      await response.body?.cancel()
    } finally {
      await engine.stop()
    }
  })

  it('releases the port when the endpoint file cannot be written', async () => {
    const root = tempDir()
    const port = await getPort()
    mkdirSync(join(statePaths(root).dir, 'mcp-endpoint.json'), {recursive: true})
    await expect(bootEngine(root, {port: {exact: port}})).rejects.toThrow()
    const probe = createServer().listen(port, '127.0.0.1')
    await once(probe, 'listening')
    await once(probe.close(), 'close')
  })

  it('a taken port fails start with the bind error even when disposing an extension also fails', async () => {
    const port = await getPort()
    const taken = createServer().listen(port, '127.0.0.1')
    await once(taken, 'listening')
    const written = vi.spyOn(console, 'error')
    const failingDispose = defineExtension({name: 'failing-dispose'}).server(() => ({
      context: null,
      dispose: () => {
        throw new Error('extension dispose failed')
      },
    }))
    try {
      const booting = bootEngine(tempDir(), {port: {exact: port}, extensions: [failingDispose]})
      await expect(booting).rejects.toMatchObject({code: 'EADDRINUSE'})
      const logged = written.mock.calls.flat().map(String).join('\n')
      expect.soft(logged).toContain('conciv: cleanup after a failed start also failed')
      expect.soft(logged).toContain('extension dispose failed')
    } finally {
      written.mockRestore()
      await once(taken.close(), 'close')
    }
  })
})

describe('page bus and the session scope', () => {
  const SESSION_A = SessionId.parse('conciv_ambient_a')
  const SESSION_B = SessionId.parse('conciv_ambient_b')

  function requestIdOf(frame: unknown): string | null {
    if (typeof frame !== 'object' || frame === null || !('requestId' in frame)) return null
    return typeof frame.requestId === 'string' ? frame.requestId : null
  }

  it('a reply still settles the in-flight ask after the asking widget unsubscribes and a fresh one attaches', async () => {
    const bus = makePageBus(2000)
    const frames: unknown[] = []
    const unsubscribe = bus.subscribe(SESSION_A, (frame) => frames.push(frame))
    const answered = bus.ask(SESSION_A, {name: 'fixture_click', input: {}, agentId: SESSION_A})
    await Promise.resolve()
    unsubscribe()
    bus.subscribe(SESSION_A, () => {})
    const requestId = frames.map(requestIdOf).find((found) => found !== null)
    expect(bus.resolve(SESSION_A, requestId ?? '', {ok: true, result: {clicked: 'yes'}})).toBe(true)
    await expect(answered).resolves.toEqual({result: {clicked: 'yes'}})
  }, 10_000)

  it('a page tool asks, journals and is reachable under the established session, never the one the request names', async () => {
    const fixture = await makeChatFixture()
    try {
      const fresh: EngineStaleness = {stale: false, changed: [], tracked: [], bootedAt: 0, fingerprint: 'test'}
      const primitives = makeSessionPrimitives({
        db: fixture.db,
        root: fixture.stateRoot,
        storeCapture: () => Promise.resolve(),
        bundler: () => undefined,
        openInEditor: () => {},
        listTabs: async () => ({tabs: [], unreachable: []}),
      })
      const clicker = defineTool({
        name: 'fixture_click',
        description: 'Click something on the page',
        inputSchema: z.object({ref: z.string()}),
        outputSchema: z.object({clicked: z.string()}),
        meta: {summary: 'click a page element', category: 'fixture', mutating: true},
      }).client()
      primitives.registry.register(clicker, {owner: 'a fixture'})
      const {plane, db} = fixture
      const runtime = makeCoreRuntime({primitives, plane, db, model: () => null, staleness: () => fresh})
      const unsubscribe = primitives.page.bus.subscribe(SESSION_A, (frame) => {
        const requestId = requestIdOf(frame)
        if (requestId === null) return
        queueMicrotask(() => primitives.page.bus.resolve(SESSION_A, requestId, {ok: true, result: {clicked: 'a'}}))
      })
      const reachableIn = (id: SessionId) => runtime.forSession(id).tools.catalog.get('fixture_click').reachable
      expect([reachableIn(SESSION_A), reachableIn(SESSION_B)]).toEqual([true, false])
      const request = {sessionId: SESSION_B, agentId: SESSION_B, model: null}
      const result = await runWithSession(runtime.forSession(SESSION_A), () =>
        primitives.registry.call('fixture_click', {ref: 'r1'}, {request}),
      )
      unsubscribe()
      expect(result).toEqual({clicked: 'a'})
      expect(await runtime.forSession(SESSION_A).page.changes()).toHaveLength(1)
      expect(await runtime.forSession(SESSION_B).page.changes()).toHaveLength(0)
    } finally {
      await fixture.dispose()
    }
  }, 30_000)
})

describe('system prompt', () => {
  it('folds in extension prompts but never tool prose, grounds a factory in parsed config and cwd, and skips an absent config', () => {
    const demoTool = defineTool({
      name: 'demo_tool',
      description: 'Does a demo thing.',
      inputSchema: z.object({}),
      promptSnippet: 'NEVER-IN-PROMPT',
      approval: 'ask',
    }).server(async () => ({}))
    const demo = defineExtension({name: 'demo', systemPrompt: 'Demo extension rules.', tools: [demoTool]})
    const ios = defineExtension({
      name: 'ios',
      systemPrompt: (config, context) => `simulator ${config.simulator} in ${config.projectRoot} under ${context.cwd}`,
      configSchema: z.preprocess(
        (raw) => (raw && typeof raw === 'object' && Object.keys(raw).length === 0 ? undefined : raw),
        z
          .object({projectRoot: z.string(), simulator: z.string().default('iPhone 17 Pro')})
          .transform((config) => ({...config, projectRoot: config.projectRoot.replace(/\/+$/, '')}))
          .optional(),
      ),
    })
    const standing = composeSystemPrompt('base prompt', [demo], {cwd: '/repo'})
    expect(standing).toContain('base prompt')
    expect(standing).toContain('Demo extension rules.')
    expect(standing).not.toContain('NEVER-IN-PROMPT')
    expect(composeSystemPrompt('base prompt', [ios], {cwd: '/repo', extensions: {}})).toBe('base prompt')
    expect(composeSystemPrompt(undefined, [ios], {cwd: '/repo', extensions: {ios: {projectRoot: '/app/'}}})).toBe(
      'simulator iPhone 17 Pro in /app under /repo',
    )
  })
})

describe('engine login', () => {
  const requester = {browser: 'Chrome 156 | macOS', origin: 'http://localhost:5173'}

  const REISSUE = '{"json":{"reissue":true}}'

  const probeOs = os.$context<RpcContext>()
  const versionRouter = probeOs.router({
    clientVersion: probeOs.handler(({context}) => context.clientVersion ?? null),
  })

  test('one code prints per request; it expires after five minutes and is retired by five misses, a success or a reissue', () => {
    const clock = {now: 1_000}
    const printed: string[] = []
    const store = makeCodeStore({now: () => clock.now, print: (text) => printed.push(text)})
    const lastCode = (): string => /#conciv_otp=(\d{6})/.exec(printed.at(-1) ?? '')?.[1] ?? ''
    store.request(requester, false)
    store.request(requester, false)
    expect(printed).toHaveLength(1)
    expect(printed[0]).toContain('Chrome 156 | macOS at http://localhost:5173')
    const expiring = lastCode()
    clock.now += CODE_LIFETIME_MS
    expect(store.exchange(expiring)).toBe('expired')
    store.request(requester, false)
    const first = lastCode()
    const wrong = first === '000000' ? '111111' : '000000'
    for (const _ of [1, 2, 3, 4, 5]) expect(store.exchange(wrong)).toBe('mismatch')
    expect(store.exchange(first)).toBe('expired')
    store.request(requester, false)
    const second = lastCode()
    store.request(requester, true)
    expect(store.exchange(second)).not.toBe('trusted')
    expect(store.exchange(lastCode())).toBe('trusted')
    expect(store.exchange(lastCode())).toBe('expired')
  })

  test('the gate refuses until a printed code is exchanged, and the browser stays trusted across a restart', async () => {
    const root = tempDir()
    const printed: string[] = []
    const clientRequests = {count: 0}
    const boot = () =>
      bootEngine(root, {print: (text) => printed.push(text), onClientRequest: () => (clientRequests.count += 1)})
    const first = await boot()
    const origin = `http://127.0.0.1:${first.port}`
    expect((await fetch(`${origin}/t/not-a-token/rpc/meta/engine`, {method: 'POST'})).status).toBe(401)
    const requestCode = (from: string) => rawRequest(first.port, '/rpc/auth/requestCode', {origin: from}, REISSUE)
    expect((await requestCode('http://conciv.example')).status).toBe(403)
    expect((await requestCode('http://localhost:5173')).status).toBe(200)
    expect(printed.at(-1)).toContain('http://localhost:5173/#conciv_otp=')
    await requestPrintedCode(origin, () => printed.join('\n'))
    expect(printed.at(-1)).toContain(`${origin}/#conciv_otp=`)
    await expect(exchangePrintedCode(origin, '000000')).rejects.toThrow(/refused the printed login code: mismatch/)
    const token = await loginThroughTerminal(origin, () => printed.join('\n'))
    const headers = {authorization: `Bearer ${token}`}
    expect((await fetch(`${origin}/rpc/meta/engine`, {method: 'POST', headers})).status).not.toBe(401)
    expect(clientRequests.count).toBe(1)
    await first.stop()
    const second = await boot()
    try {
      expect(second.port).toBe(first.port)
      const server = JSON.parse(readFileSync(statePaths(root).server, 'utf8'))
      expect(server).toEqual({port: first.port, token: second.agentToken})
      const check = (host: string) =>
        rawRequest(second.port, '/rpc/auth/trust', {host}, JSON.stringify({json: {token}}))
      expect(JSON.parse((await check(`localhost:${second.port}`)).text)).toMatchObject({json: {trusted: true}})
      expect((await check(`conciv.example:${second.port}`)).status).toBe(403)
      const rebound = {host: `conciv.example:${second.port}`}
      expect((await rawRequest(second.port, `/t/${second.agentToken}/rpc/meta/engine`, rebound, REISSUE)).status).toBe(
        403,
      )
    } finally {
      await second.stop()
    }
  })

  test('every route refuses an unknown caller except the declared open paths, and every response names the core version', async () => {
    const root = tempDir()
    const probe = defineExtension({name: 'probe'}).server(() => ({
      context: {},
      app: new Hono().get('/ping', (c) => c.text('pong')),
      router: versionRouter,
    }))
    const {made, origin, stop} = await serveCore(root, [probe], {nativePageDir: root})
    try {
      const routes = made.app.routes.map((route) => ({
        method: route.method === 'ALL' ? 'GET' : route.method,
        path: route.path.replaceAll(/:[^/]+|\*/g, 'x'),
      }))
      expect(routes.map((route) => route.path)).toEqual(
        expect.arrayContaining(['/api/ext/probe/ping', '/chat-ws', '/push-ws']),
      )
      const versions = new Set<string | null>()
      const sent = async (url: string, init: RequestInit = {}) => {
        const response = await fetch(url, init)
        versions.add(response.headers.get(CONCIV_VERSION_HEADER))
        return response
      }
      const refused = async (url: string, method: string): Promise<boolean> => {
        const response = await sent(url, {method, ...(method === 'GET' ? {} : {body: '{}'})})
        return response.status === 401 && (await response.text()).includes('"unauthorized"')
      }
      for (const route of routes) {
        expect(await refused(`${origin}${route.path}`, route.method), route.path).toBe(!isOpenPath(route.path))
        expect(await refused(`${origin}/t/${made.agentToken}${route.path}`, route.method), route.path).toBe(false)
      }
      const open = ['/health', '/rpc/auth/trust', '/rpc/auth/exchange', '/rpc/auth/requestCode', '/native', '/native/*']
      expect(OPEN_PATHS).toEqual(open)
      const auth = makeRpcClient(origin).auth
      expect(await auth.trust({token: 'not-a-token'})).toEqual({trusted: false})
      expect(await auth.trust({token: made.agentToken})).toEqual({trusted: true})
      expect(await auth.exchange({code: '000000'})).toEqual({refused: 'expired'})
      expect((await sent(`${origin}/health`, {headers: {origin: 'http://conciv.example'}})).status).toBe(403)
      const preflight = await sent(`${origin}/rpc/meta/engine`, {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST',
          'access-control-request-headers': `authorization,${CONCIV_VERSION_HEADER}`,
        },
      })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization')
      expect(preflight.headers.get('access-control-allow-headers')).toContain(CONCIV_VERSION_HEADER)
      expect(preflight.headers.get('access-control-expose-headers')).toContain(CONCIV_VERSION_HEADER)
      expect([...versions]).toEqual([coreManifest.version])
      const client = makeExtRpcClient<typeof versionRouter>(`${origin}/t/${made.agentToken}`, 'probe')
      expect(await client.clientVersion()).toBe(coreManifest.version)
      const {sessionId} = await makeRpcClient(`${origin}/t/${made.agentToken}`).sessions.create(undefined)
      const pushSocket = (frame: string) =>
        new Promise<string>((resolve) => {
          const socket = new WebSocket(
            `${origin.replace('http', 'ws')}${PUSH_WS_PATH}?${PUSH_SESSION_PARAM}=${sessionId}`,
          )
          socket.addEventListener('open', () => {
            for (const outgoing of [frame, JSON.stringify({channel: 'page-serving', serving: true})])
              socket.send(outgoing)
          })
          socket.addEventListener('message', (event) => {
            resolve(String(event.data))
            socket.close()
          })
          socket.addEventListener('close', (event) => resolve(`closed ${event.code}`))
        })
      const untrusted = JSON.stringify({type: SOCKET_TRUST_FRAME, token: 'not-a-token'})
      const closed = await Promise.all([pushSocket(untrusted), pushSocket('{"channel":"ready"}')])
      expect(closed).toEqual(['closed 1008', 'closed 1008'])
    } finally {
      await stop()
    }
  })

  test('the rpc mount keeps a valid client version from the http and websocket links and drops a malformed one', async () => {
    const served = await serveRpcRouter({router: versionRouter})
    const sockets: WebSocket[] = []
    const versionCall = (link: FetchRpcLink<Record<never, never>> | WebsocketRpcLink<Record<never, never>>) =>
      createORPCClient<{clientVersion: () => Promise<string | null>}>(link).clientVersion()
    const overBoth = (version: string) => {
      const websocket = new WebSocket(served.wsUrl)
      sockets.push(websocket)
      const headers = {[CONCIV_VERSION_HEADER]: version}
      return [
        versionCall(new FetchRpcLink({url: served.rpcUrl, headers})),
        versionCall(new WebsocketRpcLink({websocket, headers})),
      ]
    }
    try {
      const kept = ['1.2.3', '4.5.6-beta.1', '1.2.3+build.7']
      const dropped = ['not a version', '', '01.2.3', '1.2.3-beta..1']
      expect(await Promise.all(kept.flatMap(overBoth))).toEqual(kept.flatMap((version) => [version, version]))
      expect(await Promise.all(dropped.flatMap(overBoth))).toEqual(dropped.flatMap(() => [null, null]))
    } finally {
      for (const websocket of sockets) websocket.close()
      await served.close()
    }
  })
})

describe('settings storage', () => {
  const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
  const fileText = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null)
  const fileBecomes = (path: string, text: string) =>
    new Promise<void>((resolve, reject) => {
      const watcher = watch(dirname(path), () => {
        if (fileText(path) !== text) return
        watcher.close()
        resolve()
      })
      watcher.on('error', reject)
    })
  async function valueBecomes<T extends object>(store: SettingsStore<T>, expected: Partial<T>) {
    const reached = Promise.withResolvers<void>()
    const unsubscribe = await store.onChange((value) => {
      if (isEqual(value, expected)) reached.resolve()
    })
    return {reached: reached.promise.finally(unsubscribe)}
  }

  async function bootSettings(
    root: string,
    home: string,
    namespace: string,
    fixed: {agentToken?: string; port?: number} = {},
  ) {
    const scopes: ((name: string) => ExtensionScope<string>)[] = []
    const probe = defineExtension({name: 'settings probe'}).server((api) => {
      scopes.push(api.scope)
      return {context: {}}
    })
    const {made, origin, stop} = await serveCore(root, [probe], {home, agentToken: fixed.agentToken}, fixed.port)
    const scope = scopes[0]
    if (scope === undefined) throw new Error('the probe extension did not mount')
    return {scope, server: scope(namespace).settings, rpc: makeRpcClient(`${origin}/t/${made.agentToken}`), stop}
  }

  test('the server store, the rpc client store and a second subscriber share one debounced file per scope', async () => {
    const [root, home] = [tempDir(), tempDir()]
    const projectFolder = join(root, '.conciv', 'settings')
    const globalFolder = join(home, 'settings')
    mkdirSync(projectFolder, {recursive: true})
    mkdirSync(globalFolder, {recursive: true})
    const engine = await bootSettings(root, home, 'probe')
    const stream = new AbortController()
    try {
      type Probe = {theme: string; size: number; tags: string[]}
      const client = createClientSettings<Probe>(engine.rpc, 'probe', stream.signal)
      const project = {scope: 'project', namespace: 'probe'} as const
      const subscriber = await engine.rpc.settings.changes(project, {signal: stream.signal})
      expect((await subscriber.next()).value).toMatchObject({value: {}})
      const heard: unknown[] = []
      const unsubscribe = await client.project.onChange((value) => heard.push(value))
      const full = {theme: 'dark', size: 3, tags: ['a']}
      const projectFile = join(projectFolder, 'probe.json')
      const mirrored = await valueBecomes(client.project, full)
      const written = fileBecomes(projectFile, pretty(full))
      await Promise.all([
        engine.server.project.set('theme', 'dark'),
        engine.server.project.set('size', 3),
        engine.server.project.set('tags', ['a']),
      ])
      expect(existsSync(projectFile)).toBe(false)
      await mirrored.reached
      expect(await client.project.all()).toEqual(full)
      expect(await client.project.get('size')).toBe(3)
      expect((await subscriber.next()).value).toMatchObject({value: {theme: 'dark'}})
      await written
      expect(readdirSync(projectFolder)).toEqual(['probe.json'])
      const globalFile = join(globalFolder, 'probe.json')
      const projectRewritten = fileBecomes(projectFile, pretty({theme: 'dark', tags: ['a']}))
      const globalWritten = fileBecomes(globalFile, pretty({theme: 'light'}))
      await client.project.delete('size')
      expect(await engine.server.project.get('size')).toBeUndefined()
      await client.global.set('theme', 'light')
      expect(await engine.server.global.all()).toEqual({theme: 'light'})
      await Promise.all([projectRewritten, globalWritten])
      expect(heard).toContainEqual(full)
      expect(heard.at(-1)).toEqual({theme: 'dark', tags: ['a']})
      unsubscribe()
      const blue = await valueBecomes(client.project, {theme: 'blue', tags: ['a']})
      await engine.server.project.set('theme', 'blue')
      await blue.reached
      expect(await client.project.get('theme')).toBe('blue')
      expect(heard.at(-1)).toEqual({theme: 'dark', tags: ['a']})
    } finally {
      stream.abort()
      await engine.stop()
    }
  })

  test('a browser client keeps following a scope across an engine restart longer than the one-shot retry budget', async () => {
    const [root, home] = [tempDir(), tempDir()]
    const fixed = {agentToken: randomUUID(), port: await getPort()}
    const project = {scope: 'project', namespace: 'probe'} as const
    const first = await bootSettings(root, home, 'probe', fixed)
    const browser = makeBrowserRpcClient(`http://127.0.0.1:${fixed.port}/t/${fixed.agentToken}`)
    const stream = new AbortController()
    const engines = {running: first}
    try {
      const client = createClientSettings<{theme: string; size: number}>(browser.rpc, 'probe', stream.signal)
      const saved = await valueBecomes(client.project, {theme: 'dark', size: 3})
      const restarted = await valueBecomes(client.project, {theme: 'light', size: 3})
      await first.server.project.set('theme', 'dark')
      await first.server.project.set('size', 3)
      await saved.reached
      const before = await first.rpc.settings.all(project)
      expect(before).toMatchObject({version: 2})
      await first.stop()
      await wait(4000)
      const second = await bootSettings(root, home, 'probe', fixed)
      engines.running = second
      const after = await second.rpc.settings.all(project)
      expect(after).toMatchObject({version: 0, value: {theme: 'dark', size: 3}})
      expect(after.generation).not.toBe(before.generation)
      await second.server.project.set('theme', 'light')
      await restarted.reached
      expect(await client.project.all()).toEqual({theme: 'light', size: 3})
    } finally {
      stream.abort()
      browser.close()
      await engines.running.stop()
    }
  }, 30_000)

  test("two engines sharing one home hear each other's global changes and never echo their own write back", async () => {
    const home = tempDir()
    const one = createSettingsStorage(settingsOnDisk({global: home, project: tempDir()}))
    const two = createSettingsStorage(settingsOnDisk({global: home, project: tempDir()}))
    try {
      const mine = one.scope('probe').settings.global
      const theirs = two.scope('probe').settings.global
      expect(await theirs.all()).toEqual({})
      const heard = await valueBecomes(theirs, {theme: 'dark'})
      await mine.set('theme', 'dark')
      await one.flush()
      await heard.reached
      const echoed: unknown[] = []
      const unsubscribe = await mine.onChange((value) => echoed.push(value))
      const answered = await valueBecomes(mine, {theme: 'dark', size: 2})
      await theirs.set('size', 2)
      await two.flush()
      await answered.reached
      unsubscribe()
      expect(echoed).toEqual([{theme: 'dark', size: 2}])
    } finally {
      await Promise.all([one.close(), two.close()])
    }
  })

  test('saved settings survive a restart, a corrupt file starts empty, and a namespace outside the folder is refused', async () => {
    const [root, home] = [tempDir(), tempDir()]
    const folder = join(root, '.conciv', 'settings')
    mkdirSync(folder, {recursive: true})
    writeFileSync(join(folder, 'saved.json'), '{"__proto__": {"polluted": true}, "theme": "dark"}')
    writeFileSync(join(folder, 'broken.json'), '{not json')
    const first = await bootSettings(root, home, 'saved')
    await first.server.global.set('size', 4)
    await first.stop()
    const engine = await bootSettings(root, home, 'saved')
    try {
      expect(await engine.server.global.all()).toEqual({size: 4})
      expect(await engine.server.project.all()).toEqual({theme: 'dark'})
      expect(Object.getPrototypeOf(await engine.server.project.all())).toBe(Object.prototype)
      expect(await engine.server.project.get('__proto__')).toBeUndefined()
      expect(await engine.server.global.get('constructor')).toBeUndefined()
      const broken = {scope: 'project', namespace: 'broken'} as const
      expect(await engine.rpc.settings.all(broken)).toMatchObject({value: {}})
      expect(fileText(join(folder, 'broken.json'))).toBe('{not json')
      const fixed = fileBecomes(join(folder, 'broken.json'), pretty({fixed: true}))
      await engine.rpc.settings.set({...broken, key: 'fixed', value: true})
      await fixed
      const refusal = (pattern: RegExp) => ({
        code: 'BAD_REQUEST',
        data: {issues: [expect.objectContaining({message: expect.stringMatching(pattern)})]},
      })
      expect(
        await engine.rpc.settings.set({scope: 'project', namespace: 'release..prefs', key: 'on', value: true}),
      ).toMatchObject({value: {on: true}})
      await expect(engine.rpc.settings.all({scope: 'project', namespace: 'acme/editor'})).rejects.toMatchObject(
        refusal(/settings folder/),
      )
      await expect(engine.rpc.settings.all({scope: 'project', namespace: '../escape'})).rejects.toMatchObject(
        refusal(/settings folder/),
      )
      await expect(engine.rpc.settings.all({scope: 'global', namespace: 'nul\0name'})).rejects.toMatchObject(
        refusal(/NUL/),
      )
      await expect(engine.scope('../../escape').settings.project.set('theme', 'dark')).rejects.toThrow(
        /settings folder/,
      )
      expect(existsSync(join(root, 'escape.json'))).toBe(false)
    } finally {
      await engine.stop()
    }
  })
})
