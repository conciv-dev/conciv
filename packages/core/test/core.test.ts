import {execFileSync} from 'node:child_process'
import {mkdtempSync, rmSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, utimesSync} from 'node:fs'
import {writeFile, rm} from 'node:fs/promises'
import {createServer} from 'node:net'
import {tmpdir} from 'node:os'
import {join, relative, basename} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, it, expect, afterEach, test, beforeEach} from 'vitest'
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
import {type EngineStaleness} from '@conciv/contract'
import {chatMetadata, markers, openDb, type ConcivDb} from '@conciv/db'
import {defineTool, defineExtension} from '@conciv/extension'
import {PAGE_TOOL_DEFS} from '@conciv/extension-page/defs'
import {type SandboxTool, createToolRegistry} from '@conciv/extension/registry'
import {getHarness, type HarnessAdapter, defineHarness} from '@conciv/harness'
import {ChatEventType, type ChatEvent, runLifecycleEvent} from '@conciv/protocol/chat-event-types'
import {type ChatMessage} from '@conciv/protocol/chat-message-types'
import {CHAT_SSE_PATH, HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {type HarnessHistory} from '@conciv/protocol/harness-types'
import {pageFailure, type PageOutcome} from '@conciv/protocol/page-types'
import {builtinToolNames} from '@conciv/tools/builtins'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import {eq} from 'drizzle-orm'
import getPort from 'get-port'
import {Hono} from 'hono'
import {defineWebSocketHelper} from 'hono/ws'
import {z} from 'zod'
import {serverInstructions} from '../src/api/mcp.js'
import {hostDocument} from '../src/api/native-page.js'
import {makeApp, withBuiltinExtensions} from '../src/app.js'
import {resolveConfig, defineConfig} from '../src/config.js'
import {symbolicateFrame, symbolicateFrames} from '../src/editor/symbolicate.js'
import {corsMiddleware, originAllowed, type CorsVars} from '../src/lib/cors.js'
import {readDevEndpoint, removeDevEndpoint, writeDevEndpoint} from '../src/lib/dev-endpoint.js'
import {engineStaleness, loadedModules, makeStalenessProbe} from '../src/lib/engine-stamp.js'
import {statePaths} from '../src/lib/state-paths.js'
import {makeJournal, type PageBus, type PageEnv, makePageBus} from '../src/page-bus.js'
import {makeCoreRuntime} from '../src/runtime/core-runtime.js'
import {makeSessionPrimitives, type SessionPrimitives} from '../src/runtime/primitives.js'
import {type CoreRuntime} from '../src/runtime/scope-types.js'
import {runWithSession} from '../src/runtime/session-context.js'
import {start, composeSystemPrompt} from '../src/start.js'
import {makeBuiltinRegistry} from '../src/tool-registry.js'
import {testDb, pageRuntime, chunkWithInlineMap, cleanupChunks, peakLiveRuns, makeChatFixture} from './helpers.js'

describe('api cors', () => {
  function corsApp(allowed: string[] = []) {
    return new Hono<{Variables: CorsVars}>()
      .use(async (c, next) => {
        c.set('cors', {allowedOrigins: allowed})
        await next()
      })
      .use(corsMiddleware())
  }

  describe('originAllowed', () => {
    const none = new Set<string>()
    it('allows a missing Origin (non-browser caller: CLI, MCP)', () => {
      expect(originAllowed(null, none)).toBe(true)
    })
    it('allows loopback origins on any port', () => {
      expect(originAllowed('http://localhost:5173', none)).toBe(true)
      expect(originAllowed('http://127.0.0.1:3000', none)).toBe(true)
    })
    it('rejects public origins', () => {
      expect(originAllowed('https://evil.com', none)).toBe(false)
      expect(originAllowed('http://attacker.localhost.evil.com', none)).toBe(false)
    })
    it('allows an explicitly-listed extra origin (LAN dev)', () => {
      expect(originAllowed('http://192.168.1.5:5173', new Set(['http://192.168.1.5:5173']))).toBe(true)
      expect(originAllowed('http://192.168.1.9:5173', new Set(['http://192.168.1.5:5173']))).toBe(false)
    })
  })

  describe('corsMiddleware', () => {
    function makeApp(allowed: string[] = []) {
      return corsApp(allowed).get('/api/ping', (c) => c.json({ok: true}))
    }

    it('403s a cross-origin (public site) request', async () => {
      const res = await makeApp().request('http://127.0.0.1/api/ping', {
        headers: {host: '127.0.0.1', origin: 'https://evil.com'},
      })
      expect(res.status).toBe(403)
    })

    it('allows a loopback-origin request and reflects the origin', async () => {
      const res = await makeApp().request('http://127.0.0.1/api/ping', {
        headers: {host: '127.0.0.1', origin: 'http://localhost:5173'},
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    })

    it('allows a no-Origin request (CLI/MCP)', async () => {
      const res = await makeApp().request('http://127.0.0.1/api/ping', {headers: {host: '127.0.0.1'}})
      expect(res.status).toBe(200)
    })
  })
})

describe('api mcp instructions', () => {
  const FRESH = {stale: false, changed: [], tracked: ['@conciv/core'], bootedAt: 0, fingerprint: 'aaaa1111'}
  const STALE = {
    stale: true,
    changed: ['@conciv/tools'],
    tracked: ['@conciv/core', '@conciv/tools'],
    bootedAt: 0,
    fingerprint: 'bbbb2222',
  }

  describe('mcp server instructions', () => {
    it('says nothing about staleness while the engine matches the code on disk', () => {
      const text = serverInstructions('page', FRESH)

      expect(text).not.toMatch(/outdated|restart the dev server/i)
    })

    it('warns that the loaded server code is behind the disk and names what changed', () => {
      const text = serverInstructions('page', STALE)

      expect(text).toMatch(/server code on disk is newer than the running engine/i)
      expect(text).toMatch(/restart the dev server/i)
      expect(text).toContain('@conciv/tools')
    })

    it('still describes the sandbox workflow while it is warning about staleness', () => {
      const text = serverInstructions('page', STALE)

      expect(text).toContain('execute_typescript')
      expect(text).toContain('discover_tools')
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

    it('loads the native bundle with a prefix-relative src so token-scoped mounts resolve', () => {
      expect(hostDocument()).toContain('<script src="native/conciv-widget-native.global.js"></script>')
    })
  })
})

describe('app harness di', () => {
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
        await expect(runner?.run('return await external_unit_secret({apiKey: "k"})', 'parent')).rejects.toThrow(
          /secret/i,
        )
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

    describe('clearing a session', () => {
      it('removes only its own metadata, never a session whose id differs by a wildcard character or case', async () => {
        const chat = await plane({root: stateRoot(), harness: cliHarness(fakeCli())})
        const db = opened.at(-1)
        if (db === undefined) throw new Error('no db')
        const owners = ['conciv_a_b', 'conciv_axb', 'conciv_A_B']
        await db
          .insert(chatMetadata)
          .values(owners.map((owner) => ({namespace: 'conciv.approvals', key: `${owner}:grants`, valueJson: {owner}})))
        await chat.clear(SessionId.parse('conciv_a_b'))
        const kept = await db
          .select({key: chatMetadata.key})
          .from(chatMetadata)
          .where(eq(chatMetadata.namespace, 'conciv.approvals'))
        expect(kept.map((row) => row.key).toSorted()).toEqual(['conciv_A_B:grants', 'conciv_axb:grants'])
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

  type CliStep = 'reply' | 'silent' | 'partial' | 'split' | 'streaming' | 'stubborn' | 'tooling'

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
    tooling: () => [],
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

  async function* stuckInTool({cli, run, signal}: StepRun): AsyncGenerator<ChatEvent> {
    yield* createToolCallChunks('Read', {file_path: 'a.ts'}, {parentMessageId: `${run.runId}-a`})
    await Promise.race([cli.gate, aborted(signal)])
  }

  const STEP_BODY: Record<CliStep, (stepRun: StepRun) => AsyncGenerator<ChatEvent>> = {
    reply: answer,
    silent: silence,
    partial: answer,
    split: answer,
    streaming: cutOffMidText,
    stubborn: ignoreStop,
    tooling: stuckInTool,
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
})

describe('builtin tool calls', () => {
  const DeclaredFailure = z.object({code: z.string(), defined: z.boolean(), message: z.string()})

  const SESSION = SessionId.parse('conciv_s7')

  function envAsking(ask: PageBus['ask']): PageEnv {
    const bus: PageBus = {
      ask,
      connected: () => true,
      anySubscriber: () => false,
      resolve: (_sessionId: SessionId, _requestId: string, _outcome: PageOutcome) => false,
      subscribe: () => () => {},
    }
    return {journal: makeJournal(testDb()), root: '/repo', bus, storeCapture: async () => {}}
  }

  async function failureOf(call: Promise<unknown>): Promise<unknown> {
    return call.then(
      () => {
        throw new Error('expected the call to fail')
      },
      (error: unknown) => error,
    )
  }

  describe('a built-in tool call carries who asked and how it failed', () => {
    it('carries the calling session into the page caller for a registry page tool', async () => {
      const seen: unknown[] = []
      const registry = createToolRegistry({
        pageCaller: async (_tool, _input, request) => {
          seen.push(request)
          return {ok: true, value: 'a@b.c'}
        },
      })
      for (const tool of PAGE_TOOL_DEFS) registry.register(tool.client(), {owner: 'a test registrant'})
      await registry.call(
        'page_fill',
        {selector: '#email', value: 'a@b.c'},
        {request: {sessionId: SESSION, model: 'sonnet'}},
      )
      expect(seen).toEqual([{sessionId: SESSION, model: 'sonnet'}])
    })

    it('reports a page handler failure as a declared HANDLER_ERROR that names the tool', async () => {
      const env = envAsking(() => {
        throw pageFailure('handler-error', 'kaboom')
      })
      const registry = makeBuiltinRegistry({page: env, bundler: () => undefined, openInEditor: () => {}})
      for (const tool of PAGE_TOOL_DEFS) registry.register(tool.client(), {owner: 'a test registrant'})
      const scope = (await pageRuntime(env, registry)).forSession(SESSION)
      const failure = DeclaredFailure.parse(await failureOf(scope.tools.call('page_eval', {code: 'boom()'})))
      expect(failure.code).toBe('HANDLER_ERROR')
      expect(failure.defined).toBe(true)
      expect(failure.message).toContain('page_eval')
    })

    it('journals mutating calls from declaration meta and leaves reads out', async () => {
      const answers: Record<string, unknown>[] = [{text: 'hi'}, {ok: true}]
      const env = envAsking(async () => ({result: answers.shift() ?? {}}))
      const registry = makeBuiltinRegistry({page: env, bundler: () => undefined, openInEditor: () => {}})
      for (const tool of PAGE_TOOL_DEFS) registry.register(tool.client(), {owner: 'a test registrant'})
      const scope = (await pageRuntime(env, registry)).forSession(SESSION)
      await scope.tools.call('page_text', {selector: '#h'})
      await scope.tools.call('page_click', {selector: '.btn'})
      expect(await env.journal.list(SESSION)).toMatchObject([{verb: 'page_click', selector: '.btn'}])
    })
  })
})

describe('capability list guard', () => {
  const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url))

  const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'test', 'tests', 'e2e'])

  const NON_SOURCE_FILE = /\.(test|test-d|stories|browser\.test|it\.test)\.tsx?$/

  function isScannedSourcePath(path: string): boolean {
    if (!/\.tsx?$/.test(path) || NON_SOURCE_FILE.test(path)) return false
    return path.split('/').includes('src')
  }

  function sourceFiles(directory: string): string[] {
    const found: string[] = []
    for (const entry of readdirSync(directory)) {
      if (SKIPPED_DIRECTORIES.has(entry)) continue
      const path = join(directory, entry)
      if (statSync(path).isDirectory()) {
        found.push(...sourceFiles(path))
        continue
      }
      found.push(path)
    }
    return found
  }

  const sources = [join(workspaceRoot, 'packages'), join(workspaceRoot, 'apps', 'conciv')]
    .flatMap(sourceFiles)
    .map((path) => relative(workspaceRoot, path))
    .filter(isScannedSourcePath)
    .map((path) => ({path, text: readFileSync(join(workspaceRoot, path), 'utf8')}))

  const MULTI_SEGMENT_NAME = /^[a-z][a-zA-Z0-9]*[._][a-zA-Z0-9_.]+$/

  type Segment = {kind: 'code' | 'single' | 'double' | 'template'; text: string}

  type SegmentationState = {
    text: string
    segments: Segment[]
    interpolationDepths: number[]
    kind: Segment['kind']
    current: string
    index: number
  }

  const STRING_OPENERS: {[delimiter: string]: 'single' | 'double' | 'template'} = {
    "'": 'single',
    '"': 'double',
    '`': 'template',
  }

  function flushSegment(state: SegmentationState, next: Segment['kind']) {
    state.segments.push({kind: state.kind, text: state.current})
    state.kind = next
    state.current = ''
  }

  function trackInterpolationBraces(state: SegmentationState, char: string): 'closed' | 'kept' {
    const depthIndex = state.interpolationDepths.length - 1
    const depth = state.interpolationDepths[depthIndex]
    if (depth === undefined) return 'kept'
    if (char === '{') state.interpolationDepths[depthIndex] = depth + 1
    if (char !== '}') return 'kept'
    if (depth > 0) {
      state.interpolationDepths[depthIndex] = depth - 1
      return 'kept'
    }
    state.interpolationDepths.pop()
    return 'closed'
  }

  function stepCode(state: SegmentationState) {
    const char = state.text[state.index] ?? ''
    const openedKind = STRING_OPENERS[char]
    if (openedKind !== undefined) {
      flushSegment(state, openedKind)
      state.index += 1
      return
    }
    if (trackInterpolationBraces(state, char) === 'closed') {
      flushSegment(state, 'template')
      state.index += 1
      return
    }
    state.current += char
    state.index += 1
  }

  function stepString(state: SegmentationState) {
    const char = state.text[state.index] ?? ''
    if (char === '\\') {
      state.current += state.text.slice(state.index, state.index + 2)
      state.index += 2
      return
    }
    if (state.kind === 'template' && char === '$' && state.text[state.index + 1] === '{') {
      flushSegment(state, 'code')
      state.interpolationDepths.push(0)
      state.index += 2
      return
    }
    const closer = state.kind === 'single' ? "'" : state.kind === 'double' ? '"' : '`'
    if (char === closer) {
      flushSegment(state, 'code')
      state.index += 1
      return
    }
    state.current += char
    state.index += 1
  }

  function segmentSource(text: string): Segment[] {
    const state: SegmentationState = {text, segments: [], interpolationDepths: [], kind: 'code', current: '', index: 0}
    while (state.index < state.text.length) {
      if (state.kind === 'code') {
        stepCode(state)
        continue
      }
      stepString(state)
    }
    flushSegment(state, 'code')
    return state.segments
  }

  const DECLARATION_OPENER = /(?:defineTool|toolDefinition)\s*\(/

  const NAME_FIELD_AT_END = /(?:^|[^\w$.])name:\s*$/

  function parenthesisDelta(char: string): number {
    if (char === '(') return 1
    if (char === ')') return -1
    return 0
  }

  function declarationDepthAfter(codeText: string, depthBefore: number, opener: RegExp): number {
    let depth = depthBefore
    let cursor = 0
    while (cursor < codeText.length) {
      if (depth === 0) {
        const opened = opener.exec(codeText.slice(cursor))
        if (!opened) return 0
        cursor += opened.index + opened[0].length
        depth = 1
        continue
      }
      depth += parenthesisDelta(codeText[cursor] ?? '')
      cursor += 1
    }
    return depth
  }

  function harvestNames(segments: Segment[], opener: RegExp, fieldAtEnd: RegExp, nameOf: (value: string) => string) {
    const names: string[] = []
    let depth = 0
    segments.forEach((segment, segmentIndex) => {
      if (segment.kind !== 'code') return
      depth = declarationDepthAfter(segment.text, depth, opener)
      if (depth === 0) return
      if (!fieldAtEnd.test(segment.text)) return
      const following = segments[segmentIndex + 1]
      if (following?.kind === 'single') names.push(nameOf(following.text))
    })
    return names
  }

  type DeclarationFactory = {functionName: string; namePrefix: string; specField: string}

  const FUNCTION_DECLARATION = /function\s+([A-Za-z_$][\w$]*)/g

  const SPEC_FIELD_INTERPOLATION = /^\s*[A-Za-z_$][\w$]*\.([A-Za-z_$][\w$]*)\s*$/

  function templatedNameFactoryAt(
    segments: Segment[],
    segmentIndex: number,
    enclosingFunction: string,
  ): DeclarationFactory | undefined {
    if (enclosingFunction === '') return undefined
    const prefix = segments[segmentIndex + 1]
    if (prefix?.kind !== 'template' || prefix.text === '') return undefined
    const interpolation = segments[segmentIndex + 2]
    if (interpolation?.kind !== 'code') return undefined
    const specField = SPEC_FIELD_INTERPOLATION.exec(interpolation.text)?.[1]
    if (specField === undefined) return undefined
    return {functionName: enclosingFunction, namePrefix: prefix.text, specField}
  }

  function declarationFactoriesIn(segments: Segment[]): DeclarationFactory[] {
    const factories: DeclarationFactory[] = []
    let depth = 0
    let enclosingFunction = ''
    segments.forEach((segment, segmentIndex) => {
      if (segment.kind !== 'code') return
      for (const declaration of segment.text.matchAll(FUNCTION_DECLARATION)) enclosingFunction = declaration[1] ?? ''
      depth = declarationDepthAfter(segment.text, depth, DECLARATION_OPENER)
      if (depth === 0 || !NAME_FIELD_AT_END.test(segment.text)) return
      const factory = templatedNameFactoryAt(segments, segmentIndex, enclosingFunction)
      if (factory !== undefined) factories.push(factory)
    })
    return factories
  }

  function factoryCallNames(segments: Segment[], factory: DeclarationFactory): string[] {
    const opener = new RegExp(`(?<![\\w$.])${factory.functionName}\\s*\\(`)
    const fieldAtEnd = new RegExp(`(?:^|[^\\w$.])${factory.specField}:\\s*$`)
    return harvestNames(segments, opener, fieldAtEnd, (verb) => `${factory.namePrefix}${verb}`)
  }

  function declaredNamesIn(text: string): string[] {
    const segments = segmentSource(text)
    const names = harvestNames(segments, DECLARATION_OPENER, NAME_FIELD_AT_END, (name) => name)
    for (const factory of declarationFactoriesIn(segments)) {
      names.push(...factoryCallNames(segments, factory))
    }
    return names
  }

  function escapeForPattern(name: string): string {
    return name.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function mentionedInProse(prose: string, name: string): boolean {
    return new RegExp(`(?<![A-Za-z0-9_.])${escapeForPattern(name)}(?![A-Za-z0-9_.])`).test(prose)
  }

  function templateProseOf(text: string): string {
    return segmentSource(text)
      .filter((segment) => segment.kind === 'template')
      .map((segment) => segment.text)
      .join('\n')
  }

  function foreignNamesIn(
    text: string,
    registeredNames: string[],
    declared: Set<string>,
    templateProseExempt: boolean,
  ): string[] {
    const stripped = text.replaceAll(/\[\s*'[^']+'\s*\]/g, '[]')
    const prose = templateProseExempt ? '' : templateProseOf(text)
    return registeredNames.filter((name) => {
      if (declared.has(name)) return false
      if (stripped.includes(`'${name}'`) || stripped.includes(`"${name}"`)) return true
      return prose !== '' && mentionedInProse(prose, name)
    })
  }

  const BUILTIN_DECLARATION_DIRECTORY = 'packages/tools/src/builtins/'

  const PROMPT_PROSE_FILES = new Set([
    'packages/extensions/whiteboard/src/shared/meta.ts',
    'packages/extensions/whiteboard/src/tool/canvas/server.ts',
    'packages/extensions/ios/src/server/tools.ts',
  ])

  const declarationsByFile = new Map(sources.map((source) => [source.path, declaredNamesIn(source.text)]))

  const builtinNames = builtinToolNames()

  const capabilityNames = [...new Set([...builtinNames, ...[...declarationsByFile.values()].flat()])].filter((name) =>
    MULTI_SEGMENT_NAME.test(name),
  )

  function declaredSetFor(path: string): Set<string> {
    const declared = new Set(declarationsByFile.get(path) ?? [])
    if (!path.startsWith(BUILTIN_DECLARATION_DIRECTORY)) return declared
    for (const name of builtinNames) declared.add(name)
    return declared
  }

  const VIOLATION_REMEDY =
    'these files enumerate registered capability names outside their declaration sites; ' +
    "permitted escapes: index the declaration map (DECLARATIONS['the.name']) or import the declaration and reference its exported name constant"

  describe('capability lists live in the registry declarations only', () => {
    test('the scan is grounded: it sees the builtins, the extension declarations, and the source tree', () => {
      expect(capabilityNames).toContain('server_config')
      expect(capabilityNames).toContain('canvas_draw')
      expect(capabilityNames).toContain('recording_start')
      expect(capabilityNames.length).toBeGreaterThan(80)
      expect(sources.length).toBeGreaterThan(200)
    })

    test('every packages/extensions/* package contributes at least one harvested declaration name', () => {
      const extensionsRoot = join(workspaceRoot, 'packages', 'extensions')
      const extensionPackages = readdirSync(extensionsRoot).filter((entry) =>
        statSync(join(extensionsRoot, entry)).isDirectory(),
      )
      expect(extensionPackages.length).toBeGreaterThan(3)
      const declaring = extensionPackages.filter((extensionPackage) =>
        sources.some(
          (source) =>
            source.path.startsWith(`packages/extensions/${extensionPackage}/`) &&
            segmentSource(source.text).some(
              (segment) => segment.kind === 'code' && DECLARATION_OPENER.test(segment.text),
            ),
        ),
      )
      expect(declaring.length).toBeGreaterThanOrEqual(5)
      const unharvested = declaring.filter(
        (extensionPackage) =>
          ![...declarationsByFile.entries()].some(
            ([path, names]) => path.startsWith(`packages/extensions/${extensionPackage}/`) && names.length > 0,
          ),
      )
      expect(
        unharvested,
        'these extension packages declare tools through a shape the harvest cannot see; teach declaredNamesIn their declaration factory',
      ).toEqual([])
    })

    test('scope: only .ts/.tsx under a src directory inside packages/ and apps/conciv is scanned; .json/.js/.mdx files and other roots are out of scope by design', () => {
      expect(isScannedSourcePath('packages/core/src/chat/runtime.ts')).toBe(true)
      expect(isScannedSourcePath('apps/conciv/src/widget/panel.tsx')).toBe(true)
      expect(isScannedSourcePath('packages/core/src/config.json')).toBe(false)
      expect(isScannedSourcePath('packages/core/scripts/generate.js')).toBe(false)
      expect(isScannedSourcePath('apps/site/content/docs/tools.mdx')).toBe(false)
      expect(isScannedSourcePath('packages/core/vitest.config.ts')).toBe(false)
      expect(sources.some((source) => source.path.startsWith('apps/site/'))).toBe(false)
    })

    test('a file that declares a tool and also carries a parallel quoted-key dispatch table trips on the table', () => {
      const text = [
        "const alphaOneDef = defineTool({name: 'alpha_one', description: 'declares one (and only one) tool'})",
        "const HANDLERS = {'alpha_two': 2, 'alpha_three': 3}",
      ].join('\n')
      expect(declaredNamesIn(text)).toEqual(['alpha_one'])
      expect(
        foreignNamesIn(text, ['alpha_one', 'alpha_two', 'alpha_three'], new Set(declaredNamesIn(text)), false),
      ).toEqual(['alpha_two', 'alpha_three'])
    })

    test('a local declaration factory templating the tool name is harvested at its call sites', () => {
      const text = [
        'function alphaTool(spec: {verb: string; summary: string}) {',
        '  return defineTool({name: `alpha_${spec.verb}`, description: spec.summary})',
        '}',
        "const oneDef = alphaTool({verb: 'one', summary: 'the first tool'})",
        "const twoDef = alphaTool({verb: 'two', summary: 'the second tool'})",
      ].join('\n')
      expect(declaredNamesIn(text)).toEqual(['alpha_one', 'alpha_two'])
    })

    test('a defineTool( mention inside a string exempts nothing', () => {
      const text = [
        "const doc = 'call defineTool( to declare a tool'",
        "const KEYS = {'alpha_one': 1, 'alpha_two': 2}",
      ].join('\n')
      expect(declaredNamesIn(text)).toEqual([])
      expect(foreignNamesIn(text, ['alpha_one', 'alpha_two'], new Set(), false)).toEqual(['alpha_one', 'alpha_two'])
    })

    test('a capability list constructed inside a template literal trips', () => {
      const text = "const list = `alpha_one alpha_two`.split(' ')"
      expect(foreignNamesIn(text, ['alpha_one', 'alpha_two'], new Set(), false)).toEqual(['alpha_one', 'alpha_two'])
    })

    test('indexing the declaration map stays permitted', () => {
      const text = "const one = DECLARATIONS['alpha_one']\nconst two = DECLARATIONS['alpha_two']"
      expect(foreignNamesIn(text, ['alpha_one', 'alpha_two'], new Set(), false)).toEqual([])
    })

    test('a singleton list stays permitted', () => {
      const text = "const only = ['alpha_one']"
      expect(foreignNamesIn(text, ['alpha_one', 'alpha_two'], new Set(), false)).toEqual([])
    })

    test('template prose matching respects name boundaries', () => {
      const text = 'const prompt = `alpha_onemore and alpha_one_extra are different tools`'
      expect(foreignNamesIn(text, ['alpha_one'], new Set(), false)).toEqual([])
    })

    test('prompt-prose files are a visible named allowlist exempting the template channel only, honest while they still teach names in prose', () => {
      for (const path of PROMPT_PROSE_FILES) {
        const source = sources.find((candidate) => candidate.path === path)
        expect(source, `${path} left the tree; remove it from PROMPT_PROSE_FILES`).toBeDefined()
        if (!source) continue
        const prose = templateProseOf(source.text)
        const taught = capabilityNames.filter((name) => mentionedInProse(prose, name))
        expect(
          taught.length,
          `${path} no longer teaches capability names in template prose; remove it from PROMPT_PROSE_FILES`,
        ).toBeGreaterThanOrEqual(2)
      }
    })

    test('no source file outside a declaration site enumerates registered capability names', () => {
      const violations = sources
        .map((source) => ({
          path: source.path,
          names: foreignNamesIn(
            source.text,
            capabilityNames,
            declaredSetFor(source.path),
            PROMPT_PROSE_FILES.has(source.path),
          ),
        }))
        .filter((entry) => entry.names.length >= 2)
      expect(violations, VIOLATION_REMEDY).toEqual([])
    })
  })
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

    it('a harness session id outside the allowed charset is rejected for what it actually is, not as empty', () => {
      process.env.CONCIV_CLAUDE_SESSION_ID = 'has spaces/and-slashes'
      expect(() => resolveConfig({}, '/root')).toThrowError(/charset|characters|too long|128/i)
      expect(() => resolveConfig({}, '/root')).not.toThrowError(/is empty/)
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

describe('cors', () => {
  describe('cors PATCH', () => {
    it('advertises PATCH in the preflight method allowlist', async () => {
      const app = new Hono<{Variables: CorsVars}>()
        .use(async (c, next) => {
          c.set('cors', {allowedOrigins: []})
          await next()
        })
        .use(corsMiddleware())
        .get('/x', (c) => c.text('ok'))
      const res = await app.request('http://127.0.0.1/x', {
        method: 'OPTIONS',
        headers: {host: '127.0.0.1', origin: 'http://localhost:3000', 'access-control-request-method': 'PATCH'},
      })
      expect(res.headers.get('access-control-allow-methods')).toContain('PATCH')
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

    it('overwrites an existing file and re-applies the owner-only mode', () => {
      writeDevEndpoint(dir, {apiBase: 'http://127.0.0.1:1/native', token: null, pid: 1})
      writeDevEndpoint(dir, {apiBase: 'http://127.0.0.1:4599', token: null, pid: 2})
      expect(readDevEndpoint(dir)?.pid).toBe(2)
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

    it('replaces the file atomically without leaving a temp artifact behind', () => {
      writeDevEndpoint(dir, {apiBase: 'http://127.0.0.1:1/native', token: 'first', pid: 1})
      writeDevEndpoint(dir, {apiBase: 'http://127.0.0.1:4599', token: 'second', pid: 2})
      expect(readdirSync(dir)).toEqual(['dev-endpoint.json'])
      expect(readDevEndpoint(dir)).toEqual({apiBase: 'http://127.0.0.1:4599', token: 'second', pid: 2})
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
  const written: string[] = []
  afterEach(async () => {
    await cleanupChunks()
    for (const f of written.splice(0)) await rm(f, {force: true})
  })

  const ROOT = tmpdir()

  describe('symbolicateFrame', () => {
    it('resolves a file:// frame via an inline data map', async () => {
      const path = await chunkWithInlineMap('app/page.tsx', 17, 4)
      const loc = await symbolicateFrame({fileName: `file://${path}`, line: 2, column: 1}, ROOT)
      expect(loc).toEqual({file: 'app/page.tsx', line: 17, column: 4})
    })

    it('strips the about://React/Server/ prefix and ?query', async () => {
      const path = await chunkWithInlineMap('app/page.tsx', 17, 4)
      const loc = await symbolicateFrame({fileName: `about://React/Server/file://${path}?42`, line: 2, column: 1}, ROOT)
      expect(loc?.file).toBe('app/page.tsx')
    })

    it('resolves a sectioned (Turbopack-style) source map via AnyMap', async () => {
      const gen = new GenMapping()
      addMapping(gen, {generated: {line: 1, column: 0}, source: 'src/routes/index.tsx', original: {line: 5, column: 2}})
      const sectioned = {version: 3 as const, sections: [{offset: {line: 0, column: 0}, map: toEncodedMap(gen)}]}
      const b64 = Buffer.from(JSON.stringify(sectioned)).toString('base64')
      const path = join(tmpdir(), `conciv-sect-${Math.random().toString(36).slice(2)}.js`)
      await writeFile(path, `void 0;\n//# sourceMappingURL=data:application/json;base64,${b64}`)
      written.push(path)
      const loc = await symbolicateFrame({fileName: `file://${path}`, line: 1, column: 1}, ROOT)
      expect(loc?.file).toBe('src/routes/index.tsx')
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

    it('refuses a file:// frame outside the project root (path traversal)', async () => {
      const path = await chunkWithInlineMap('app/page.tsx', 17, 4)
      const loc = await symbolicateFrame({fileName: `file://${path}`, line: 2, column: 1}, join(ROOT, 'nope-subdir'))
      expect(loc).toBeNull()
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

    it('skips node_modules frames in symbolicateFrames', async () => {
      const nm = await chunkWithInlineMap('node_modules/next/dist/x.js', 1, 0)
      const app = await chunkWithInlineMap('app/page.tsx', 17, 4)
      const loc = await symbolicateFrames(
        [
          {fileName: `file://${nm}`, line: 2, column: 1},
          {fileName: `file://${app}`, line: 2, column: 1},
        ],
        ROOT,
      )
      expect(loc?.file).toBe('app/page.tsx')
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

  function holdPort(port: number): Promise<() => Promise<void>> {
    const blocker = createServer()
    return new Promise((resolve, reject) => {
      blocker.once('error', reject)
      blocker.listen(port, '127.0.0.1', () => resolve(() => new Promise<void>((done) => blocker.close(() => done()))))
    })
  }

  test('start boots on the requested fixed port and records it for the CLI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
    try {
      const engine = await start({
        options: {harnessBin: 'true', stateRoot: root},
        root,
        launchEditor: () => {},
        port: {exact: 41799},
      })
      try {
        expect(engine.port).toBe(41799)
        expect(recordedPort(root)).toEqual({port: 41799})
      } finally {
        await engine.stop()
      }
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('an exact port that is already taken fails loudly instead of landing somewhere else', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
    const taken = await getPort()
    const release = await holdPort(taken)
    try {
      await expect(
        start({options: {harnessBin: 'true', stateRoot: root}, root, launchEditor: () => {}, port: {exact: taken}}),
      ).rejects.toMatchObject({code: 'EADDRINUSE'})
    } finally {
      await release()
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('a preferred port that is already taken falls back to a free port the engine really serves on and records it', async () => {
    const rootFirst = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
    const rootSecond = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
    const preferred = await getPort()
    const first = await start({
      options: {harnessBin: 'true', stateRoot: rootFirst},
      root: rootFirst,
      launchEditor: () => {},
      port: {preferred},
    })
    try {
      expect(first.port).toBe(preferred)
      const second = await start({
        options: {harnessBin: 'true', stateRoot: rootSecond},
        root: rootSecond,
        launchEditor: () => {},
        port: {preferred},
      })
      try {
        expect(second.port).not.toBe(preferred)
        expect(recordedPort(rootFirst)).toEqual({port: preferred})
        expect(recordedPort(rootSecond)).toEqual({port: second.port})
        expect((await fetch(`http://127.0.0.1:${second.port}/health`)).ok).toBe(true)
        expect((await fetch(`http://127.0.0.1:${first.port}/health`)).ok).toBe(true)
      } finally {
        await second.stop()
      }
    } finally {
      await first.stop()
      rmSync(rootFirst, {recursive: true, force: true})
      rmSync(rootSecond, {recursive: true, force: true})
    }
  }, 20_000)

  test('a fresh boot takes its port straight from the listening socket, leaving it free for nobody', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
    try {
      const engine = await bootEngine(root)
      const port = engine.port
      await engine.stop()
      expect(await getPort({port})).toBe(port)
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

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

  test('start falls back to a free port and records it when the persisted port is taken', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-engine-port-'))
    try {
      const first = await bootEngine(root)
      const takenPort = first.port
      await first.stop()

      const release = await holdPort(takenPort)
      try {
        const second = await bootEngine(root)
        try {
          expect(second.port).not.toBe(takenPort)
          expect(recordedPort(root)).toEqual({port: second.port})
        } finally {
          await second.stop()
        }
      } finally {
        await release()
      }
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
    it('reports fresh while every loaded file is untouched on disk', () => {
      const path = tmpFile('core.js', 'export const a = 1')

      const probe = makeStalenessProbe([{label: '@conciv/core', path}])

      expect(probe().stale).toBe(false)
      expect(probe().changed).toEqual([])
    })

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

    it('turns stale when a loaded file is removed from disk', () => {
      const path = tmpFile('core.js', 'export const a = 1')
      const probe = makeStalenessProbe([{label: '@conciv/core', path}])

      rmSync(path)

      expect(probe().stale).toBe(true)
      expect(probe().changed).toEqual(['@conciv/core'])
    })

    it('keeps reporting stale on every later check instead of re-baselining after the first', () => {
      const path = tmpFile('core.js', 'export const a = 1')
      const probe = makeStalenessProbe([{label: '@conciv/core', path}])

      writeFileSync(path, 'export const a = 2')

      expect(probe().stale).toBe(true)
      expect(probe().stale).toBe(true)
      expect(probe().changed).toEqual(['@conciv/core'])
    })

    it('stays fresh when a rebuild rewrites identical bytes and only moves the mtime forward', () => {
      const path = tmpFile('core.js', 'export const a = 1')
      const probe = makeStalenessProbe([{label: '@conciv/core', path}])

      writeFileSync(path, 'export const a = 1')
      ageForward(path, 5)

      expect(probe().stale).toBe(false)
      expect(probe().changed).toEqual([])
    })

    it('turns stale when the bytes changed even though the mtime was put back', () => {
      const path = tmpFile('core.js', 'export const a = 1')
      const before = statSync(path)
      const probe = makeStalenessProbe([{label: '@conciv/core', path}])

      writeFileSync(path, 'export const a = 2')
      utimesSync(path, before.atime, before.mtime)

      expect(probe().stale).toBe(true)
      expect(probe().changed).toEqual(['@conciv/core'])
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

  describe('a package that ships more than one entry', () => {
    it('turns stale when an entry other than the one holding this module changes', () => {
      const chunk = tmpFile('app-hash.js', 'the chunk engine-stamp landed in')
      const config = tmpFile('config.js', 'a separate self-contained entry')
      const probe = makeStalenessProbe([
        {label: '@conciv/core', path: chunk},
        {label: '@conciv/core', path: config},
      ])
      expect(probe().stale).toBe(false)

      writeFileSync(config, 'a separate self-contained entry, rebuilt')

      expect(probe().stale).toBe(true)
      expect(probe().changed).toEqual(['@conciv/core'])
    })

    it('names a package once however many of its entries moved', () => {
      const chunk = tmpFile('app-hash.js', 'chunk')
      const config = tmpFile('config.js', 'config')
      const probe = makeStalenessProbe([
        {label: '@conciv/core', path: chunk},
        {label: '@conciv/core', path: config},
      ])

      writeFileSync(chunk, 'chunk rebuilt')
      writeFileSync(config, 'config rebuilt')

      expect(probe().changed).toEqual(['@conciv/core'])
    })
  })

  describe('the running engine stamp', () => {
    it('watches every published core entry, not just the chunk this module landed in', () => {
      const coreFiles = loadedModules()
        .filter((entry) => entry.label === '@conciv/core')
        .map((entry) => basename(entry.path))

      expect(coreFiles).toContain('config.js')
      expect(coreFiles.length).toBeGreaterThan(1)
    })

    it('watches the server packages this process actually loaded and finds them fresh at boot', () => {
      const now = engineStaleness()

      expect(now.tracked).toContain('@conciv/core')
      expect(now.tracked).toContain('@conciv/tools')
      expect(now.stale).toBe(false)
      expect(now.changed).toEqual([])
    })
  })

  const EndpointSchema = z.object({mcpUrl: z.string()})

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
          const {mcpUrl} = recordedEndpoint(root)
          expect(mcpUrl).toBe(`http://127.0.0.1:${engine.port}/api/mcp`)
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

describe('helpers run tally', () => {
  function lifecycle(runId: string, phase: 'running' | 'completed'): ChatEvent {
    return runLifecycleEvent.create({
      runId,
      phase,
      startedAt: 0,
      finishedAt: phase === 'completed' ? 1 : null,
      serverNow: 1,
      error: null,
    })
  }

  describe('peakLiveRuns', () => {
    it('closes a run on its terminal lifecycle so a later run does not inflate the peak', () => {
      const chunks: ChatEvent[] = [
        lifecycle('blocking', 'running'),
        lifecycle('blocking', 'completed'),
        lifecycle('next', 'running'),
        lifecycle('next', 'completed'),
      ]

      expect(peakLiveRuns(chunks)).toBe(1)
    })

    it('counts two runs that overlap', () => {
      const chunks: ChatEvent[] = [
        lifecycle('first', 'running'),
        lifecycle('second', 'running'),
        lifecycle('first', 'completed'),
        lifecycle('second', 'completed'),
      ]

      expect(peakLiveRuns(chunks)).toBe(2)
    })
  })
})

describe('page bus inflight teardown', () => {
  const SESSION = SessionId.parse('conciv_inflight')

  function requestIdOf(frames: unknown[]): string {
    const found = frames.flatMap((frame) =>
      typeof frame === 'object' && frame !== null && 'requestId' in frame && typeof frame.requestId === 'string'
        ? [frame.requestId]
        : [],
    )[0]
    if (found === undefined) throw new Error('the bus emitted no request frame')
    return found
  }

  it('a reply still settles the in-flight ask after the asking widget unsubscribes and a fresh one attaches', async () => {
    const bus = makePageBus(2000)
    const frames: unknown[] = []
    const unsubscribe = bus.subscribe(SESSION, (frame) => frames.push(frame))
    const answered = bus.ask(SESSION, {name: 'fixture_click', input: {}})
    await Promise.resolve()

    unsubscribe()
    bus.subscribe(SESSION, () => {})

    expect(bus.resolve(SESSION, requestIdOf(frames), {ok: true, result: {clicked: 'yes'}})).toBe(true)
    await expect(answered).resolves.toEqual({result: {clicked: 'yes'}})
  }, 10_000)
})

describe('page bus journal persistence', () => {
  const SESSION_A = SessionId.parse('conciv_journal_a')
  const SESSION_B = SessionId.parse('conciv_journal_b')

  describe('the page-change journal is DB-backed', () => {
    it('keeps each session isolated: list and clear never touch another session', async () => {
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-journal-'))
      const journal = makeJournal(openDb(stateRoot))

      await journal.append(SESSION_A, {verb: 'page_click', selector: '.a', args: {}}, 1)
      await journal.append(SESSION_B, {verb: 'page_click', selector: '.b', args: {}}, 2)

      expect(await journal.list(SESSION_A)).toMatchObject([{verb: 'page_click', selector: '.a'}])
      expect(await journal.list(SESSION_B)).toMatchObject([{verb: 'page_click', selector: '.b'}])

      await journal.clear(SESSION_A)

      expect(await journal.list(SESSION_A)).toEqual([])
      expect(await journal.list(SESSION_B)).toMatchObject([{verb: 'page_click', selector: '.b'}])
    })

    it('survives an engine restart: entries written before a fresh db handle are still readable after', async () => {
      const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-journal-restart-'))
      const beforeRestart = makeJournal(openDb(stateRoot))
      await beforeRestart.append(SESSION_A, {verb: 'page_fill', selector: '#email', args: {value: 'a@b.c'}}, 10)

      const afterRestart = makeJournal(openDb(stateRoot))
      expect(await afterRestart.list(SESSION_A)).toMatchObject([
        {verb: 'page_fill', selector: '#email', args: {value: 'a@b.c'}},
      ])
    })
  })
})

describe('page chain grep zero', () => {
  const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url))

  const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'test', 'tests', 'e2e'])

  const NON_SOURCE_FILE = /\.(test|test-d|stories|browser\.test|it\.test)\.tsx?$/

  function sourceFiles(directory: string): string[] {
    const found: string[] = []
    for (const entry of readdirSync(directory)) {
      if (SKIPPED_DIRECTORIES.has(entry)) continue
      const path = join(directory, entry)
      if (statSync(path).isDirectory()) {
        found.push(...sourceFiles(path))
        continue
      }
      if (!/\.tsx?$/.test(entry) || NON_SOURCE_FILE.test(entry)) continue
      found.push(path)
    }
    return found
  }

  const scannedFiles = [join(workspaceRoot, 'packages'), join(workspaceRoot, 'apps', 'conciv')]
    .flatMap(sourceFiles)
    .filter((path) => relative(workspaceRoot, path).split('/').includes('src'))

  const RETIRED_PAGE_CHAIN_NAMES = [
    /\bDOM_HANDLERS\b/,
    /\bPAGE_QUERY_KINDS\b/,
    /\bPageVerbMap\b/,
    /\bpage\.run\b/,
    /\bdispatchExtVerb\b/,
    /\bscopedPageCaller\b/,
    /\bBUILTIN_PAGE_TOOLS\b/,
    /\bcallPageVerb\b/,
    /\bMUTATING_KINDS\b/,
    /\bMIRROR_KINDS\b/,
  ]

  describe('the pre-dispatcher page plumbing stays deleted', () => {
    test('the scan is grounded: it walks the shipped source tree', () => {
      expect(scannedFiles.length).toBeGreaterThan(200)
      const scanned = scannedFiles.map((path) => relative(workspaceRoot, path))
      expect(scanned).toContain('packages/extensions/page/src/shared/defs.ts')
      expect(scanned).toContain('packages/core/src/tool-registry.ts')
    })

    test('no shipped source file mentions a retired page-chain identifier', () => {
      const hits = scannedFiles.flatMap((path) => {
        const text = readFileSync(path, 'utf8')
        return RETIRED_PAGE_CHAIN_NAMES.filter((pattern) => pattern.test(text)).map((pattern) => ({
          file: relative(workspaceRoot, path),
          pattern: String(pattern),
        }))
      })
      expect(hits, 'these files resurrect pre-dispatcher page plumbing').toEqual([])
    })
  })
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

  async function madeRuntime(): Promise<{runtime: CoreRuntime; primitives: SessionPrimitives}> {
    const fixture = await makeChatFixture()
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
    return {runtime, primitives}
  }

  function requestIdOf(frame: unknown): string | null {
    if (typeof frame !== 'object' || frame === null || !('requestId' in frame)) return null
    return typeof frame.requestId === 'string' ? frame.requestId : null
  }

  function widgetOn(primitives: SessionPrimitives, id: SessionId, reply: Record<string, unknown>): () => void {
    return primitives.page.bus.subscribe(id, (frame) => {
      const requestId = requestIdOf(frame)
      if (requestId === null) return
      queueMicrotask(() => primitives.page.bus.resolve(id, requestId, {ok: true, result: reply}))
    })
  }

  function reachableIn(catalog: {list: () => {name: string; reachable: boolean}[]}, name: string): boolean | undefined {
    return catalog.list().find((entry) => entry.name === name)?.reachable
  }

  describe('the page forwarder reads its session from the established scope, not from its parameter', () => {
    it('refuses to run at all when no scope is established', async () => {
      const {primitives} = await madeRuntime()
      await expect(
        primitives.registry.call('fixture_click', {ref: 'r1'}, {request: {sessionId: SESSION_A, model: null}}),
      ).rejects.toThrow(/runWithSession/)
    })

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

    it('a scope method reaches the forwarder without any caller passing a session', async () => {
      const {runtime, primitives} = await madeRuntime()
      const unsubscribe = widgetOn(primitives, SESSION_A, {clicked: 'a'})
      expect(await runtime.forSession(SESSION_A).tools.call('fixture_click', {ref: 'r1'})).toEqual({clicked: 'a'})
      unsubscribe()
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

    it('the engine catalog keeps the engine-wide answer', async () => {
      const {runtime, primitives} = await madeRuntime()
      const unsubscribe = widgetOn(primitives, SESSION_A, {clicked: 'a'})
      const entry = runtime.engine.catalog().find((signature) => signature.name === 'fixture_click')
      expect(entry?.reachable).toBe(true)
      unsubscribe()
      expect(runtime.engine.catalog().find((signature) => signature.name === 'fixture_click')?.reachable).toBe(false)
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

  test('a configured extension contributes its systemPrompt', () => {
    const prompt = composeSystemPrompt('base prompt', [configuredExtension], {
      cwd: '/repo',
      extensions: {ios: {projectRoot: '/app'}},
    })
    expect(prompt).toContain('iOS overlay rules.')
  })

  test('a schemaless extension always contributes its systemPrompt', () => {
    const prompt = composeSystemPrompt('base prompt', [demoExtension], {cwd: '/repo', extensions: {}})
    expect(prompt).toContain('Demo extension rules.')
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

  test('the built-in page extension steers the standing prompt toward the typed verbs', () => {
    const prompt = composeSystemPrompt('base prompt', withBuiltinExtensions(undefined), {cwd: '/repo'})
    expect(prompt).toContain('page_snapshot')
    expect(prompt).toContain('last resort')
    expect(prompt).toContain('approval on every call')
  })

  test('a prompt factory never runs for an unconfigured extension', () => {
    const prompt = composeSystemPrompt('base prompt', [groundedExtension], {cwd: '/repo', extensions: {}})
    expect(prompt).toBe('base prompt')
  })
})
