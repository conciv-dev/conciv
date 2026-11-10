import {randomUUID} from 'node:crypto'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterAll, afterEach, beforeAll, describe, expect, it, test} from 'vitest'
import WebSocket from 'ws'
import {expect as expectLocator} from 'playwright/test'
import type {Page} from 'playwright'
import type {RouterClient} from '@orpc/server'
import {createORPCClient} from '@orpc/client'
import {heldBrowserRpcLink} from '@conciv/contract'
import {fetchServerSentEvents} from '@conciv/ai/client'
import {ChatEventType} from '@conciv/protocol/chat-event-types'
import {start as startEngine, type Engine} from '@conciv/core'
import {connectMcpClient, createFakeHarness, makeRpcClient, until, type RpcClient} from '@conciv/harness-testkit'
import {fixtureHost, getExtensionTestApi} from '@conciv/extension-testkit'
import {CHAT_SSE_PATH, CONCIV_SESSION_HEADER, HarnessSessionId} from '@conciv/protocol/chat-types'
import type {HarnessAdapter} from '@conciv/harness'
import type {TtyServerControl} from '@conciv/protocol/terminal-types'
import terminalExtension, {default as terminal, type TerminalRouter} from '../src/server.js'
import {createTtySessions, type TtySessions, type TtySink} from '../src/server/pty-sessions.js'
import {recordingHarness, startTerminalServer, type TerminalTestServer} from './helpers.js'

describe('prefixed serving', () => {
  const TOKEN = '8a1e7d5c-3b2f-4e6a-9c0d-1f2e3a4b5c6d'

  describe('prefixed serving over the real wire (start with an access token)', () => {
    let root: string
    let engine: Engine
    let base: string
    let rpc: RpcClient

    beforeAll(async () => {
      root = mkdtempSync(join(tmpdir(), 'conciv-prefixed-wire-'))
      const harness: HarnessAdapter = createFakeHarness({id: 'fake-prefixed-wire', text: 'prefixed ok'})
      engine = await startEngine({
        options: {stateRoot: root, systemPrompt: false, harness: 'fake-prefixed-wire'},
        root,
        harness,
        extensions: [terminalExtension],
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

describe('pty sessions', () => {
  const BASH = {bin: 'bash', args: ['--noprofile', '--norc', '-i'], env: {TERM: 'xterm-256color', PS1: 'P> '}}

  type SinkUpdate = {kind: 'data'; text: string} | {kind: 'control'; frame: TtyServerControl}

  type Collected = {chunks: string[]; controls: TtyServerControl[]; sink: TtySink}

  function collect(onUpdate: (update: SinkUpdate) => void = () => {}): Collected {
    const chunks: string[] = []
    const controls: TtyServerControl[] = []
    return {
      chunks,
      controls,
      sink: {
        data: (chunk) => {
          chunks.push(chunk)
          onUpdate({kind: 'data', text: chunks.join('')})
        },
        control: (frame) => {
          controls.push(frame)
          onUpdate({kind: 'control', frame})
        },
      },
    }
  }

  describe('pty sessions', () => {
    const cleanups: TtySessions[] = []

    const make = (opts?: Parameters<typeof createTtySessions>[0]): TtySessions => {
      const sessions = createTtySessions(opts)
      cleanups.push(sessions)
      return sessions
    }

    afterEach(() => {
      for (const sessions of cleanups.splice(0)) sessions.shutdown()
    })

    it('streams output and echoes input through a real pty', async () => {
      const sessions = make()
      const s = sessions.open('s1', BASH, process.cwd(), 'test-tty')
      const echoed = Promise.withResolvers<string>()
      const {sink} = collect((update) => {
        if (update.kind === 'data' && update.text.includes('tty-roundtrip-42')) echoed.resolve(update.text)
      })
      s.attach(sink)
      s.write('echo tty-roundtrip-$((40+2))\r')
      expect(await echoed.promise).toContain('tty-roundtrip-42')
    })

    it('replays buffered bytes to a late attacher', async () => {
      const sessions = make()
      const s = sessions.open('s2', BASH, process.cwd(), 'test-tty')
      const marked = Promise.withResolvers<string>()
      const early = collect((update) => {
        if (update.kind === 'data' && update.text.includes('replay-marker')) marked.resolve(update.text)
      })
      const detach = s.attach(early.sink)
      s.write('echo replay-marker\r')
      expect(await marked.promise).toContain('replay-marker')
      detach()
      const late = collect()
      s.attach(late.sink)
      expect(late.chunks.join('')).toContain('replay-marker')
    })

    it('applies resize', async () => {
      const sessions = make()
      const s = sessions.open('s3', BASH, process.cwd(), 'test-tty')
      const sized = Promise.withResolvers<string>()
      const {sink} = collect((update) => {
        if (update.kind === 'data' && update.text.includes('41 97')) sized.resolve(update.text)
      })
      s.attach(sink)
      s.resize(97, 41)
      s.write('stty size\r')
      expect(await sized.promise).toContain('41 97')
    })

    it('reports exit to sinks and via exited()', async () => {
      const sessions = make()
      const s = sessions.open('s4', BASH, process.cwd(), 'test-tty')
      const exited = Promise.withResolvers<TtyServerControl>()
      const {controls, sink} = collect((update) => {
        if (update.kind === 'control' && update.frame.type === 'exit') exited.resolve(update.frame)
      })
      s.attach(sink)
      s.write('exit 3\r')
      expect(await exited.promise).toEqual({type: 'exit', code: 3})
      expect(s.exited()).toEqual({code: 3})
      expect(controls.some((f) => f.type === 'exit' && f.code === 3)).toBe(true)
    })

    it('surfaces a spawn failure as an error control frame, not a crash', async () => {
      const sessions = make()
      const s = sessions.open(
        's6',
        {bin: '/nonexistent/definitely-missing-bin', args: [], env: {}},
        process.cwd(),
        'test-tty',
      )
      const failed = Promise.withResolvers<TtyServerControl>()
      const {sink} = collect((update) => {
        if (update.kind !== 'control') return
        if (update.frame.type === 'error' || update.frame.type === 'exit') failed.resolve(update.frame)
      })
      s.attach(sink)
      expect((await failed.promise).type).toMatch(/^(error|exit)$/)
    })

    it('injects into live sinks and the replay buffer', async () => {
      const sessions = make()
      const s = sessions.open('s7', BASH, process.cwd(), 'test-tty')
      const injected = Promise.withResolvers<string>()
      const live = collect((update) => {
        if (update.kind === 'data' && update.text.includes('\r\nconciv marker\r\n')) injected.resolve(update.text)
      })
      const detach = s.attach(live.sink)
      s.inject('conciv marker')
      expect(await injected.promise).toContain('\r\nconciv marker\r\n')
      detach()
      const late = collect()
      s.attach(late.sink)
      expect(late.chunks.join('')).toContain('\r\nconciv marker\r\n')
    })

    it('interrupt() sends ctrl-c that aborts the running foreground command', async () => {
      const sessions = make()
      const s = sessions.open('s8', BASH, process.cwd(), 'test-tty')
      const started = Promise.withResolvers<string>()
      const resumed = Promise.withResolvers<string>()
      const {sink} = collect((update) => {
        if (update.kind !== 'data') return
        if (update.text.includes('sleep 30')) started.resolve(update.text)
        if (update.text.includes('B6K')) resumed.resolve(update.text)
      })
      s.attach(sink)
      s.write('sleep 30 && echo S$((5+5))P\r')
      await started.promise
      await new Promise((r) => setTimeout(r, 300))
      s.interrupt()
      s.write('echo B$((3+3))K\r')
      expect(await resumed.promise).not.toContain('S10P')
    })

    it('broadcasts OSC 9;4 busy transitions to attached sinks', async () => {
      const sessions = make()
      const s = sessions.open('s9', BASH, process.cwd(), 'test-tty')
      const turnedBusy = Promise.withResolvers<TtyServerControl>()
      const turnedIdle = Promise.withResolvers<TtyServerControl>()
      const {controls, sink} = collect((update) => {
        if (update.kind !== 'control' || update.frame.type !== 'busy') return
        if (update.frame.busy) turnedBusy.resolve(update.frame)
        if (!update.frame.busy && controls.some((f) => f.type === 'busy' && f.busy)) turnedIdle.resolve(update.frame)
      })
      s.attach(sink)
      expect(controls).toEqual([{type: 'busy', busy: false}])
      s.write('printf "\\033]9;4;1\\007"\r')
      expect(await turnedBusy.promise).toEqual({type: 'busy', busy: true})
      expect(s.busy()).toBe(true)
      s.write('printf "\\033]9;4;0\\007"\r')
      expect(await turnedIdle.promise).toEqual({type: 'busy', busy: false})
      expect(s.busy()).toBe(false)
      expect(controls.filter((f) => f.type === 'busy').map((f) => f.busy)).toEqual([false, true, false])
    })

    it('tells a late attacher the current busy state', async () => {
      const sessions = make()
      const s = sessions.open('s10', BASH, process.cwd(), 'test-tty')
      const turnedBusy = Promise.withResolvers<TtyServerControl>()
      const early = collect((update) => {
        if (update.kind === 'control' && update.frame.type === 'busy' && update.frame.busy) {
          turnedBusy.resolve(update.frame)
        }
      })
      const detach = s.attach(early.sink)
      s.write('printf "\\033]9;4;1\\007"\r')
      await turnedBusy.promise
      expect(s.busy()).toBe(true)
      detach()
      const late = collect()
      s.attach(late.sink)
      expect(late.controls.some((f) => f.type === 'busy' && f.busy)).toBe(true)
    })

    it('debounces rapid interrupts so a double-Escape cannot send two ctrl-c', async () => {
      const sessions = make()
      const s = sessions.open('s11', BASH, process.cwd(), 'test-tty')
      const started = Promise.withResolvers<string>()
      const resumed = Promise.withResolvers<string>()
      const {chunks, sink} = collect((update) => {
        if (update.kind !== 'data') return
        if (update.text.includes('sleep 30')) started.resolve(update.text)
        if (update.text.includes('D4N')) resumed.resolve(update.text)
      })
      s.attach(sink)
      s.write('sleep 30\r')
      await started.promise
      await new Promise((r) => setTimeout(r, 300))
      s.interrupt()
      s.interrupt()
      s.write('echo D$((2+2))N\r')
      await resumed.promise
      const echoed = chunks.join('').match(/\^C/g) ?? []
      expect(echoed.length).toBe(1)
    })

    it('evicts an idle session with no sinks', async () => {
      const sessions = make({idleEvictMs: 100})
      const s = sessions.open('s5', BASH, process.cwd(), 'test-tty')
      const detach = s.attach(collect().sink)
      detach()
      await until(() => sessions.get('s5') === undefined, {hangGuardMs: 3000})
    })
  })
})

describe('routes', () => {
  type Client = {ws: WebSocket; received: string[]; controls: string[]}

  function connect(
    wsBase: string,
    sessionId: string,
    params = '',
    onData: (text: string) => void = () => {},
  ): Promise<Client> {
    const ws = new WebSocket(`${wsBase}/api/ext/terminal/tty?session=${sessionId}${params}`)
    const client: Client = {ws, received: [], controls: []}
    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        client.controls.push(String(data))
        return
      }
      client.received.push(new TextDecoder().decode(data as Buffer))
      onData(client.received.join(''))
    })
    return new Promise((resolve, reject) => {
      ws.on('open', () => resolve(client))
      ws.on('error', reject)
    })
  }

  describe('terminal extension routes', () => {
    const sessionId = `conciv_${randomUUID()}`
    const ctx: {server?: TerminalTestServer} = {}
    const rpc = () => {
      if (!ctx.server) throw new Error('server not started')
      return ctx.server.rpc
    }
    const wsBase = () => ctx.server?.wsBase ?? ''

    beforeAll(async () => {
      ctx.server = await startTerminalServer()
    })

    afterAll(() => ctx.server?.close())

    it('reports no live terminal before open', async () => {
      expect(await rpc().state({sessionId})).toEqual({alive: false, busy: false})
    })

    it('opens a pty and streams bytes over ws', async () => {
      expect(await rpc().open({sessionId})).toEqual({alive: true})
      expect((await rpc().state({sessionId})).alive).toBe(true)

      const roundTripped = Promise.withResolvers<string>()
      const resized = Promise.withResolvers<string>()
      const client = await connect(wsBase(), sessionId, '&cols=100&rows=30', (text) => {
        if (text.includes('ws-roundtrip-42')) roundTripped.resolve(text)
        if (text.includes('27 91')) resized.resolve(text)
      })
      client.ws.send('echo ws-roundtrip-$((40+2))\r')
      expect(await roundTripped.promise).toContain('ws-roundtrip-42')

      client.ws.send(JSON.stringify({type: 'resize', cols: 91, rows: 27}))
      client.ws.send('stty size\r')
      expect(await resized.promise).toContain('27 91')
      client.ws.close()
    })

    it('serves the same rpc procedures over the composite websocket mount', async () => {
      const held = heldBrowserRpcLink(() => ctx.server?.base ?? null)
      const wsClient = createORPCClient<RouterClient<TerminalRouter>>(held.link, {path: ['ext', 'terminal']})
      expect(await wsClient.state({sessionId})).toEqual(await rpc().state({sessionId}))
      expect((await wsClient.state({sessionId})).alive).toBe(true)
      held.release()
    })

    it('replays buffered bytes on reconnect', async () => {
      const replayed = Promise.withResolvers<string>()
      const client = await connect(wsBase(), sessionId, '', (text) => {
        if (text.includes('ws-roundtrip-42')) replayed.resolve(text)
      })
      expect(await replayed.promise).toContain('ws-roundtrip-42')
      client.ws.close()
    })

    it('open is idempotent while the pty is alive: buffer survives a re-open', async () => {
      expect(await rpc().open({sessionId})).toEqual({alive: true})
      const replayed = Promise.withResolvers<string>()
      const client = await connect(wsBase(), sessionId, '', (text) => {
        if (text.includes('ws-roundtrip-42')) replayed.resolve(text)
      })
      expect(await replayed.promise).toContain('ws-roundtrip-42')
      client.ws.close()
    })

    it('inject control frame writes a marker readable by a reconnecting socket', async () => {
      const injected = Promise.withResolvers<string>()
      const client = await connect(wsBase(), sessionId, '', (text) => {
        if (text.includes('\r\nconciv says hi\r\n')) injected.resolve(text)
      })
      client.ws.send(JSON.stringify({type: 'inject', text: 'conciv says hi'}))
      expect(await injected.promise).toContain('\r\nconciv says hi\r\n')
      client.ws.close()
      const replayed = Promise.withResolvers<string>()
      const second = await connect(wsBase(), sessionId, '', (text) => {
        if (text.includes('\r\nconciv says hi\r\n')) replayed.resolve(text)
      })
      expect(await replayed.promise).toContain('\r\nconciv says hi\r\n')
      second.ws.close()
    })

    it('rejects ws for a session with no live pty', async () => {
      const other = `conciv_${randomUUID()}`
      const ws = new WebSocket(`${wsBase()}/api/ext/terminal/tty?session=${other}`)
      const code = await new Promise<number>((resolve, reject) => {
        ws.on('close', (c) => resolve(c))
        ws.on('error', reject)
      })
      expect(code).toBe(4404)
    })

    it('refuses a malformed or missing session with a 400 before any upgrade', async () => {
      const base = ctx.server?.base ?? ''
      for (const query of ['?session=not-a-session', '?session=', '']) {
        const response = await fetch(`${base}/api/ext/terminal/tty${query}`)
        expect(response.status).toBe(400)
        expect(await response.text()).toBe('invalid or missing session')
      }
      const ws = new WebSocket(`${wsBase()}/api/ext/terminal/tty?session=not-a-session`)
      const status = await new Promise<number>((resolve, reject) => {
        ws.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0))
        ws.on('open', () => reject(new Error('the upgrade completed for a malformed session')))
      })
      expect(status).toBe(400)
    }, 5000)

    it('close kills the pty and later ws connects are refused', async () => {
      expect(await rpc().close({sessionId})).toEqual({alive: false})
      expect(await rpc().state({sessionId})).toEqual({alive: false, busy: false})

      const ws = new WebSocket(`${wsBase()}/api/ext/terminal/tty?session=${sessionId}`)
      const code = await new Promise<number>((resolve, reject) => {
        ws.on('close', (c) => resolve(c))
        ws.on('error', reject)
      })
      expect(code).toBe(4404)
    })

    it('spawns with model override, conciv mcp url, and session id', async () => {
      const {harness, captured} = recordingHarness()
      const dedicated = await startTerminalServer(harness)
      try {
        expect(await dedicated.rpc.open({sessionId, model: 'claude-x'})).toEqual({alive: true})
        expect(captured).toHaveLength(1)
        expect(captured[0]?.model).toBe('claude-x')
        expect(captured[0]?.mcpUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/mcp$/)
        expect(captured[0]?.concivSessionId).toBe(sessionId)
      } finally {
        await dedicated.close()
      }
    })

    it('spawns with an mcp url that carries the app base path', async () => {
      const {harness, captured} = recordingHarness()
      const dedicated = await startTerminalServer(harness, {basePath: '/t/tok-terminal'})
      try {
        expect(await dedicated.rpc.open({sessionId})).toEqual({alive: true})
        expect(captured[0]?.mcpUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/t\/tok-terminal\/api\/mcp$/)
      } finally {
        await dedicated.close()
      }
    })

    it('injects a resumed marker when reopening an existing transcript', async () => {
      const {harness} = recordingHarness()
      const dedicated = await startTerminalServer({...harness, transcriptExists: () => true})
      try {
        dedicated.sessions.tokens.set(sessionId, HarnessSessionId.parse(randomUUID()))
        expect(await dedicated.rpc.open({sessionId})).toEqual({alive: true})
        const resumed = Promise.withResolvers<string>()
        const client = await connect(dedicated.wsBase, sessionId, '', (text) => {
          if (text.includes('\u2500 conciv: resumed session \u2500')) resumed.resolve(text)
        })
        expect(await resumed.promise).toContain('\u2500 conciv: resumed session \u2500')
        client.ws.close()
      } finally {
        await dedicated.close()
      }
    })

    it('a session switched to another harness never reattaches the old harness terminal', async () => {
      const first = recordingHarness()
      const second = recordingHarness()
      const current = {harness: first.harness}
      const dedicated = await startTerminalServer(first.harness, {harnessOf: () => current.harness})
      try {
        expect(await dedicated.rpc.open({sessionId})).toEqual({alive: true})
        current.harness = {...second.harness, id: 'test-tty-switched'}
        expect(await dedicated.rpc.state({sessionId})).toEqual({alive: false, busy: false})
        expect(await dedicated.rpc.open({sessionId})).toEqual({alive: true})
        expect(first.captured).toHaveLength(1)
        expect(second.captured).toHaveLength(1)
        expect((await dedicated.rpc.state({sessionId})).alive).toBe(true)
      } finally {
        await dedicated.close()
      }
    })

    it('switching away and back without touching the terminal starts a fresh terminal', async () => {
      const first = recordingHarness()
      const dedicated = await startTerminalServer(first.harness)
      try {
        expect(await dedicated.rpc.open({sessionId})).toEqual({alive: true})
        dedicated.sessions.tokens.delete(sessionId)
        expect(await dedicated.rpc.state({sessionId})).toEqual({alive: false, busy: false})
        expect(await dedicated.rpc.open({sessionId})).toEqual({alive: true})
        expect(first.captured).toHaveLength(2)
      } finally {
        await dedicated.close()
      }
    })

    it('rejects open when the harness has no tty command', async () => {
      const bare = await startTerminalServer({id: 'no-tty'})
      try {
        await expect(bare.rpc.open({sessionId})).rejects.toMatchObject({code: 'NO_TTY'})
      } finally {
        await bare.close()
      }
    })
  })
})

describe('terminal view', () => {
  const bashTty = {
    command: () => ({
      bin: 'bash',
      args: ['--noprofile', '--norc', '-i'],
      env: {TERM: 'xterm-256color', PS1: 'P> '},
    }),
  }

  async function openTerminalView(page: Page): Promise<void> {
    await page.getByRole('tab', {name: 'Terminal'}).click()
    await expectLocator(page.getByText('P>').first()).toBeVisible({timeout: 30_000})
  }

  test('a remounted terminal view replays the pty output it left behind', async () => {
    const api = await getExtensionTestApi({
      server: terminal,
      host: fixtureHost(fileURLToPath(new URL('../dist/test-host', import.meta.url))),
      harness: createFakeHarness({id: 'fake-terminal', text: 'ok', tty: bashTty}),
    })
    try {
      const {page} = api
      await openTerminalView(page)
      await page.keyboard.type('echo reload-marker-$((40+2))')
      await page.keyboard.press('Enter')
      await expectLocator(page.getByText('reload-marker-42').first()).toBeVisible({timeout: 30_000})

      await page.reload({waitUntil: 'domcontentloaded'})
      await openTerminalView(page)
      await expectLocator(page.getByText('reload-marker-42').first()).toBeVisible({timeout: 30_000})
    } finally {
      await api.dispose()
    }
  }, 90_000)
})
