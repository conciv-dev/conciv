import {describe, expect, it} from 'vitest'
import {call} from '@orpc/server'
import {makeRecorderRouter} from '../src/server.js'
import {runtimeFixture} from './helpers/runtime-fixture.js'

const context = {context: {request: new Request('http://local')}}

describe('live follow routes', () => {
  it('events returns raw deltas after the cursor', async () => {
    const runtime = runtimeFixture()
    runtime.rings.append('c', [{type: 2, data: {node: {}}, timestamp: 1000}])
    const router = makeRecorderRouter(runtime)
    const first = await call(router.window, {}, context)
    runtime.rings.append('c', [{type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2000}])
    const delta = await call(router.events, {cursor: first.cursor}, context)
    expect(delta.events).toEqual([{type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2000}])
  })

  it('events after an equal-timestamp append are not swallowed by the cursor', async () => {
    const runtime = runtimeFixture()
    runtime.rings.append('c', [{type: 2, data: {node: {}}, timestamp: 1000}])
    const router = makeRecorderRouter(runtime)
    const first = await call(router.events, {cursor: 0}, context)
    runtime.rings.append('c', [{type: 3, data: {source: 2, type: 2, id: 7}, timestamp: 1000}])
    const delta = await call(router.events, {cursor: first.cursor}, context)
    expect(delta.events).toEqual([{type: 3, data: {source: 2, type: 2, id: 7}, timestamp: 1000}])
  })

  it('window, events, and save pin to an explicit clientId instead of the most recent flusher', async () => {
    const runtime = runtimeFixture()
    runtime.rings.append('mine', [
      {type: 2, data: {node: {}}, timestamp: 1000},
      {type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2000},
    ])
    runtime.rings.append('other', [
      {type: 2, data: {node: {}}, timestamp: 5000},
      {type: 3, data: {source: 2, type: 2, id: 9}, timestamp: 6000},
    ])
    const router = makeRecorderRouter(runtime)
    const pinned = await call(router.window, {clientId: 'mine'}, context)
    expect(pinned.events.map((event) => event.timestamp)).toEqual([1000, 2000])
    const delta = await call(router.events, {cursor: 1, clientId: 'mine'}, context)
    expect(delta.events.map((event) => event.timestamp)).toEqual([2000])
    const saved = await call(router.recordings.save, {clientId: 'mine'}, context)
    if (!('recordingId' in saved)) throw new Error('expected recordingId')
    const fetched = await call(router.recordings.get, {recordingId: saved.recordingId}, context)
    if (!('events' in fetched)) throw new Error('expected events')
    expect((fetched.events ?? []).map((event) => event.timestamp)).toEqual([1000, 2000])
  })

  it('presence toggles the live cadence broadcast', async () => {
    const runtime = runtimeFixture()
    const seen: unknown[] = []
    runtime.control.subscribe((message) => seen.push(message))
    const router = makeRecorderRouter(runtime)
    await call(router.presence, {viewerId: 'viewer-1', live: true}, context)
    await call(router.presence, {viewerId: 'viewer-1', live: false}, context)
    expect(seen).toEqual([{live: true}, {snapshot: true, flush: true}, {live: false}])
  })

  it('renewing an existing viewer lease does not re-request a snapshot', async () => {
    const runtime = runtimeFixture()
    const seen: unknown[] = []
    const router = makeRecorderRouter(runtime)
    await call(router.presence, {viewerId: 'viewer-1', live: true}, context)
    runtime.control.subscribe((message) => seen.push(message))
    await call(router.presence, {viewerId: 'viewer-1', live: true}, context)
    expect(seen).toEqual([])
  })
})
