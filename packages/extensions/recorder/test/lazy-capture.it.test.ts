import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {makeExtRpcClient} from '@conciv/extension'
import {until} from '@conciv/harness-testkit/until'
import {rpcCallCursor} from '@conciv/extension-testkit/rpc-counts'
import type {RecorderRouter} from '../src/server.js'
import {useRecorderTestApi} from './helpers/test-api.js'
import {addMarker} from './helpers/fixtures.js'

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
