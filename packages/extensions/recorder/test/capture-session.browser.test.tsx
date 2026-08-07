import {afterEach, describe, expect, it, vi} from 'vitest'
import type {RecorderConfig, RrwebEvent} from '../src/shared/protocol.js'
import {createCaptureSession} from '../src/client/capture-session.js'

const config: RecorderConfig = {masking: 'none', windowMinutes: 10, console: false}

const settle = async (): Promise<void> => {
  for (let step = 0; step < 8; step += 1) await Promise.resolve()
}

const setVisibility = (state: DocumentVisibilityState): void => {
  Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => state})
  document.dispatchEvent(new Event('visibilitychange'))
}

const snapshotCount = (batches: RrwebEvent[][]): number => batches.flat().filter((event) => event.type === 2).length

describe('createCaptureSession resume race', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState')
    vi.useRealTimers()
  })

  it('a stop during a pending resume never re-attaches the stopped recorder', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    let releaseConfig: (value: RecorderConfig) => void = () => {}
    const sentByStopped: RrwebEvent[][] = []
    const stoppedSession = createCaptureSession({
      config,
      reloadConfig: () =>
        new Promise((resolve) => {
          releaseConfig = resolve
        }),
      send: async (events) => {
        sentByStopped.push(events)
      },
      onFailed: () => {},
    })
    setVisibility('hidden')
    vi.advanceTimersByTime(30_001)
    setVisibility('visible')
    await stoppedSession.finish()
    const flushesAfterFinish = sentByStopped.length

    const sentByNext: RrwebEvent[][] = []
    const nextSession = createCaptureSession({
      config,
      reloadConfig: () => Promise.resolve(config),
      send: async (events) => {
        sentByNext.push(events)
      },
      onFailed: () => {},
    })
    await nextSession.flushNow()
    const snapshotsBefore = snapshotCount(sentByNext)

    releaseConfig(config)
    await settle()

    nextSession.takeSnapshot()
    await nextSession.flushNow()
    expect(snapshotCount(sentByNext)).toBeGreaterThan(snapshotsBefore)
    expect(sentByStopped.length).toBe(flushesAfterFinish)
    await nextSession.finish()
  })

  it('a resume with no interleaved stop re-attaches the recorder', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    const sent: RrwebEvent[][] = []
    const session = createCaptureSession({
      config,
      reloadConfig: () => Promise.resolve(config),
      send: async (events) => {
        sent.push(events)
      },
      onFailed: () => {},
    })
    setVisibility('hidden')
    vi.advanceTimersByTime(30_001)
    setVisibility('visible')
    await settle()
    await session.flushNow()
    const snapshotsBefore = snapshotCount(sent)
    session.takeSnapshot()
    await session.flushNow()
    expect(snapshotCount(sent)).toBeGreaterThan(snapshotsBefore)
    await session.finish()
  })
})
