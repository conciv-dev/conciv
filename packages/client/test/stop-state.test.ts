import {describe, expect, it} from 'vitest'
import {STOP_TIMEOUT_MS, isStopping} from '../src/stop-state.js'

describe('isStopping', () => {
  it('is false while no stop has been requested', () => {
    expect(isStopping(null, true, 1_000)).toBe(false)
  })

  it('is true the moment a stop is requested on a busy session', () => {
    expect(isStopping(1_000, true, 1_000)).toBe(true)
  })

  it('stays true while the server has not yet reported the run settled', () => {
    expect(isStopping(1_000, true, 1_000 + STOP_TIMEOUT_MS - 1)).toBe(true)
  })

  it('clears as soon as the terminal chunk lands and the session is no longer busy', () => {
    expect(isStopping(1_000, false, 1_200)).toBe(false)
  })

  it('falls back to the plain running state when the stop is never acknowledged', () => {
    expect(isStopping(1_000, true, 1_000 + STOP_TIMEOUT_MS)).toBe(false)
  })
})
