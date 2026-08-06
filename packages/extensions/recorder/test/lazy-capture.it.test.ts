import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {useRecorderTestApi} from './helpers/test-api.js'
import {addMarker} from './helpers/fixtures.js'

const api = useRecorderTestApi()

const FLUSH_PATH = '/rpc/ext/recorder/flush'

describe('lazy capture lifecycle (real browser)', () => {
  it('flushes nothing while idle, captures while a recording is live, and goes quiet after stop', async () => {
    const page = api().page
    let flushCount = 0
    page.on('request', (request) => {
      if (request.url().includes(FLUSH_PATH)) flushCount += 1
    })

    await addMarker(page)
    const idlePull = JSON.stringify(await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0}))
    expect(flushCount).toBe(0)
    expect(idlePull).not.toContain('click')

    const firstFlush = page.waitForRequest((request) => request.url().includes(FLUSH_PATH), {timeout: 20_000})
    const started = z.object({captureId: z.string()}).parse(await api().callTool('recording_start', {}))
    await firstFlush
    await addMarker(page)
    const stopped = JSON.stringify(await api().callTool('recording_stop', {captureId: started.captureId, keyframes: 0}))
    expect(stopped).toContain('click')
    expect(flushCount).toBeGreaterThan(0)

    await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})
    const settledCount = flushCount
    await addMarker(page)
    await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})
    expect(flushCount).toBe(settledCount)
  }, 120_000)
})
