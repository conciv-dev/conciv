import {it} from '@effect/vitest'
import {Effect, Exit} from 'effect'
import {HttpClientRequest} from 'effect/http'
import {TestClock} from 'effect/testing'
import {describe, expect} from 'vitest'
import * as SimulationNetwork from '../../src/backend/network.js'

describe('simulation network', () => {
  it.effect('keeps routes and request logs local to each network', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(1_234)
      const first = yield* SimulationNetwork.make([
        SimulationNetwork.json('GET', 'https://example.test/value', {source: 'first'}),
      ])
      const second = yield* SimulationNetwork.make()
      const request = HttpClientRequest.get('https://example.test/value')

      const response = yield* first.client.execute(request)
      expect(yield* response.text).toBe('{"source":"first"}')
      expect(Exit.isFailure(yield* second.client.execute(request).pipe(Effect.exit))).toBe(true)

      expect(yield* first.log()).toEqual([
        {time: 1_234, method: 'GET', url: 'https://example.test/value', matched: true},
      ])
      expect(yield* second.log()).toEqual([
        {time: 1_234, method: 'GET', url: 'https://example.test/value', matched: false},
      ])
    }),
  )
})
