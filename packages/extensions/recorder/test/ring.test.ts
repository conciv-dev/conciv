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
    const kept = ring.since(0).map((event) => event.timestamp)
    expect(kept.length).toBeLessThan(3)
    expect(kept.at(-1)).toBe(3000)
  })

  it('anchors at the next snapshot when none precedes fromTs, instead of returning everything', () => {
    const ring = createEventRing({windowMs: 600_000})
    ring.append('c', [incremental(1), incremental(2), snapshot(5), incremental(6)])
    expect(ring.window({fromTs: 3})).toEqual([snapshot(5), incremental(6)])
  })

  it('returns empty when no snapshot exists at all for a bounded window', () => {
    const ring = createEventRing({windowMs: 600_000})
    ring.append('c', [incremental(1), incremental(2)])
    expect(ring.window({fromTs: 3})).toEqual([])
  })

  it('an unbounded window drops leading pre-snapshot events so replay always starts reconstructable', () => {
    const ring = createEventRing({windowMs: 600_000})
    ring.append('c', [incremental(1000), incremental(2000), snapshot(3000), incremental(4000)])
    expect(ring.window()).toEqual([snapshot(3000), incremental(4000)])
  })

  it('since returns raw events strictly after the cursor', () => {
    const ring = createEventRing({windowMs: 600_000})
    ring.append('a', [snapshot(1000), incremental(2000), incremental(3000)])
    expect(ring.since(2)).toEqual([incremental(3000)])
    expect(ring.since(0)).toEqual([snapshot(1000), incremental(2000), incremental(3000)])
    expect(ring.since(ring.head())).toEqual([])
  })

  it('distinguishes events sharing a timestamp so none are lost across pulls', () => {
    const ring = createEventRing({windowMs: 600_000})
    ring.append('a', [snapshot(1000)])
    const cursor = ring.head()
    ring.append('a', [incremental(1000)])
    expect(ring.since(cursor)).toEqual([incremental(1000)])
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
