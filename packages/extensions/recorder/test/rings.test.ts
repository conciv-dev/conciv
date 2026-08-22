import {describe, expect, it} from 'vitest'
import {createClientRings} from '../src/server/rings.js'

const event = (timestamp: number) => ({type: 2, data: {node: {}}, timestamp})

describe('per-client rings', () => {
  it('answers only for the client the reader names', () => {
    const rings = createClientRings({windowMs: 60_000})
    rings.append('tab-a', [event(1)])
    rings.append('tab-b', [event(2)])
    expect(rings.window({}, 'tab-a')).toEqual([event(1)])
    expect(rings.window({}, 'tab-b')).toEqual([event(2)])
    rings.append('tab-a', [event(3)])
    expect(rings.window({}, 'tab-a')).toEqual([event(1), event(3)])
    expect(rings.window({}, 'tab-b')).toEqual([event(2)])
  })

  it('never leaks a second client writes into the first client reads', () => {
    const rings = createClientRings({windowMs: 60_000})
    rings.append('first', [event(1)])
    const held = rings.head('first')
    rings.append('second', [event(2), event(3)])
    expect(rings.since(held, 'first')).toEqual([])
    expect(rings.window({}, 'first')).toEqual([event(1)])
    expect(rings.head('first')).toBe(held)
    expect(rings.since(held, 'second')).toEqual([event(2), event(3)])
  })

  it('reads for a client that never wrote come back empty instead of borrowing another ring', () => {
    const rings = createClientRings({windowMs: 60_000})
    rings.append('tab-a', [event(1)])
    expect(rings.window({}, 'unknown-tab')).toEqual([])
    expect(rings.since(0, 'unknown-tab')).toEqual([])
    expect(rings.head('unknown-tab')).toBe(0)
  })

  it('lists connected clients ordered from least to most recently written, each with a lastSeen', () => {
    const rings = createClientRings({windowMs: 60_000})
    expect(rings.clients()).toEqual([])
    rings.append('tab-a', [event(1)])
    const [afterA] = rings.clients()
    expect(afterA).toMatchObject({id: 'tab-a'})
    expect(typeof afterA?.lastSeen).toBe('number')
    rings.append('tab-b', [event(2)])
    expect(rings.clients().map((client) => client.id)).toEqual(['tab-a', 'tab-b'])
  })

  it('since follows the cursor of the client it is asked about', () => {
    const rings = createClientRings({windowMs: 60_000})
    rings.append('tab-a', [event(1), event(2)])
    rings.append('tab-b', [event(5)])
    expect(rings.since(0, 'tab-b')).toEqual([event(5)])
    rings.append('tab-a', [event(7)])
    expect(rings.since(1, 'tab-a')).toEqual([event(2), event(7)])
  })

  it('a recreated client ring keeps issuing cursors above any cursor a viewer still holds', () => {
    const rings = createClientRings({windowMs: 60_000})
    rings.append('watched', [event(1)])
    const held = rings.head('watched')
    for (let index = 0; index < 12; index += 1) rings.append(`tab-${index}`, [event(index + 2)])
    expect(rings.window({}, 'watched')).toEqual([])
    rings.append('watched', [event(99)])
    expect(rings.since(held, 'watched')).toEqual([event(99)])
  })

  it('evicts the least recently used client ring once the count budget is exceeded', () => {
    const rings = createClientRings({windowMs: 60_000})
    for (let index = 0; index < 12; index += 1) rings.append(`tab-${index}`, [event(index + 1)])
    expect(rings.window({}, 'tab-0')).toEqual([])
    expect(rings.window({}, 'tab-11')).toEqual([event(12)])
  })

  it('keeps the append cursor rising across clients and across eviction', () => {
    const rings = createClientRings({windowMs: 60_000})
    expect(rings.appendCursor()).toBe(0)
    rings.append('tab-a', [event(1)])
    const afterFirst = rings.appendCursor()
    expect(afterFirst).toBeGreaterThan(0)
    for (let index = 0; index < 12; index += 1) rings.append(`tab-${index}`, [event(index + 2)])
    expect(rings.appendCursor()).toBeGreaterThan(afterFirst)
  })

  it('aggregates onAppend across clients', () => {
    const rings = createClientRings({windowMs: 60_000})
    let notified = 0
    rings.onAppend(() => {
      notified += 1
    })
    rings.append('a', [event(5)])
    rings.append('b', [event(9)])
    expect(notified).toBe(2)
  })
})
