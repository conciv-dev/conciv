import {describe, expect, it} from 'vitest'
import {createClientRings} from '../src/server/rings.js'

const event = (timestamp: number) => ({type: 3, data: {}, timestamp})

describe('per-client rings', () => {
  it('separates clients and defaults to the most recently active', () => {
    const rings = createClientRings({windowMs: 60_000})
    rings.append('tab-a', [event(1)])
    rings.append('tab-b', [event(2)])
    expect(rings.window()).toEqual([event(2)])
    expect(rings.window({}, 'tab-a')).toEqual([event(1)])
    rings.append('tab-a', [event(3)])
    expect(rings.window()).toEqual([event(1), event(3)])
  })

  it('aggregates onAppend across clients', () => {
    const rings = createClientRings({windowMs: 60_000})
    const seen: number[] = []
    rings.onAppend((lastTs) => seen.push(lastTs))
    rings.append('a', [event(5)])
    rings.append('b', [event(9)])
    expect(seen).toEqual([5, 9])
  })
})
