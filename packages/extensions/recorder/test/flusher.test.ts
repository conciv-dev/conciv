import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createFlusher} from '../src/client/flusher.js'
import type {RrwebEvent} from '../src/shared/protocol.js'

const event = (ts: number): RrwebEvent => ({type: 3, data: {}, timestamp: ts})

describe('createFlusher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('batches pushes and sends on the idle cadence', async () => {
    const sent: RrwebEvent[][] = []
    const flusher = createFlusher({send: async (events) => void sent.push(events), idleMs: 5000, liveMs: 200})
    flusher.push(event(1))
    flusher.push(event(2))
    expect(sent).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(5000)
    expect(sent).toEqual([[event(1), event(2)]])
    flusher.dispose()
  })

  it('switches to the live cadence on setLive(true)', async () => {
    const sent: RrwebEvent[][] = []
    const flusher = createFlusher({send: async (events) => void sent.push(events), idleMs: 5000, liveMs: 200})
    flusher.setLive(true)
    flusher.push(event(1))
    await vi.advanceTimersByTimeAsync(200)
    expect(sent).toEqual([[event(1)]])
    flusher.dispose()
  })

  it('flushNow drains immediately and skips empty sends', async () => {
    const sent: RrwebEvent[][] = []
    const flusher = createFlusher({send: async (events) => void sent.push(events)})
    await flusher.flushNow()
    expect(sent).toHaveLength(0)
    flusher.push(event(1))
    await flusher.flushNow()
    expect(sent).toEqual([[event(1)]])
    flusher.dispose()
  })

  it('requeues the batch when send rejects and retries on the next tick', async () => {
    let fail = true
    const sent: RrwebEvent[][] = []
    const flusher = createFlusher({
      send: async (events) => {
        if (fail) throw new Error('offline')
        sent.push(events)
      },
      idleMs: 1000,
      liveMs: 200,
    })
    flusher.push(event(1))
    await vi.advanceTimersByTimeAsync(1000)
    expect(sent).toHaveLength(0)
    fail = false
    await vi.advanceTimersByTimeAsync(1000)
    expect(sent).toEqual([[event(1)]])
    flusher.dispose()
  })
})
