import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {rpcObserverFor} from '@conciv/extension-testkit/rpc-observer'
import {useRecorderTestApi} from './helpers/test-api.js'
import {addMarker} from './helpers/fixtures.js'

const api = useRecorderTestApi()

const FLUSH_PATH = ['ext', 'recorder', 'flush']

describe('lazy capture lifecycle (real browser)', () => {
  it('flushes nothing while idle, captures while a recording is live, and goes quiet after stop', async () => {
    const page = api().page
    const observer = rpcObserverFor(page)
    const flushCount = (): number => observer.startedCount({path: FLUSH_PATH})

    await addMarker(page)
    await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})
    const idlePullStartedAt = Date.now()
    const idlePull = JSON.stringify(await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0}))
    expect(Date.now() - idlePullStartedAt).toBeLessThan(1000)
    expect(flushCount()).toBe(0)
    expect(idlePull).not.toContain('click')

    const firstFlush = observer.completed({path: FLUSH_PATH, since: observer.mark(), timeout: 20_000})
    const started = z.object({captureId: z.string()}).parse(await api().callTool('recording_start', {}))
    await firstFlush
    await addMarker(page)
    const stopped = JSON.stringify(await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0}))
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
    const stopped = JSON.stringify(await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0}))
    expect(stopped).toContain('click')
    expect(stopped).toContain('Add marker')
  }, 120_000)
})
