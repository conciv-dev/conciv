import {describe, expect, it} from 'vitest'
import {call} from '@orpc/server'
import {makeRecorderRouter} from '../src/server.js'
import {runtimeFixture} from './helpers/runtime-fixture.js'

const context = {context: {request: new Request('http://local')}}

describe('live follow routes', () => {
  it('events returns raw deltas after the cursor', async () => {
    const runtime = runtimeFixture()
    runtime.rings.append('c', [
      {type: 2, data: {node: {}}, timestamp: 1000},
      {type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2000},
    ])
    const router = makeRecorderRouter(runtime)
    const delta = await call(router.events, {sinceTs: 1000}, context)
    expect(delta).toEqual({events: [{type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2000}]})
  })

  it('presence toggles the live cadence broadcast', async () => {
    const runtime = runtimeFixture()
    const seen: unknown[] = []
    runtime.control.subscribe((message) => seen.push(message))
    const router = makeRecorderRouter(runtime)
    await call(router.presence, {live: true}, context)
    await call(router.presence, {live: false}, context)
    expect(seen).toEqual([{live: true}, {snapshot: true, flush: true}, {live: false}])
  })
})
