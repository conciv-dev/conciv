import {describe, expect, it} from 'vitest'
import {call} from '@orpc/server'
import {makeRecorderRouter} from '../src/server.js'
import {runtimeFixture} from './helpers/runtime-fixture.js'

describe('recordings router', () => {
  it('saves the ring window and round-trips events by id', async () => {
    const runtime = runtimeFixture()
    runtime.rings.append('c', [
      {type: 2, data: {node: {}}, timestamp: 1},
      {type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2},
    ])
    const router = makeRecorderRouter(runtime)
    const saved = await call(router.recordings.save, {}, {context: {request: new Request('http://local')}})
    if (!('recordingId' in saved)) throw new Error('expected recordingId')
    const fetched = await call(
      router.recordings.get,
      {recordingId: saved.recordingId},
      {context: {request: new Request('http://local')}},
    )
    expect(fetched).toEqual({
      events: [
        {type: 2, data: {node: {}}, timestamp: 1},
        {type: 3, data: {source: 2, type: 2, id: 1}, timestamp: 2},
      ],
    })
  })

  it('returns expired for a missing recording', async () => {
    const router = makeRecorderRouter(runtimeFixture())
    const fetched = await call(
      router.recordings.get,
      {recordingId: 'missing-recording'},
      {context: {request: new Request('http://local')}},
    )
    expect(fetched).toEqual({expired: true})
  })

  it('returns a typed error for an unsaveable window', async () => {
    const router = makeRecorderRouter(runtimeFixture())
    const saved = await call(router.recordings.save, {}, {context: {request: new Request('http://local')}})
    expect(saved).toEqual({error: 'empty'})
  })
})
