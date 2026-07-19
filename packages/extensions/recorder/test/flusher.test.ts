import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createFlusher} from '../src/client/flusher.js'
import {MAX_FLUSH_BYTES, jsonByteLength, type RrwebEvent} from '../src/shared/protocol.js'

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

  it('discards an event no single-event request could carry, so it cannot block the queue', async () => {
    const padding = MAX_FLUSH_BYTES - jsonByteLength({type: 3, data: {blob: ''}, timestamp: 1})
    const atCap: RrwebEvent = {type: 3, data: {blob: 'x'.repeat(padding)}, timestamp: 1}
    expect(jsonByteLength(atCap)).toBe(MAX_FLUSH_BYTES)
    expect(jsonByteLength([atCap])).toBeGreaterThan(MAX_FLUSH_BYTES)
    const attempted: number[] = []
    const sent: RrwebEvent[][] = []
    const flusher = createFlusher({
      send: async (events) => {
        attempted.push(jsonByteLength(events))
        if (jsonByteLength(events) > MAX_FLUSH_BYTES) throw new Error('payload too large')
        sent.push(events)
      },
      idleMs: 5000,
      liveMs: 200,
    })
    flusher.push(atCap)
    await vi.advanceTimersByTimeAsync(5000)
    expect(attempted).toEqual([])
    flusher.push(event(2))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sent).toEqual([[event(2)]])
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

  it('drops oldest events past the byte cap but keeps the newest snapshot onward', async () => {
    const bigEvent = (timestamp: number, bytes: number, type = 3): RrwebEvent => ({
      type,
      data: {blob: 'x'.repeat(bytes)},
      timestamp,
    })
    const sent: unknown[][] = []
    const flusher = createFlusher({send: async (events) => void sent.push(events)})
    flusher.push(bigEvent(1, 5 * 1024 * 1024))
    flusher.push(bigEvent(2, 1024, 2))
    flusher.push(bigEvent(3, 5 * 1024 * 1024))
    await flusher.flushNow()
    const flat = sent.flat()
    expect(flat.some((entry) => (entry as {timestamp: number}).timestamp === 1)).toBe(false)
    expect(flat.some((entry) => (entry as {timestamp: number}).timestamp === 2)).toBe(true)
    expect(flat.some((entry) => (entry as {timestamp: number}).timestamp === 3)).toBe(true)
    flusher.dispose()
  })

  it('chunks a large queue into multiple sends', async () => {
    const bigEvent = (timestamp: number, bytes: number): RrwebEvent => ({
      type: 3,
      data: {blob: 'x'.repeat(bytes)},
      timestamp,
    })
    const sizes: number[] = []
    const flusher = createFlusher({send: async (events) => void sizes.push(events.length)})
    for (let index = 0; index < 6; index += 1) flusher.push(bigEvent(index, 400 * 1024))
    await flusher.flushNow()
    expect(sizes.length).toBeGreaterThan(1)
    flusher.dispose()
  })

  it('backs off after a failed send and recovers', async () => {
    const outcomes = [Promise.reject(new Error('down')), Promise.resolve()]
    for (const outcome of outcomes) outcome.catch(() => {})
    const attempts: number[] = []
    const flusher = createFlusher({
      send: (events) => {
        attempts.push(events.length)
        return outcomes.shift() ?? Promise.resolve()
      },
    })
    flusher.push(event(1))
    await flusher.flushNow().catch(() => {})
    expect(attempts.length).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(attempts.length).toBe(2)
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
