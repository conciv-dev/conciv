import {afterAll, describe, expect, it} from 'vitest'
import {call} from '@orpc/server'
import {makeRecorderRouter} from '../src/server.js'
import {createChromiumRenderer, type KeyframeRenderer} from '../src/server/render.js'
import type {RrwebEvent} from '../src/shared/protocol.js'
import {runtimeFixture} from './helpers/runtime-fixture.js'
import {buttonFixture, pageFixture} from './fixtures/page.js'

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
