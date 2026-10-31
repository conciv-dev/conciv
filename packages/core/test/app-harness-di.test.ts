import {describe, expect, it, afterEach} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getHarness} from '@conciv/harness'
import {type HarnessHistory} from '@conciv/protocol/harness-types'
import {type HarnessAdapter, defineHarness} from '@conciv/harness'
import {makeApp} from '../src/app.js'
import {execFileSync} from 'node:child_process'
import {z} from 'zod'
import {defineWebSocketHelper} from 'hono/ws'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import {makeTextAdapter} from '@conciv/ai/server'
import {createToolCallChunks} from '@conciv/ai/testkit'
import {
  cappedText,
  cappedValue,
  createChatPlane,
  RESULT_CAP_CHARS,
  registryCapabilities,
  safeStringify,
  truncationEnvelope,
  type ChatPlane,
  type CodeCapability,
  type SessionPort,
} from '@conciv/chat'
import {markers, openDb, type ConcivDb} from '@conciv/db'
import {eq} from 'drizzle-orm'
import type {SandboxTool} from '@conciv/extension/registry'
import {CHAT_SSE_PATH, HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'

describe('makeApp harness DI', () => {
  it('uses the injected harness over the registry lookup', async () => {
    const real = getHarness('claude')
    if (!real) throw new Error('no claude')
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-di-'))
    const marker = {seen: false}
    const injected: HarnessAdapter = Object.assign({}, real)
    Object.defineProperty(injected, 'id', {
      get() {
        marker.seen = true
        return real.id
      },
    })
    const {dispose} = await makeApp({
      cfg: {
        enabled: true,
        widgetUrl: undefined,
        stateRoot,
        harness: 'claude',
        harnessBin: undefined,
        sessionId: undefined,
        harnessSessionId: undefined,
        systemPrompt: '',
        extensions: undefined,
      },
      cwd: stateRoot,
      openInEditor: () => {},
      harness: injected,
    })
    await dispose()
    rmSync(stateRoot, {recursive: true, force: true})
    expect(marker.seen).toBe(true)
  })
})

describe('chat plane', () => {
  afterEach(() => {
    for (const db of opened.splice(0)) db.$client.close()
    for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true})
  })

  describe('result cap', () => {
    it('an oversized result is capped with a truncation envelope carrying reason, advice and head', () => {
      const body = 'z'.repeat(RESULT_CAP_CHARS + 10)
      const capped = JSON.parse(cappedText(body))
      expect(capped).toMatchObject({'conciv:truncated': true, truncated: true})
      expect(capped.reason).toContain(String(RESULT_CAP_CHARS))
      expect(capped.advice).toMatch(/narrow the request/)
      expect(capped.head.length).toBeLessThan(body.length)
      expect(cappedText('small')).toBe('small')
    })

    it('a capped value never ships whole and keeps a well-formed head', () => {
      const value = {blob: '😀'.repeat(RESULT_CAP_CHARS)}
      const capped = cappedValue(value)
      expect(JSON.stringify(capped).length).toBeLessThan(RESULT_CAP_CHARS)
      expect(JSON.parse(truncationEnvelope('why', 'head'))).toMatchObject({reason: 'why', head: 'head'})
    })

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

    it('no capabilities means no code-mode tool', async () => {
      const root = stateRoot()
      const chat = await plane({root, harness: cliHarness(fakeCli())})
      expect(await chat.codeRunner(SessionId.parse(sessionId('none')), () => undefined)).toBeNull()
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

    it('importing the engine entry never loads the isolated-vm native addon', () => {
      const loaded = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "await import('@conciv/chat'); console.log(process.report.getReport().sharedObjects.some((path) => path.includes('isolated_vm')))",
        ],
        {cwd: join(import.meta.dirname, '..'), encoding: 'utf8'},
      )
      expect(loaded.trim()).toBe('false')
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

    it(
      'run timing survives a restart, and a timed-out run reads failed with "no output"',
      {timeout: 3_000},
      async () => {
        const root = stateRoot()
        const cli = fakeCli()
        cli.steps.push('reply', 'silent')
        const first = await plane({root, harness: cliHarness(cli), firstOutputTimeoutMs: 300})
        const done = sessionId('timed')
        const silent = sessionId('silent')
        await readUntil(await startTurn(first, done, 'timed-run', 'timed'), 'end')
        const silentEnd = runEnded(silent)
        void readUntil(await startTurn(first, silent, 'silent-run', 'silence'), 'end')
        await silentEnd
        const before = (await first.hydrate(SessionId.parse(done))).lastRun
        const next = await plane({root, harness: cliHarness(fakeCli())})
        expect((await next.hydrate(SessionId.parse(done))).lastRun).toMatchObject({
          runId: 'timed-run',
          phase: 'completed',
          startedAt: before?.startedAt,
          finishedAt: before?.finishedAt,
        })
        const timedOut = (await next.hydrate(SessionId.parse(silent))).lastRun
        expect(timedOut).toMatchObject({runId: 'silent-run', phase: 'failed'})
        expect(timedOut?.error).toMatch(/no output/)
        cli.release()
      },
    )

    it('a corrupt CLI transcript during recovery does not break boot and the turn still settles', async () => {
      const root = stateRoot()
      const cli = fakeCli()
      cli.steps.push('partial')
      const broken = corruptHistory()
      const nativeId = HarnessSessionId.parse('native-corrupt')
      const first = await plane({root, harness: cliHarness(cli, broken), nativeId})
      const id = sessionId('corrupt')
      await readUntil(await startTurn(first, id, 'corrupt-run', 'before restart'), ChatEventType.TEXT_MESSAGE_CONTENT)
      const next = await plane({root, harness: cliHarness(fakeCli(), broken), nativeId})
      expect((await next.hydrate(SessionId.parse(id))).lastRun).toMatchObject({
        runId: 'corrupt-run',
        phase: 'aborted',
      })
      cli.release()
    })
  })

  describe('compaction', () => {
    it('the compact divider lands after the last message the widget shows when a turn streamed two segments', async () => {
      const root = stateRoot()
      const cli = fakeCli()
      cli.steps.push('split')
      const chat = await plane({root, harness: cliHarness(cli)})
      const id = SessionId.parse(sessionId('split'))
      await readUntil(await startTurn(chat, id, 'split-run', 'two segments'), 'end')
      const shown = (await chat.hydrate(id)).messages
      await chat.compact(id)
      const db = opened.at(-1)
      if (db === undefined) throw new Error('no db')
      const rows = await db.select().from(markers).where(eq(markers.sessionId, id))
      expect(rows.map((row) => row.afterTurn)).toEqual([shown.length])
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

    it('Stop returns while the run is still winding down', async () => {
      const root = stateRoot()
      const cli = fakeCli()
      cli.steps.push('stubborn')
      const chat = await plane({root, harness: cliHarness(cli)})
      const id = SessionId.parse(sessionId('stubborn'))
      const ended = runEnded(id)
      await readUntil(await startTurn(chat, id, 'stubborn-run', 'ignore stop'), ChatEventType.RUN_STARTED)
      const first = await Promise.race([chat.stop(id).then(() => 'stop'), ended.then(() => 'run end')])
      expect(first).toBe('stop')
      cli.release()
      await ended
    })
  })

  describe('transcript import', () => {
    it('a hydrate right after Stop does not import the stopped turn from the CLI transcript a second time', async () => {
      const root = stateRoot()
      const cli = fakeCli()
      cli.steps.push('silent')
      const transcript = growingHistory()
      const chat = await plane({root, harness: cliHarness(cli, transcript.history), nativeId: transcript.nativeId})
      const id = SessionId.parse(sessionId('stopped'))
      await readUntil(await startTurn(chat, id, 'stopped-run', 'stop me'), ChatEventType.RUN_STARTED)
      await chat.stop(id)
      await transcript.settling
      const hydrated = chat.hydrate(id)
      await Promise.race([hydrated, new Promise((resolve) => setTimeout(resolve, 200))])
      transcript.release()
      const users = (await hydrated).messages.filter((message) => message.role === 'user')
      expect(users.map((message) => message.id)).toEqual(['stopped-run-user'])
      cli.release()
    })
  })
})

type CliStep = 'reply' | 'silent' | 'partial' | 'split' | 'streaming' | 'stubborn'

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

function toolThenSecondSegment(runId: string): ChatEvent[] {
  return [
    ...createToolCallChunks('Read', {file_path: 'a.ts'}, {parentMessageId: `${runId}-a`, result: 'ok'}),
    {type: ChatEventType.TEXT_MESSAGE_START, messageId: `${runId}-b`, role: 'assistant'},
    {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: `${runId}-b`, delta: 'second segment'},
    {type: ChatEventType.TEXT_MESSAGE_END, messageId: `${runId}-b`},
  ]
}

const STEP_TAIL: Record<CliStep, (runId: string) => ChatEvent[]> = {
  reply: () => [],
  silent: () => [],
  partial: () => [],
  split: toolThenSecondSegment,
  streaming: () => [],
  stubborn: () => [],
}

const FIRST_DELTA = 'partial reply'

type StepRun = {cli: FakeCli; step: CliStep; run: {threadId: string; runId: string}; signal: AbortSignal | undefined}

async function* answer({cli, step, run}: StepRun): AsyncGenerator<ChatEvent> {
  yield {type: ChatEventType.TEXT_MESSAGE_START, messageId: `${run.runId}-a`, role: 'assistant'}
  yield {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: `${run.runId}-a`, delta: FIRST_DELTA}
  if (step === 'partial') await cli.gate
  yield {type: ChatEventType.TEXT_MESSAGE_END, messageId: `${run.runId}-a`}
  yield* STEP_TAIL[step](run.runId)
  yield {type: ChatEventType.RUN_FINISHED, ...run}
}

async function* silence({cli, signal}: StepRun): AsyncGenerator<ChatEvent> {
  await Promise.race([cli.gate, aborted(signal)])
  yield* []
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

async function* ignoreStop({cli}: StepRun): AsyncGenerator<ChatEvent> {
  await cli.gate
  yield* []
}

const STEP_BODY: Record<CliStep, (stepRun: StepRun) => AsyncGenerator<ChatEvent>> = {
  reply: answer,
  silent: silence,
  partial: answer,
  split: answer,
  streaming: cutOffMidText,
  stubborn: ignoreStop,
}

function cliHarness(cli: FakeCli, history?: HarnessHistory): HarnessAdapter {
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
  if (history === undefined) return defineHarness({...shared, capabilities: {...base, transcriptHistory: false}})
  return defineHarness({...shared, capabilities: {...base, transcriptHistory: true}, history})
}

const runEnds: {sessionId: string; settle: () => void}[] = []

function runEnded(sessionId: string): Promise<void> {
  return new Promise((settle) => runEnds.push({sessionId, settle}))
}

function sessionPort(nativeId: HarnessSessionId | null = null): SessionPort {
  return {
    row: () => ({model: null, nativeId, cwd: '/workspace'}),
    ensure: async () => undefined,
    recordNativeId: async () => undefined,
    recordUsage: async () => undefined,
    recordContextTokens: async () => undefined,
    recordTitle: async () => undefined,
    onRunStart: async () => undefined,
    publish: () => undefined,
    onRunEnd: async (ended) => {
      runEnds.filter((waiter) => waiter.sessionId === ended).forEach((waiter) => waiter.settle())
    },
  }
}

type PlaneOptions = {
  root: string
  harness: HarnessAdapter
  capabilities?: CodeCapability[]
  firstOutputTimeoutMs?: number
  systemPrompt?: {systemPromptFile?: string; systemPromptText?: string}
  log?: string[]
  nativeId?: HarnessSessionId | null
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
    sessions: sessionPort(options.nativeId ?? null),
    toolNames: new Set(),
    capabilities: () => options.capabilities ?? [],
    attachmentExpanders: {},
    commands: {allow: [], ask: [], deny: []},
    firstOutputTimeoutMs: options.firstOutputTimeoutMs ?? 30_000,
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

function growingHistory() {
  const settling = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  const reads = {count: 0}
  const native: ChatMessage = {id: 'native-user', role: 'user', parts: [{type: 'text', content: 'stop me'}]}
  const history: HarnessHistory = {
    list: async () => [],
    messages: async () => {
      reads.count += 1
      if (reads.count === 1) return []
      if (reads.count === 2) {
        settling.resolve()
        await gate.promise
      }
      return [native]
    },
    meta: async () => null,
    observe: () => ({
      revision: async () => ({ok: false, reason: 'missing', detail: 'unused'}),
      read: async () => ({ok: false, reason: 'missing', detail: 'unused'}),
      close: () => undefined,
    }),
  }
  return {
    history,
    nativeId: HarnessSessionId.parse('native-stopped'),
    settling: settling.promise,
    release: () => gate.resolve(),
  }
}

function corruptHistory(): HarnessHistory {
  return {
    list: async () => [],
    messages: async () => {
      throw new Error('corrupt transcript')
    },
    meta: async () => null,
    observe: () => ({
      revision: async () => ({ok: false, reason: 'missing', detail: 'corrupt'}),
      read: async () => ({ok: false, reason: 'missing', detail: 'corrupt'}),
      close: () => undefined,
    }),
  }
}
