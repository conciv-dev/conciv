import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {start, type Engine} from '@conciv/core'
import {makeExtRpcClient, type AnyExtension} from '@conciv/extension'
import recorderExtension, {type RecorderRouter} from '../src/server.js'
import type {RrwebEvent} from '../src/shared/protocol.js'
import {buttonFixture, pageFixture} from './fixtures/page.js'

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
  const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
  try {
    const tools = await mcp.tools()
    expect(tools.map((tool) => tool.name)).toEqual(['execute_typescript'])
    const execute = tools[0]
    if (!execute?.execute) throw new Error('execute_typescript not on /api/mcp')
    const typescriptCode = [
      `const found = await external_catalog({name: ${JSON.stringify(name)}})`,
      `return await globalThis[found.call](${JSON.stringify(input)})`,
    ].join('\n')
    return await execute.execute({typescriptCode})
  } finally {
    await mcp.close()
  }
}

async function runSandboxCode(base: string, typescriptCode: string): Promise<unknown> {
  const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
  try {
    const execute = (await mcp.tools()).find((tool) => tool.name === 'execute_typescript')
    if (!execute?.execute) throw new Error('execute_typescript not on /api/mcp')
    return await execute.execute({typescriptCode})
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
      const {events} = await rpc.window({})
      expect(events.length).toBe(3)
      const {entries} = await rpc.log({})
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
      const pump = (async () => {
        for await (const message of control) {
          if (sawMessage([message], {snapshot: true, flush: true})) resnapshot.resolve(message)
        }
      })()
      await rpc.reset(undefined)
      const {events} = await rpc.window({})
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

  it('exposes one execute tool on /api/mcp and recording_pull returns the action log as text', async () => {
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

  it('the sandbox catalog carries the recorder declaration: summary, category and output schema', async () => {
    const {base, engine} = await boot()
    try {
      const listed = z
        .object({tools: z.array(z.object({name: z.string(), summary: z.string(), category: z.string()}).loose())})
        .loose()
        .parse(envelopeResult(await runSandboxCode(base, "return await external_catalog({search: 'recording_pull'})")))
      const entry = listed.tools.find((tool) => tool.name === 'recording_pull')
      expect(entry?.category).toBe('recorder')
      expect(entry?.summary.toLowerCase()).toContain('recording')
      const detail = z
        .object({output: z.unknown()})
        .loose()
        .parse(envelopeResult(await runSandboxCode(base, "return await external_catalog({name: 'recording_pull'})")))
      expect(detail.output).toBeDefined()
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
      const pump = (async () => {
        for await (const message of control) {
          if (sawMessage([message], {live: true, snapshot: true, flush: true})) {
            wentLive.resolve(message)
            break
          }
        }
      })()
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
