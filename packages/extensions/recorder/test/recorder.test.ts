import {randomUUID} from 'node:crypto'
import {chmodSync, existsSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import type {Page} from 'playwright-core'
import {z} from 'zod'
import {call, type RouterClient} from '@orpc/server'
import {fetchServerSentEvents} from '@conciv/ai/client'
import {start, type Engine} from '@conciv/core'
import {makeExtRpcClient, type AnyExtension} from '@conciv/extension'
import {rpcCallCursor} from '@conciv/extension-testkit/rpc-counts'
import {connectMcpClient, createFakeHarness, makeDiscoverTools} from '@conciv/harness-testkit'
import {until} from '@conciv/harness-testkit/until'
import {CHAT_SSE_PATH} from '@conciv/protocol/chat-types'
import recorderExtension, {makeRecorderRouter, type RecorderRouter} from '../src/server.js'
import {createFlusher} from '../src/client/flusher.js'
import {createCaptureControl} from '../src/server/capture-control.js'
import {createRecordingStore} from '../src/server/recordings.js'
import {createChromiumRenderer, type KeyframeRenderer} from '../src/server/render.js'
import {createClientRings} from '../src/server/rings.js'
import {pullWindow, renderRecording} from '../src/server/runtime.js'
import {
  MAX_FLUSH_BYTES,
  RECORDER_MIME,
  RECORDER_NAME,
  recordingRefJson,
  type RecorderControl,
  type RrwebEvent,
} from '../src/shared/protocol.js'
import {buttonFixture, pageFixture} from './fixtures/page.js'
import {addMarker, runtimeFixture, startLiveCapture, useRecorderTestApi} from './helpers.js'

describe('capture survives run end', () => {
  const api = useRecorderTestApi({harness: createFakeHarness()})

  async function runAgentTurnToCompletion(): Promise<void> {
    const abort = new AbortController()
    const connection = fetchServerSentEvents(`${api().apiBase}${CHAT_SSE_PATH}`)
    const turn = connection.connect(
      [{id: randomUUID(), role: 'user', parts: [{type: 'text', content: 'hello'}]}],
      {},
      abort.signal,
      {threadId: api().session, runId: randomUUID()},
    )
    for await (const chunk of turn) {
      if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') break
    }
    abort.abort()
  }

  describe('requested recordings survive run end (real browser)', () => {
    it('keeps the capture live across a finished agent run and still records later user actions', async () => {
      const started = z.object({captureId: z.string()}).parse(await api().callTool('recording_start', {}))
      await runAgentTurnToCompletion()
      await addMarker(api().page)
      const stopped = JSON.stringify(
        await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0}),
      )
      expect(stopped).not.toContain('no active capture')
      expect(stopped).toContain('click')
      expect(stopped).toContain('Add marker')
    }, 120_000)
  })
})

describe('capture', () => {
  const api = useRecorderTestApi()

  const suiteCapture: {captureId?: string} = {}

  beforeAll(async () => {
    suiteCapture.captureId = (await startLiveCapture(api())).captureId
  }, 60_000)

  afterAll(async () => {
    if (!suiteCapture.captureId) return
    await api().callTool('recording_stop', {captureId: suiteCapture.captureId, keyframes: 0})
  }, 60_000)

  function recorderRpc() {
    return makeExtRpcClient<RecorderRouter>(api().apiBase, 'recorder')
  }

  async function connectedClientId(): Promise<string> {
    const {clients} = await recorderRpc().clients()
    const latest = clients.at(-1)
    if (!latest) throw new Error('no recorder client is connected yet')
    return latest.id
  }

  async function windowOf(): Promise<Awaited<ReturnType<ReturnType<typeof recorderRpc>['window']>>> {
    return recorderRpc().window({clientId: await connectedClientId()})
  }

  async function windowJson(): Promise<string> {
    return JSON.stringify((await windowOf()).events)
  }

  async function flushIntoTheRing(): Promise<void> {
    await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})
  }

  describe('recorder end to end (real browser, real engine)', () => {
    it('records real page interaction and recording_pull returns a matching action log', async () => {
      await addMarker(api().page)
      const result = await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})
      const text = JSON.stringify(result)
      expect(text).toContain('click')
      expect(text).toContain('Add marker')
    }, 120_000)

    it('marked capture start/stop brackets the actions in between', async () => {
      const started = z.object({captureId: z.string()}).parse(await api().callTool('recording_start', {}))
      await addMarker(api().page)
      const stopped = await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0})
      expect(JSON.stringify(stopped)).toContain('Add marker')
    }, 120_000)

    it('strips script bodies from snapshots (slimDOM) so page code never bloats the ring', async () => {
      const label = await addMarker(api().page)
      await flushIntoTheRing()
      const stored = await windowJson()
      expect(stored).toContain(label)
      expect(stored).toContain('Comment target')
      expect(stored).not.toContain('FIXTURE_SCRIPT_BODY')
    }, 120_000)

    it('samples input events to the last value instead of one event per keystroke', async () => {
      const field = api().page.getByRole('textbox', {name: 'Fixture input'})
      await field.click()
      await field.pressSequentially('sampling', {delay: 40})
      await field.press('Tab')
      await flushIntoTheRing()
      const {events} = await windowOf()
      expect(JSON.stringify(events)).toContain('sampling')
      const inputEvents = events.filter((event) => JSON.stringify(event).includes('"text":"s'))
      expect(inputEvents.length).toBeLessThan(4)
    }, 120_000)

    it('never captures conciv-marked light-DOM styles, so no multi-megabyte events', async () => {
      const label = await addMarker(api().page)
      await flushIntoTheRing()
      const {events} = await windowOf()
      expect(JSON.stringify(events)).toContain(label)
      expect(JSON.stringify(events)).not.toContain('CONCIV_FONT_FIXTURE')
      const largest = Math.max(...events.map((event) => JSON.stringify(event).length))
      expect(largest).toBeLessThan(500_000)
    }, 120_000)

    it('panel loads a live replay (reconstructed page) and follows new page activity without reopening', async () => {
      await api().page.getByRole('tab', {name: 'Recorder'}).click()
      const send = api().page.getByRole('button', {name: 'Send to agent'})
      await send.waitFor({state: 'visible', timeout: 15_000})
      const replay = api().page.frameLocator('iframe')
      await expectLocator(replay.getByText('Comment target', {exact: true}).first()).toBeAttached({timeout: 30_000})
      const label = await addMarker(api().page)
      await expectLocator(replay.getByText(label, {exact: true}).first()).toBeAttached({timeout: 30_000})
    }, 120_000)
  })
})

describe('export video', () => {
  const context = {context: {request: new Request('http://local')}}

  const page = pageFixture([buttonFixture(4, 5, 'Recorded')])

  const events: RrwebEvent[] = [
    {type: 4, data: {href: 'http://localhost/app', width: 640, height: 480}, timestamp: 1000},
    {type: 2, data: {node: page, initialOffset: {left: 0, top: 0}}, timestamp: 1001},
    {type: 3, data: {source: 2, type: 2, id: 4}, timestamp: 2000},
  ]

  const state: {renderer?: KeyframeRenderer | null} = {}

  afterAll(async () => state.renderer?.dispose())

  describe('recording video export (real chromium screencast)', () => {
    it('exports a saved recording as a webm file', async () => {
      const runtime = runtimeFixture()
      state.renderer = await createChromiumRenderer()
      if (!state.renderer) throw new Error('chromium unavailable in test environment')
      runtime.useRenderer = async (work) => (state.renderer ? work(state.renderer) : null)
      const saved = await runtime.recordings.save(events)
      if (!saved.ok) throw new Error('fixture save failed')
      const router = makeRecorderRouter(runtime)
      const result = await call(router.recordings.exportVideo, {recordingId: saved.recordingId}, context)
      if (!(result instanceof File)) throw new Error(`expected a File, got ${JSON.stringify(result)}`)
      expect(result.type).toBe('video/webm')
      const bytes = new Uint8Array(await result.arrayBuffer())
      expect(bytes.length).toBeGreaterThan(5_000)
      expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3])
    }, 180_000)

    it('reports an expired recording as a typed error', async () => {
      const runtime = runtimeFixture()
      const router = makeRecorderRouter(runtime)
      const missing = await call(router.recordings.exportVideo, {recordingId: 'nope'}, context)
      expect(missing).toEqual({error: 'expired'})
    })
  })
})

describe('extension', () => {
  const extensions: AnyExtension[] = [recorderExtension]

  function recorderClient(base: string) {
    return makeExtRpcClient<RecorderRouter>(base, 'recorder')
  }

  async function boot(): Promise<{base: string; engine: Engine}> {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-recorder-it-'))
    const engine = await start({
      options: {systemPrompt: false, stateRoot},
      root: mkdtempSync(join(tmpdir(), 'conciv-recorder-root-')),
      launchEditor: () => {},
      extensions,
    })
    return {base: `http://127.0.0.1:${engine.port}`, engine}
  }

  const phases: {phase: string; ms: number}[] = []
  const clock = {startedAt: 0}

  function mark(phase: string): void {
    phases.push({phase, ms: Math.round(performance.now() - clock.startedAt)})
  }

  function sawMessage(seen: unknown[], expected: Record<string, boolean>): boolean {
    const entries = Object.entries(expected)
    return seen.some((message) => {
      if (typeof message !== 'object' || message === null) return false
      if (Object.keys(message).length !== entries.length) return false
      return entries.every(([key, value]) => Reflect.get(message, key) === value)
    })
  }

  const page = pageFixture([buttonFixture(4, 5, 'Buy')])

  function fixtureStream(base: number): RrwebEvent[] {
    return [
      {type: 4, data: {href: 'http://localhost/app', width: 800, height: 600}, timestamp: base},
      {type: 2, data: {node: page}, timestamp: base + 1},
      {type: 3, data: {source: 2, type: 2, id: 4}, timestamp: base + 2},
    ]
  }

  async function callViaSandbox(base: string, name: string, input: unknown): Promise<unknown> {
    const mcp = await connectMcpClient(`${base}/api/mcp`)
    try {
      const execute = (await mcp.tools()).find((tool) => tool.name === 'execute_typescript')
      if (!execute) throw new Error('execute_typescript not on /api/mcp')
      return await execute.execute({typescriptCode: `return await external_${name}(${JSON.stringify(input)})`})
    } finally {
      await mcp.close()
    }
  }

  function envelopeResult(raw: unknown): unknown {
    return z
      .object({result: z.unknown()})
      .loose()
      .parse(JSON.parse(z.string().parse(raw))).result
  }

  describe('recorder extension booted in the real engine (IT)', () => {
    beforeEach(() => {
      phases.length = 0
      clock.startedAt = performance.now()
    })

    afterEach((ctx) => {
      if (ctx.task.result?.state === 'fail') console.error(`[recorder-it] phases ${JSON.stringify(phases)}`)
    })

    it('round-trips flush -> window -> log over the extension rpc', async () => {
      const {base, engine} = await boot()
      try {
        const rpc = recorderClient(base)
        await rpc.flush({clientId: 'c1', events: fixtureStream(Date.now())})
        const {events} = await rpc.window({clientId: 'c1'})
        expect(events.length).toBe(3)
        const {entries} = await rpc.log({clientId: 'c1'})
        expect(entries.map((entry) => entry.kind)).toEqual(['navigation', 'click'])
        expect(entries[1]?.detail).toContain('Buy')
      } finally {
        await engine.stop()
      }
    }, 30_000)

    it('reset clears the ring and asks clients for a fresh snapshot', async () => {
      const {base, engine} = await boot()
      try {
        const rpc = recorderClient(base)
        await rpc.flush({clientId: 'c1', events: fixtureStream(Date.now())})
        const resnapshot = Promise.withResolvers<unknown>()
        const abort = new AbortController()
        const control = await rpc.control(undefined, {signal: abort.signal})
        const subscribed = Promise.withResolvers<void>()
        const pump = (async () => {
          for await (const message of control) {
            subscribed.resolve()
            if (sawMessage([message], {snapshot: true, flush: true})) resnapshot.resolve(message)
          }
        })()
        await subscribed.promise
        await rpc.reset(undefined)
        const {events} = await rpc.window({clientId: 'c1'})
        expect(events).toEqual([])
        expect(await resnapshot.promise).toEqual({snapshot: true, flush: true})
        abort.abort()
        await pump.catch(() => {})
      } finally {
        await engine.stop()
      }
    }, 30_000)

    it('serves parsed config defaults on the config route', async () => {
      const {base, engine} = await boot()
      try {
        const config = await recorderClient(base).config(undefined)
        expect(config).toEqual({masking: 'none', windowMinutes: 10, console: true})
      } finally {
        await engine.stop()
      }
    }, 30_000)

    it('recording_pull through the sandbox returns the action log as text', async () => {
      const {base, engine} = await boot()
      try {
        await recorderClient(base).flush({clientId: 'c1', events: fixtureStream(Date.now() - 2000)})
        const log = z.string().parse(await callViaSandbox(base, 'recording_pull', {secondsBack: 60, keyframes: 0}))
        expect(log).toContain('click')
        expect(log).toContain('Buy')
      } finally {
        await engine.stop()
      }
    }, 30_000)

    it('discover_tools carries the recorder declaration with its summary', async () => {
      const {base, engine} = await boot()
      try {
        const {tools} = await makeDiscoverTools(base, '')(['recording_pull'])
        expect(tools.map((tool) => tool.name)).toEqual(['external_recording_pull'])
        expect(tools[0]?.description.toLowerCase()).toContain('recording')
      } finally {
        await engine.stop()
      }
    }, 30_000)

    it('recording_start with no page client attached answers with a clear error instead of a captureId', async () => {
      const {base, engine} = await boot()
      try {
        const reply = JSON.stringify(await callViaSandbox(base, 'recording_start', {}))
        expect(reply).not.toContain('captureId')
        expect(reply).toContain('no page client')
      } finally {
        await engine.stop()
      }
    }, 30_000)

    it('start/stop capture emits control events to subscribers and returns the marked window', async () => {
      const {base, engine} = await boot()
      mark('boot')
      try {
        const rpc = recorderClient(base)
        const abort = new AbortController()
        const control = await rpc.control(undefined, {signal: abort.signal})
        mark('control')
        const wentLive = Promise.withResolvers<unknown>()
        const subscribed = Promise.withResolvers<void>()
        const pump = (async () => {
          for await (const message of control) {
            subscribed.resolve()
            if (sawMessage([message], {live: true, snapshot: true, flush: true})) {
              wentLive.resolve(message)
              break
            }
          }
        })()
        await subscribed.promise
        const startReply = callViaSandbox(base, 'recording_start', {})
        await wentLive.promise
        mark('live-before-start-returns')
        await rpc.flush({clientId: 'c1', events: fixtureStream(Date.now())})
        mark('flush')
        const started = z
          .object({captureId: z.string()})
          .loose()
          .parse(envelopeResult(await startReply))
        mark('start.execute')
        const stopped = z
          .string()
          .parse(await callViaSandbox(base, 'recording_stop', {captureId: started.captureId, keyframes: 0}))
        mark('stop.execute')
        expect(stopped).toContain('click')
        expect(await wentLive.promise).toEqual({live: true, snapshot: true, flush: true})
        mark('live-event')
        abort.abort()
        await pump.catch(() => {})
        mark('pump')
      } finally {
        await engine.stop()
        mark('engine.stop')
      }
    }, 30_000)
  })
})

describe('flush caps', () => {
  const event = (timestamp: number) => ({type: 3, data: {}, timestamp})

  function flushInput(count: number) {
    return {clientId: 'tab-a', events: Array.from({length: count}, (_, index) => event(index))}
  }

  describe('flush input caps', () => {
    it('accepts a small flush', async () => {
      const router = makeRecorderRouter(runtimeFixture())
      const result = await call(router.flush, flushInput(10), {context: {request: new Request('http://local')}})
      expect(result).toEqual({ok: true})
    })

    it('rejects a flush with more than 5000 events', async () => {
      const router = makeRecorderRouter(runtimeFixture())
      await expect(
        call(router.flush, flushInput(5001), {context: {request: new Request('http://local')}}),
      ).rejects.toThrow()
    })
  })
})

describe('flush transport', () => {
  const api = useRecorderTestApi()

  const BURST_EVENT_BYTES = 900 * 1024
  const BURST_EVENT_COUNT = 6

  function paddedEvent(timestamp: number, bytes: number): RrwebEvent {
    return {type: 3, data: {padding: 'x'.repeat(bytes)}, timestamp}
  }

  function recorderRpc(): RouterClient<RecorderRouter> {
    return makeExtRpcClient<RecorderRouter>(api().apiBase, RECORDER_NAME)
  }

  describe('recorder flush over the extension rpc transport', () => {
    it('splits a multi-megabyte burst into requests the server accepts, and still answers afterwards', async () => {
      const rpc = recorderRpc()
      const sent = {flushes: 0}
      const clientId = 'flush-transport-burst'
      const flusher = createFlusher({
        send: async (events) => {
          sent.flushes += 1
          await rpc.flush({clientId, events})
        },
      })
      try {
        for (let index = 0; index < BURST_EVENT_COUNT; index += 1) {
          flusher.push(paddedEvent(index, BURST_EVENT_BYTES))
        }
        await flusher.flushNow()

        expect(sent.flushes).toBeGreaterThan(1)
        expect(await rpc.config({})).toBeTruthy()
      } finally {
        flusher.dispose()
      }
    }, 60_000)

    it('delivers an event at the client cap and drops one above it', async () => {
      const rpc = recorderRpc()
      const sent = {flushes: 0}
      const clientId = 'flush-transport-over-cap'
      const flusher = createFlusher({
        send: async (events) => {
          sent.flushes += 1
          await rpc.flush({clientId, events})
        },
      })
      try {
        flusher.push(paddedEvent(1, MAX_FLUSH_BYTES + 1024))
        await flusher.flushNow()
        expect(sent.flushes).toBe(0)

        flusher.push(paddedEvent(2, MAX_FLUSH_BYTES - 4096))
        await flusher.flushNow()
        expect(sent.flushes).toBe(1)
        expect(await rpc.config({})).toBeTruthy()
      } finally {
        flusher.dispose()
      }
    }, 60_000)
  })
})

describe('lazy capture', () => {
  const api = useRecorderTestApi()

  const FLUSH_PATH = ['ext', 'recorder', 'flush']

  const FullSnapshotSchema = z.object({type: z.literal(2), data: z.looseObject({node: z.unknown()})})

  describe('lazy capture lifecycle (real browser)', () => {
    it('flushes nothing while idle, captures while a recording is live, and goes quiet after stop', async () => {
      const page = api().page
      const calls = rpcCallCursor(page)
      const flushCount = (): number => calls.startedSince(FLUSH_PATH)

      await addMarker(page)
      await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})
      const idlePullStartedAt = Date.now()
      const idlePull = JSON.stringify(await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0}))
      expect(Date.now() - idlePullStartedAt).toBeLessThan(1000)
      expect(flushCount()).toBe(0)
      expect(idlePull).not.toContain('click')

      const recorderRpc = makeExtRpcClient<RecorderRouter>(api().apiBase, 'recorder')
      const captureBaseline = 0
      const started = z.object({captureId: z.string()}).parse(await api().callTool('recording_start', {}))
      const client: {id?: string} = {}
      await until(
        async () => {
          if (client.id === undefined) {
            const {clients} = await recorderRpc.clients()
            client.id = clients.at(-1)?.id
          }
          if (client.id === undefined) return false
          const appended = await recorderRpc.events({cursor: captureBaseline, clientId: client.id})
          return appended.events.some((event) => FullSnapshotSchema.safeParse(event).success)
        },
        {hangGuardMs: 20_000, intervalMs: 100},
      )
      await addMarker(page)
      const stopped = JSON.stringify(
        await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0}),
      )
      expect(stopped).toContain('click')
      expect(flushCount()).toBeGreaterThan(0)

      await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})
      const settledCount = flushCount()
      await addMarker(page)
      await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})
      expect(flushCount()).toBe(settledCount)
    }, 120_000)

    it('a click issued immediately after recording_start lands in the capture', async () => {
      const started = z.object({captureId: z.string()}).parse(await api().callTool('recording_start', {}))
      await api().page.getByRole('button', {name: 'Add marker'}).click()
      const stopped = JSON.stringify(
        await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0}),
      )
      expect(stopped).toContain('click')
      expect(stopped).toContain('Add marker')
    }, 120_000)
  })
})

describe('live routes', () => {
  const context = {context: {request: new Request('http://local')}}

  describe('live follow routes', () => {
    it('events returns raw deltas after the cursor', async () => {
      const runtime = runtimeFixture()
      runtime.rings.append('c', [{type: 2, data: {node: {}}, timestamp: 1000}])
      const router = makeRecorderRouter(runtime)
      const first = await call(router.window, {clientId: 'c'}, context)
      runtime.rings.append('c', [{type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2000}])
      const delta = await call(router.events, {cursor: first.cursor, clientId: 'c'}, context)
      expect(delta.events).toEqual([{type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2000}])
    })

    it('events after an equal-timestamp append are not swallowed by the cursor', async () => {
      const runtime = runtimeFixture()
      runtime.rings.append('c', [{type: 2, data: {node: {}}, timestamp: 1000}])
      const router = makeRecorderRouter(runtime)
      const first = await call(router.events, {cursor: 0, clientId: 'c'}, context)
      runtime.rings.append('c', [{type: 3, data: {source: 2, type: 2, id: 7}, timestamp: 1000}])
      const delta = await call(router.events, {cursor: first.cursor, clientId: 'c'}, context)
      expect(delta.events).toEqual([{type: 3, data: {source: 2, type: 2, id: 7}, timestamp: 1000}])
    })

    it('window, events, and save pin to an explicit clientId instead of the most recent flusher', async () => {
      const runtime = runtimeFixture()
      runtime.rings.append('mine', [
        {type: 2, data: {node: {}}, timestamp: 1000},
        {type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2000},
      ])
      runtime.rings.append('other', [
        {type: 2, data: {node: {}}, timestamp: 5000},
        {type: 3, data: {source: 2, type: 2, id: 9}, timestamp: 6000},
      ])
      const router = makeRecorderRouter(runtime)
      const pinned = await call(router.window, {clientId: 'mine'}, context)
      expect(pinned.events.map((event) => event.timestamp)).toEqual([1000, 2000])
      const delta = await call(router.events, {cursor: 1, clientId: 'mine'}, context)
      expect(delta.events.map((event) => event.timestamp)).toEqual([2000])
      const saved = await call(router.recordings.save, {clientId: 'mine'}, context)
      if (!('recordingId' in saved)) throw new Error('expected recordingId')
      const fetched = await call(router.recordings.get, {recordingId: saved.recordingId}, context)
      if (!('events' in fetched)) throw new Error('expected events')
      expect((fetched.events ?? []).map((event) => event.timestamp)).toEqual([1000, 2000])
    })

    it('presence toggles the live cadence broadcast', async () => {
      const runtime = runtimeFixture()
      const seen: unknown[] = []
      runtime.control.subscribe((message) => seen.push(message))
      const router = makeRecorderRouter(runtime)
      await call(router.presence, {viewerId: 'viewer-1', live: true}, context)
      await call(router.presence, {viewerId: 'viewer-1', live: false}, context)
      expect(seen).toEqual([{live: true}, {snapshot: true, flush: true}, {live: false}])
    })

    it('renewing an existing viewer lease does not re-request a snapshot', async () => {
      const runtime = runtimeFixture()
      const seen: unknown[] = []
      const router = makeRecorderRouter(runtime)
      await call(router.presence, {viewerId: 'viewer-1', live: true}, context)
      runtime.control.subscribe((message) => seen.push(message))
      await call(router.presence, {viewerId: 'viewer-1', live: true}, context)
      expect(seen).toEqual([])
    })
  })
})

describe('panel empty', () => {
  const api = useRecorderTestApi()

  describe('panel opened before any interaction (real browser)', () => {
    it('recovers from the empty state and starts the live replay without reopening', async () => {
      await api().page.getByRole('tab', {name: 'Recorder'}).click()
      const label = await addMarker(api().page)
      await api().page.getByRole('button', {name: 'Send to agent'}).waitFor({state: 'visible', timeout: 20_000})
      await expectLocator(api().page.frameLocator('iframe').getByText(label, {exact: true}).first()).toBeAttached({
        timeout: 30_000,
      })
      await api().page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
      await api().page.getByRole('slider', {name: 'Timeline'}).waitFor({state: 'visible', timeout: 10_000})
    }, 120_000)
  })
})

describe('content blocker', () => {
  const api = useRecorderTestApi()

  describe('rrweb blocked by a content blocker (real browser)', () => {
    it('keeps the widget running and explains the block in the Recorder tab', async () => {
      const page = api().page
      await page.route(/rrweb/, (route) => route.abort('blockedbyclient'))
      await page.reload({waitUntil: 'domcontentloaded'})
      await page.getByRole('tab', {name: 'Recorder'}).click()
      await expectLocator(page.getByRole('heading', {name: 'Recording is paused by your content blocker'})).toBeVisible(
        {timeout: 30_000},
      )
      await expectLocator(page.getByRole('button', {name: 'Reload page'})).toBeVisible()
      await expectLocator(page.getByRole('button', {name: 'Send to agent'})).toHaveCount(0)
    }, 120_000)
  })
})

describe('slow capture library', () => {
  const api = useRecorderTestApi()

  describe('rrweb outlasts the recording_start deadline (real browser)', () => {
    it('drops the timed out start and still records a later one', async () => {
      const page = api().page
      const rrwebRelease = Promise.withResolvers<void>()
      await page.route(/rrweb/, async (route) => {
        await rrwebRelease.promise
        await route.continue()
      })
      await page.reload({waitUntil: 'domcontentloaded'})
      await page.getByRole('tab', {name: 'Recorder'}).waitFor({state: 'visible', timeout: 30_000})

      const rrwebRequested = page.waitForRequest(/rrweb/)
      const timedOut = JSON.stringify(await api().callTool('recording_start', {}))
      await rrwebRequested
      expect(timedOut).toContain('no page client attached within 5s')

      rrwebRelease.resolve()
      const started = await startLiveCapture(api())

      await addMarker(page)
      const stopped = JSON.stringify(
        await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0}),
      )
      expect(stopped).toContain('Add marker')
    }, 120_000)
  })
})

describe('recorder controls', () => {
  const api = useRecorderTestApi()

  const CONFIG_REQUEST = /\/ext\/recorder\/config/
  const FLUSH_REQUEST = /\/ext\/recorder\/flush/

  function recorderRpc(): RouterClient<RecorderRouter> {
    return makeExtRpcClient<RecorderRouter>(api().apiBase, RECORDER_NAME)
  }

  async function reloadWidget(page: Page): Promise<void> {
    await page.reload({waitUntil: 'domcontentloaded'})
    await page.getByRole('tab', {name: 'Recorder'}).waitFor({state: 'visible', timeout: 30_000})
  }

  function controlStream(messages: RecorderControl[]): string {
    const events = messages.map((message) => `event: message\ndata: ${JSON.stringify({json: message})}\n\n`)
    return `${events.join('')}event: done\ndata: {}\n\n`
  }

  async function expectMarkerRecorded(page: Page): Promise<void> {
    const markerFlush = page.waitForRequest(
      (request) => FLUSH_REQUEST.test(request.url()) && /Marker \d+/.test(request.postData() ?? ''),
      {timeout: 10_000},
    )
    const label = await addMarker(page)
    const flushed = await (await markerFlush).response()
    await flushed?.finished()
    const {clients} = await recorderRpc().clients()
    const clientId = clients.at(-1)?.id
    if (!clientId) throw new Error('no recorder client connected')
    const {events} = await recorderRpc().window({clientId})
    expect(JSON.stringify(events)).toContain(label)
  }

  describe('queued controls (real browser)', () => {
    afterEach(() => api().page.unrouteAll())

    it('finishes the session of a queued stop that a newer start overtook', async () => {
      const page = api().page
      const calls = rpcCallCursor(page)
      await page.route(/\/ext\/recorder\/control/, (route) =>
        route.fulfill({
          contentType: 'text/event-stream',
          body: controlStream([{live: true}, {live: false}, {live: true}]),
        }),
      )
      const configRequests = {seen: 0}
      const freshConfig = page.waitForRequest(
        (request) => {
          if (CONFIG_REQUEST.test(request.url())) configRequests.seen += 1
          return configRequests.seen === 2
        },
        {timeout: 10_000},
      )
      await reloadWidget(page)
      await freshConfig
      await page.waitForRequest(FLUSH_REQUEST, {timeout: 10_000})

      await expectMarkerRecorded(page)
      expect(calls.startedSince(['ext', 'recorder', 'config'])).toBe(2)
    }, 120_000)

    it('logs a control that throws and still applies the next one', async () => {
      const page = api().page
      const rpc = recorderRpc()
      await page.clock.install()
      await reloadWidget(page)
      const started = await startLiveCapture(api())

      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'})
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await page.clock.fastForward(31_000)

      const logged = page.waitForEvent('console', {
        predicate: (message) => message.type() === 'error' && message.text().includes('[conciv] recorder'),
        timeout: 10_000,
      })
      await rpc.presence({viewerId: 'snapshot-while-paused', live: true})
      expect((await logged).text()).toContain('take full snapshot after start recording')

      await page.evaluate(() => {
        Reflect.deleteProperty(document, 'visibilityState')
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0})
      await rpc.presence({viewerId: 'snapshot-while-paused', live: false})

      const restarted = await startLiveCapture(api())
      await expectMarkerRecorded(page)
      await api().callTool('recording_stop', {captureId: restarted.captureId, keyframes: 0})
    }, 120_000)
  })
})

describe('panel store isolation', () => {
  const api = useRecorderTestApi()

  describe('panel replay does not mutate solid stores (real browser)', () => {
    it('keeps rrweb writes off the query-cache events through scrub and return to live', async () => {
      const page = api().page
      const warnings: string[] = []
      page.on('console', (message) => {
        if (message.text().includes('Cannot mutate a Store')) warnings.push(message.text())
      })
      const label = await addMarker(page)
      await page.getByRole('tab', {name: 'Recorder'}).click()
      await page.getByRole('button', {name: 'Send to agent'}).waitFor({state: 'visible', timeout: 20_000})
      await expectLocator(page.frameLocator('iframe').getByText(label, {exact: true}).first()).toBeAttached({
        timeout: 30_000,
      })
      await page.waitForTimeout(1_500)
      await addMarker(page)
      await page.waitForTimeout(1_500)
      await addMarker(page)
      const timeline = page.getByRole('slider', {name: 'Timeline'})
      await timeline.focus()
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowLeft')
      await page.getByRole('button', {name: 'Toggle playback'}).click()
      await page.getByRole('button', {name: 'Go live'}).waitFor({state: 'visible', timeout: 10_000})
      await page.getByRole('button', {name: 'Go live'}).click()
      await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
      await page.waitForTimeout(1_000)
      expect(warnings).toEqual([])
    }, 120_000)
  })
})

describe('panel stream', () => {
  const api = useRecorderTestApi()

  const replayed = (page: Page, text: string) => page.frameLocator('iframe').getByText(text, {exact: true}).first()

  function replayShows(page: Page, text: string): Promise<boolean> {
    return replayed(page, text)
      .count()
      .then((found) => found > 0)
  }

  async function scrubBack(page: Page, presses: number): Promise<void> {
    const timeline = page.getByRole('slider', {name: 'Timeline'})
    await timeline.focus()
    for (let press = 0; press < presses; press += 1) await page.keyboard.press('ArrowLeft')
  }

  async function openPanelStreaming(page: Page): Promise<string> {
    const label = await addMarker(page)
    await page.getByRole('tab', {name: 'Recorder'}).click()
    await page.getByRole('button', {name: 'Send to agent'}).waitFor({state: 'visible', timeout: 20_000})
    await expectLocator(replayed(page, label)).toBeAttached({timeout: 30_000})
    return label
  }

  describe('panel stream replay (real browser)', () => {
    it('streams live by default with a working, accessible controller', async () => {
      const page = api().page
      await openPanelStreaming(page)
      await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
      await page.getByRole('button', {name: 'Toggle playback'}).waitFor({state: 'visible', timeout: 10_000})
      await page.getByRole('button', {name: 'Toggle fullscreen'}).waitFor({state: 'visible', timeout: 10_000})
      await page.getByRole('slider', {name: 'Timeline'}).waitFor({state: 'visible', timeout: 10_000})
      const followed = await addMarker(page)
      await expectLocator(replayed(page, followed)).toBeAttached({timeout: 30_000})
    }, 120_000)

    it('scrubbing back leaves the live edge and Go live returns to it', async () => {
      const page = api().page
      await openPanelStreaming(page)
      await page.waitForTimeout(1_500)
      const late = await addMarker(page)
      await expectLocator(replayed(page, late)).toBeAttached({timeout: 30_000})

      await scrubBack(page, 4)
      await page.getByRole('button', {name: 'Go live'}).waitFor({state: 'visible', timeout: 10_000})
      await expectLocator(replayed(page, late)).not.toBeAttached({timeout: 30_000})

      await page.getByRole('button', {name: 'Go live'}).click()
      await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
      await expectLocator(replayed(page, late)).toBeAttached({timeout: 30_000})
    }, 120_000)

    it('pausing playback detaches from live and playing catches back up', async () => {
      const page = api().page
      await openPanelStreaming(page)
      await page.getByRole('button', {name: 'Toggle playback'}).click()
      await page.getByRole('button', {name: 'Go live'}).waitFor({state: 'visible', timeout: 10_000})

      const missed = await addMarker(page)
      await page.waitForTimeout(2_500)
      expect(await replayShows(page, missed)).toBe(false)

      await page.getByRole('button', {name: 'Toggle playback'}).click()
      await expectLocator(replayed(page, missed)).toBeAttached({timeout: 30_000})
      await page.getByText('LIVE', {exact: true}).waitFor({state: 'visible', timeout: 10_000})
    }, 120_000)
  })
})

describe('recording card', () => {
  const api = useRecorderTestApi()

  async function attachThroughForm(name: string, text: string): Promise<void> {
    const page = api().page
    await page.getByRole('textbox', {name: 'Attachment name'}).fill(name)
    await page.getByRole('textbox', {name: 'Attachment type'}).fill(RECORDER_MIME)
    await page.getByRole('textbox', {name: 'Attachment text'}).fill(text)
    await page.getByRole('button', {name: 'Attach fixture file'}).click()
  }

  describe('recording card in the testkit host (real chips, real store)', () => {
    it('renders the real chip with poster + Play, plays over a real fetch, and shows expired for a dead id', async () => {
      await startLiveCapture(api())
      await addMarker(api().page)
      await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})

      const rpc = makeExtRpcClient<RecorderRouter>(api().apiBase, RECORDER_NAME)
      const {clients} = await rpc.clients()
      const clientId = clients.at(-1)?.id
      if (!clientId) throw new Error('no recorder client connected')
      const saved = await rpc.recordings.save({clientId})
      if (!('recordingId' in saved)) throw new Error(`expected recordingId, got ${JSON.stringify(saved)}`)

      await attachThroughForm(
        'live-rec',
        recordingRefJson({recordingId: saved.recordingId, poster: 'Screen recording · live-poster'}),
      )
      await api().page.getByText('Screen recording · live-poster').waitFor({state: 'visible', timeout: 15_000})
      const play = api().page.getByRole('button', {name: 'Play', exact: true})
      await play.waitFor({state: 'visible', timeout: 15_000})
      await play.click()
      const modal = api().page.getByRole('dialog', {name: 'Screen recording replay'})
      await modal.waitFor({state: 'visible', timeout: 15_000})
      await expectLocator(
        api().page.frameLocator('iframe').getByText('Comment target', {exact: true}).first(),
      ).toBeAttached({timeout: 15_000})
      await modal.getByRole('button', {name: 'Close'}).click()
      await modal.waitFor({state: 'hidden', timeout: 15_000})

      await attachThroughForm(
        'dead-rec',
        recordingRefJson({recordingId: 'gone-recording', poster: 'Screen recording · dead-poster'}),
      )
      await api().page.getByText('Screen recording · dead-poster').waitFor({state: 'visible', timeout: 15_000})
      const deadPlay = api().page.getByRole('button', {name: 'Play', exact: true}).last()
      await deadPlay.waitFor({state: 'visible', timeout: 15_000})
      await deadPlay.click()
      await api()
        .page.getByRole('dialog', {name: 'Screen recording replay'})
        .getByText('Recording expired.')
        .waitFor({state: 'visible', timeout: 15_000})
    }, 120_000)
  })
})

describe('recordings router', () => {
  describe('recordings router', () => {
    it('saves the ring window and round-trips events by id', async () => {
      const runtime = runtimeFixture()
      runtime.rings.append('c', [
        {type: 2, data: {node: {}}, timestamp: 1},
        {type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2},
      ])
      const router = makeRecorderRouter(runtime)
      const saved = await call(
        router.recordings.save,
        {clientId: 'c'},
        {context: {request: new Request('http://local')}},
      )
      if (!('recordingId' in saved)) throw new Error('expected recordingId')
      const fetched = await call(
        router.recordings.get,
        {recordingId: saved.recordingId},
        {context: {request: new Request('http://local')}},
      )
      expect(fetched).toEqual({
        events: [
          {type: 2, data: {node: {}}, timestamp: 1},
          {type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2},
        ],
      })
    })

    it('returns expired for a missing recording', async () => {
      const router = makeRecorderRouter(runtimeFixture())
      const fetched = await call(
        router.recordings.get,
        {recordingId: 'missing-recording'},
        {context: {request: new Request('http://local')}},
      )
      expect(fetched).toEqual({expired: true})
    })

    it('returns a typed error for an unsaveable window', async () => {
      const router = makeRecorderRouter(runtimeFixture())
      const saved = await call(
        router.recordings.save,
        {clientId: 'c'},
        {context: {request: new Request('http://local')}},
      )
      expect(saved).toEqual({error: 'empty'})
    })

    it('rejects a save that names no client instead of silently saving nothing', async () => {
      const router = makeRecorderRouter(runtimeFixture())
      await expect(
        call(router.recordings.save, {clientId: ''}, {context: {request: new Request('http://local')}}),
      ).rejects.toThrow()
    })
  })
})

describe('recordings', () => {
  const snapshot = (timestamp: number) => ({type: 2, data: {node: {}}, timestamp})
  const event = (timestamp: number) => ({type: 3, data: {source: 2, type: 2, id: 1}, timestamp})

  function freshDir(): string {
    return mkdtempSync(join(tmpdir(), 'rec-'))
  }

  function freshStore() {
    return createRecordingStore(freshDir())
  }

  describe('recording store', () => {
    it('saves and gets by id', async () => {
      const store = freshStore()
      const saved = await store.save([snapshot(1), event(2)])
      if (!saved.ok) throw new Error('expected ok')
      expect(await store.get(saved.recordingId)).toEqual([snapshot(1), event(2)])
    })

    it('returns null for a missing id', async () => {
      expect(await freshStore().get('nope')).toBeNull()
    })

    it('rejects an empty recording', async () => {
      expect(await freshStore().save([snapshot(1)])).toEqual({ok: false, reason: 'empty'})
    })

    it('keeps the whole recording when it fits, even with a fresh snapshot at the tail', async () => {
      const store = freshStore()
      const saved = await store.save([snapshot(1), event(2), event(3), snapshot(4)])
      if (!saved.ok) throw new Error(`expected ok, got ${JSON.stringify(saved)}`)
      expect(await store.get(saved.recordingId)).toEqual([snapshot(1), event(2), event(3), snapshot(4)])
    })

    it('trims to the latest snapshot under the size cap', async () => {
      const store = freshStore()
      const bloated = {type: 3, data: {source: 0, blob: 'x'.repeat(17 * 1024 * 1024)}, timestamp: 2}
      const saved = await store.save([snapshot(1), bloated, snapshot(3), event(4)])
      if (!saved.ok) throw new Error('expected ok')
      expect(await store.get(saved.recordingId)).toEqual([snapshot(3), event(4)])
    })

    it('rejects when even the newest snapshot tail exceeds the cap', async () => {
      const store = freshStore()
      const huge = {type: 3, data: {source: 0, blob: 'x'.repeat(17 * 1024 * 1024)}, timestamp: 2}
      expect(await store.save([snapshot(1), huge])).toEqual({ok: false, reason: 'too-large'})
    })

    it('prunes to the newest 50 by id order', async () => {
      const store = freshStore()
      const ids: string[] = []
      for (let index = 0; index < 55; index += 1) {
        const saved = await store.save([snapshot(index), event(index + 1)])
        if (saved.ok) ids.push(saved.recordingId)
      }
      const oldest = ids[0]
      const newest = ids.at(-1)
      if (oldest === undefined || newest === undefined) throw new Error('expected ids')
      expect(await store.get(oldest)).toBeNull()
      expect(await store.get(newest)).not.toBeNull()
    })

    it('returns null for a corrupt recording file instead of throwing', async () => {
      const dir = freshDir()
      const store = createRecordingStore(dir)
      const saved = await store.save([snapshot(1), event(2)])
      if (!saved.ok) throw new Error('expected ok')
      writeFileSync(join(dir, `${saved.recordingId}.json`), '{corrupt', 'utf8')
      expect(await store.get(saved.recordingId)).toBeNull()
    })

    it('reports io-error when the directory is not writable, never throws', async () => {
      const dir = freshDir()
      chmodSync(dir, 0o500)
      const store = createRecordingStore(dir)
      expect(await store.save([snapshot(1), event(2)])).toEqual({ok: false, reason: 'io-error'})
      chmodSync(dir, 0o700)
    })

    it('sweep removes stray tmp files', async () => {
      const dir = freshDir()
      const store = createRecordingStore(dir)
      const saved = await store.save([snapshot(1), event(2)])
      if (!saved.ok) throw new Error('expected ok')
      writeFileSync(join(dir, '123-dead.json.tmp'), 'partial', 'utf8')
      await store.sweep()
      expect(await store.get(saved.recordingId)).not.toBeNull()
      expect(await store.get('123-dead')).toBeNull()
      expect(existsSync(join(dir, '123-dead.json.tmp'))).toBe(false)
    })
  })
})

describe('render', () => {
  const page = {
    id: 1,
    type: 0,
    childNodes: [
      {
        id: 2,
        type: 2,
        tagName: 'html',
        attributes: {},
        childNodes: [
          {
            id: 3,
            type: 2,
            tagName: 'body',
            attributes: {style: 'background: rgb(200, 30, 30)'},
            childNodes: [
              {id: 4, type: 2, tagName: 'h1', attributes: {}, childNodes: [{id: 5, type: 3, textContent: 'Recorded'}]},
            ],
          },
        ],
      },
    ],
  }

  const events: RrwebEvent[] = [
    {type: 4, data: {href: 'http://localhost/app', width: 640, height: 480}, timestamp: 1000},
    {type: 2, data: {node: page, initialOffset: {left: 0, top: 0}}, timestamp: 1001},
    {type: 3, data: {source: 2, type: 2, id: 4}, timestamp: 2000},
  ]

  const state: {renderer?: KeyframeRenderer | null} = {}

  afterAll(async () => state.renderer?.dispose())

  describe('chromium keyframe renderer (IT)', () => {
    it('renders a non-empty PNG at a requested timestamp', async () => {
      state.renderer = await createChromiumRenderer()
      if (!state.renderer)
        throw new Error('chromium unavailable on this machine; run: pnpm exec playwright install chromium')
      const frames = await state.renderer.render(events, [2000])
      expect(frames).toHaveLength(1)
      expect(frames[0]?.ts).toBe(2000)
      const png = Buffer.from(frames[0]?.pngBase64 ?? '', 'base64')
      expect(png.subarray(1, 4).toString()).toBe('PNG')
      expect(png.length).toBeGreaterThan(2000)
    }, 60_000)

    it('returns [] for a stream with no full snapshot', async () => {
      if (!state.renderer) throw new Error('renderer missing')
      const frames = await state.renderer.render([{type: 3, data: {}, timestamp: 1}], [2000])
      expect(frames).toEqual([])
    }, 60_000)
  })
})

describe('runtime', () => {
  const page = pageFixture([buttonFixture(4, 5, 'Old'), buttonFixture(6, 7, 'New')])

  const click = (ts: number, id: number): RrwebEvent => ({type: 3, data: {source: 2, type: 2, id}, timestamp: ts})

  describe('pullWindow', () => {
    it('keeps pre-window events for replay context but clips the action log to the window', async () => {
      const rings = createClientRings({windowMs: 600_000})
      rings.append('a', [{type: 2, data: {node: page}, timestamp: 1000}, click(2000, 4), click(9000, 6)])
      const control = createCaptureControl(rings, () => 0)
      const result = await pullWindow(
        {
          rings,
          control,
          config: {masking: 'none', windowMinutes: 10, console: true},
          useRenderer: async () => null,
          recordings: createRecordingStore(mkdtempSync(join(tmpdir(), 'rec-'))),
        },
        8000,
        10_000,
        0,
      )
      const text = JSON.stringify(result)
      expect(text).toContain('New')
      expect(text).not.toContain('Old')
    })
  })

  describe('renderRecording', () => {
    it('returns a text log part when no renderer is available', async () => {
      const parts = await renderRecording(runtimeFixture(), [{type: 4, data: {href: 'https://x'}, timestamp: 1}], 0)
      expect(parts.some((part) => part.type === 'text')).toBe(true)
      expect(parts.some((part) => part.type === 'image')).toBe(false)
    })
  })
})

describe('send to agent', () => {
  const api = useRecorderTestApi()

  describe('send to agent (real browser, real store)', () => {
    it('saves the recording and attaches the real card chip, not a txt note', async () => {
      await startLiveCapture(api())
      await addMarker(api().page)
      await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})

      await api().page.getByRole('tab', {name: 'Recorder'}).click()
      const send = api().page.getByRole('button', {name: 'Send to agent'})
      await send.waitFor({state: 'visible', timeout: 15_000})
      await send.click()

      await api()
        .page.getByText(/Screen recording · \d+ action/)
        .waitFor({state: 'visible', timeout: 15_000})
      await api().page.getByRole('button', {name: 'Play', exact: true}).waitFor({state: 'visible', timeout: 15_000})
      expect(await api().page.getByRole('note', {name: 'Attachment recording.txt'}).count()).toBe(0)
      expect(await api().page.getByRole('note', {name: 'Attachment Screen recording'}).count()).toBe(0)
    }, 120_000)
  })
})
