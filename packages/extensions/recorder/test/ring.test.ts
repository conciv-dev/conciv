import {describe, expect, it} from 'vitest'
import {createEventRing} from '../src/server/ring.js'
import type {RrwebEvent} from '../src/shared/protocol.js'

const snapshot = (ts: number): RrwebEvent => ({type: 2, data: {}, timestamp: ts})
const incremental = (ts: number): RrwebEvent => ({type: 3, data: {source: 2, type: 2, id: 1}, timestamp: ts})

describe('createEventRing', () => {
  it('returns appended events in timestamp order across clients', () => {
    const ring = createEventRing({windowMs: 60_000})
    ring.append('a', [snapshot(1000), incremental(3000)])
    ring.append('b', [incremental(2000)])
    expect(ring.window().map((event) => event.timestamp)).toEqual([1000, 2000, 3000])
    expect(ring.lastTs()).toBe(3000)
  })

  it('evicts events older than windowMs relative to the newest event', () => {
    const ring = createEventRing({windowMs: 5000})
    ring.append('a', [snapshot(1000), incremental(2000)])
    ring.append('a', [snapshot(7500), incremental(8000)])
    expect(ring.window().map((event) => event.timestamp)).toEqual([7500, 8000])
  })

  it('window({fromTs}) extends back to the nearest full snapshot before fromTs', () => {
    const ring = createEventRing({windowMs: 600_000})
    ring.append('a', [snapshot(1000), incremental(2000), snapshot(5000), incremental(6000), incremental(9000)])
    expect(ring.window({fromTs: 8000}).map((event) => event.timestamp)).toEqual([5000, 6000, 9000])
  })

  it('window({fromTs, toTs}) clips the tail', () => {
    const ring = createEventRing({windowMs: 600_000})
    ring.append('a', [snapshot(1000), incremental(2000), incremental(3000)])
    expect(ring.window({fromTs: 1500, toTs: 2500}).map((event) => event.timestamp)).toEqual([1000, 2000])
  })

  it('evicts oldest events beyond maxBytes', () => {
    const ring = createEventRing({windowMs: 600_000, maxBytes: 200})
    const fat = (ts: number): RrwebEvent => ({type: 3, data: {blob: 'x'.repeat(120)}, timestamp: ts})
    ring.append('a', [fat(1000), fat(2000), fat(3000)])
    const kept = ring.window().map((event) => event.timestamp)
    expect(kept.length).toBeLessThan(3)
    expect(kept.at(-1)).toBe(3000)
  })

  it('clear empties the ring', () => {
    const ring = createEventRing({windowMs: 60_000})
    ring.append('a', [snapshot(1000), incremental(2000)])
    ring.clear()
    expect(ring.window()).toEqual([])
    expect(ring.lastTs()).toBe(0)
  })

  it('notifies onAppend listeners with the new lastTs', () => {
    const ring = createEventRing({windowMs: 60_000})
    const seen: number[] = []
    const off = ring.onAppend((ts) => seen.push(ts))
    ring.append('a', [snapshot(1000)])
    off()
    ring.append('a', [incremental(2000)])
    expect(seen).toEqual([1000])
  })
})
