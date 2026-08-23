import {describe, expect, it} from 'vitest'
import type {RunLifecycle} from '@conciv/protocol/run-types'
import {formatElapsed, runClock, type RunClockSource} from '../src/store/run-clock.js'

function lifecycle(overrides: Partial<RunLifecycle> = {}): RunLifecycle {
  return {
    runId: 'run-1',
    phase: 'running',
    startedAt: 1_000,
    finishedAt: null,
    serverNow: 1_000,
    error: null,
    ...overrides,
  }
}

function source(overrides: Partial<RunClockSource> = {}): RunClockSource {
  return {lifecycle: lifecycle(), receivedAt: 500_000, ...overrides}
}

describe('formatElapsed', () => {
  it('formats sub-hour durations as mm:ss', () => {
    expect(formatElapsed(84_000)).toBe('01:24')
  })

  it('formats zero as 00:00', () => {
    expect(formatElapsed(0)).toBe('00:00')
  })

  it('formats hour-scale durations as h:mm:ss', () => {
    expect(formatElapsed(3_661_000)).toBe('1:01:01')
  })
})

describe('runClock', () => {
  it('reports no elapsed time before any run has been observed', () => {
    expect(runClock(null, 500_000)).toEqual({elapsedMs: null, frozen: false})
  })

  it('ticks forward from the moment the lifecycle was received', () => {
    const state = runClock(source(), 502_500)
    expect(state).toEqual({elapsedMs: 2_500, frozen: false})
  })

  it('freezes at the run record duration once the run has finished', () => {
    const finished = source({lifecycle: lifecycle({phase: 'completed', finishedAt: 4_000, serverNow: 4_000})})
    expect(runClock(finished, 500_000)).toEqual({elapsedMs: 3_000, frozen: true})
    expect(runClock(finished, 900_000)).toEqual({elapsedMs: 3_000, frozen: true})
  })

  it('freezes at the run record duration for a run that was stopped', () => {
    const aborted = source({lifecycle: lifecycle({phase: 'aborted', finishedAt: 9_500, serverNow: 9_500})})
    expect(runClock(aborted, 700_000)).toEqual({elapsedMs: 8_500, frozen: true})
  })

  it('keeps counting from the server-side start after a reload re-delivers the snapshot', () => {
    const reloaded = source({lifecycle: lifecycle({serverNow: 31_000}), receivedAt: 500_000})
    expect(runClock(reloaded, 502_000)).toEqual({elapsedMs: 32_000, frozen: false})
  })

  it('stays continuous when a re-subscribe re-delivers the snapshot and the run record', () => {
    const live = runClock({lifecycle: lifecycle({serverNow: 12_000}), receivedAt: 500_000}, 505_000)
    expect(live).toEqual({elapsedMs: 16_000, frozen: false})
    const afterResubscribe = runClock({lifecycle: lifecycle({serverNow: 17_000}), receivedAt: 505_000}, 505_000)
    expect(afterResubscribe).toEqual({elapsedMs: 16_000, frozen: false})
  })

  it('never reports a negative elapsed time when the host clock steps backwards', () => {
    expect(runClock(source(), 499_000)).toEqual({elapsedMs: 0, frozen: false})
  })
})
