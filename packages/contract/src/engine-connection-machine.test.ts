import {describe, expect, it} from 'vitest'
import {
  createConnectionState,
  defaultEngineConnectionTimings,
  reconnectDelay,
  transitionConnection,
  type EngineConnectionTimings,
} from './engine-connection-machine.js'

const short: EngineConnectionTimings = {
  ...defaultEngineConnectionTimings,
  reconnectMinDelayMs: 10,
  reconnectMaxDelayMs: 30,
  reconnectDelayGrowth: 2,
}

describe('engine connection reconnect timings', () => {
  it('grows the reconnect delay from the short timings it is given and schedules retries with them', () => {
    expect([-1, 0, 1, 2, 3, 9].map((retries) => reconnectDelay(retries, short))).toEqual([0, 0, 10, 20, 30, 30])
    const started = transitionConnection(createConnectionState(undefined, short), {type: 'call-started'})
    const opening = transitionConnection(started.state, {type: 'retry-due', attempt: 1})
    const closed = transitionConnection(opening.state, {type: 'socket-closed', attempt: 1, code: 1006})
    expect(closed.effects[0]).toEqual({type: 'schedule-retry', attempt: 2, delayMs: 10})
  })
})
