import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {start, type Engine} from '@conciv/core'
import {makeExtRpcClient, type AnyExtension} from '@conciv/extension'
import recorderExtension, {type RecorderRouter} from '../src/server.js'
import type {RrwebEvent} from '../src/shared/protocol.js'

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
          attributes: {},
          childNodes: [
            {id: 4, type: 2, tagName: 'button', attributes: {}, childNodes: [{id: 5, type: 3, textContent: 'Buy'}]},
          ],
        },
      ],
    },
  ],
}

function fixtureStream(base: number): RrwebEvent[] {
  return [
    {type: 4, data: {href: 'http://localhost/app', width: 800, height: 600}, timestamp: base},
    {type: 2, data: {node: page}, timestamp: base + 1},
    {type: 3, data: {source: 2, type: 2, id: 4}, timestamp: base + 2},
  ]
}

describe('recorder extension booted in the real engine (IT)', () => {
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

  it('serves parsed config defaults on the config route', async () => {
    const {base, engine} = await boot()
    try {
      const config = await recorderClient(base).config(undefined)
      expect(config).toEqual({masking: 'none', windowMinutes: 10, console: true})
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('registers the three tools on /api/mcp and recording_pull returns the action log', async () => {
    const {base, engine} = await boot()
    try {
      await recorderClient(base).flush({clientId: 'c1', events: fixtureStream(Date.now() - 2000)})
      const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
      const tools = await mcp.tools()
      const names = tools.map((tool) => tool.name)
      expect(names).toEqual(expect.arrayContaining(['recording_start', 'recording_stop', 'recording_pull']))
      const pull = tools.find((tool) => tool.name === 'recording_pull')
      if (!pull?.execute) throw new Error('recording_pull not registered')
      const raw = String(await pull.execute({secondsBack: 60, keyframes: 0}))
      expect(raw).toContain('click')
      expect(raw).toContain('Buy')
      await mcp.close()
    } finally {
      await engine.stop()
    }
  }, 30_000)

  it('start/stop capture emits control events to subscribers and returns the marked window', async () => {
    const {base, engine} = await boot()
    try {
      const rpc = recorderClient(base)
      const abort = new AbortController()
      const control = await rpc.control(undefined, {signal: abort.signal})
      const seen: unknown[] = []
      const pump = (async () => {
        for await (const message of control) seen.push(message)
      })()
      const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
      const tools = await mcp.tools()
      const startRecording = tools.find((tool) => tool.name === 'recording_start')
      const stopRecording = tools.find((tool) => tool.name === 'recording_stop')
      if (!startRecording?.execute || !stopRecording?.execute) throw new Error('tools missing')
      const started = z.object({captureId: z.string()}).parse(JSON.parse(String(await startRecording.execute({}))))
      await rpc.flush({clientId: 'c1', events: fixtureStream(Date.now())})
      const stopped = String(await stopRecording.execute({captureId: started.captureId, keyframes: 0}))
      expect(stopped).toContain('click')
      expect(seen).toContainEqual({live: true})
      abort.abort()
      await pump.catch(() => {})
      await mcp.close()
    } finally {
      await engine.stop()
    }
  }, 30_000)
})
