import {describe, expect, it} from 'vitest'
import {call} from '@orpc/server'
import {makeRecorderRouter} from '../src/server.js'
import {runtimeFixture} from './helpers/runtime-fixture.js'

const event = (timestamp: number) => ({type: 3, data: {}, timestamp})

function flushInput(count: number) {
  return {clientId: 'tab-a', events: Array.from({length: count}, (_, index) => event(index))}
}

describe('flush input caps', () => {
  it('accepts a small flush', async () => {
    const router = makeRecorderRouter(runtimeFixture())
    const result = await call(router.flush, flushInput(10), {context: {request: new Request('http://local')}})
    expect(result).toEqual({ok: true})
  })

  it('rejects a flush with more than 5000 events', async () => {
    const router = makeRecorderRouter(runtimeFixture())
    await expect(
      call(router.flush, flushInput(5001), {context: {request: new Request('http://local')}}),
    ).rejects.toThrow()
  })
})
