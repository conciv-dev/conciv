import {describe, expect, it} from 'vitest'
import {computeIdleSpans} from '../src/client/inactivity.js'
import type {RrwebEvent} from '../src/shared/protocol.js'

const snapshot = (ts: number): RrwebEvent => ({type: 2, data: {}, timestamp: ts})
const click = (ts: number): RrwebEvent => ({type: 3, data: {source: 2, type: 2, id: 1}, timestamp: ts})
const mutation = (ts: number): RrwebEvent => ({type: 3, data: {source: 0, adds: []}, timestamp: ts})

describe('computeIdleSpans', () => {
  it('finds the gap between user interactions, ignoring mutation noise', () => {
    const events = [
      snapshot(0),
      click(1000),
      mutation(5000),
      mutation(30_000),
      mutation(60_000),
      mutation(90_000),
      click(120_000),
    ]
    expect(computeIdleSpans(events, 10_000, 1000)).toEqual([{startMs: 2000, endMs: 119_000}])
  })

  it('treats the stretch after the last interaction as idle', () => {
    const events = [snapshot(0), click(1000), mutation(200_000)]
    expect(computeIdleSpans(events, 10_000, 1000)).toEqual([{startMs: 2000, endMs: 199_000}])
  })

  it('returns nothing for continuously active recordings', () => {
    const events = [snapshot(0), click(1000), click(5000), click(9000), click(14_000)]
    expect(computeIdleSpans(events, 10_000, 1000)).toEqual([])
  })

  it('counts scrolls, inputs, and navigations as activity', () => {
    const events = [
      snapshot(0),
      {type: 3, data: {source: 3, id: 1}, timestamp: 20_000} satisfies RrwebEvent,
      {type: 3, data: {source: 5, id: 1, text: 'x'}, timestamp: 25_000} satisfies RrwebEvent,
      {type: 4, data: {href: 'http://x'}, timestamp: 30_000} satisfies RrwebEvent,
    ]
    const spans = computeIdleSpans(events, 10_000, 1000)
    expect(spans).toEqual([{startMs: 1000, endMs: 19_000}])
  })
})
