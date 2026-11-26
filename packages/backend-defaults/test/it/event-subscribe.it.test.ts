import {describe, expect} from 'vitest'
import {test} from '../utils/engine-test.js'

describe('event feed', () => {
  test('a subscriber hears the heartbeat while nothing else happens', async ({createEngine}) => {
    const engine = await createEngine({}, {timeouts: {eventHeartbeatIntervalMs: 20}})
    const heartbeat = await engine.event('server.heartbeat')

    await expect(heartbeat.arrived).resolves.toMatchObject({type: 'server.heartbeat'})
  })
})
