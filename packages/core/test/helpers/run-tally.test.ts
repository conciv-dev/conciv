import {describe, it, expect} from 'vitest'
import {type ChatEvent, runLifecycleEvent} from '@conciv/ai'
import {peakLiveRuns} from './run-tally.js'

function lifecycle(runId: string, phase: 'running' | 'completed'): ChatEvent {
  return runLifecycleEvent.create({
    runId,
    phase,
    startedAt: 0,
    finishedAt: phase === 'completed' ? 1 : null,
    serverNow: 1,
    error: null,
  })
}

describe('peakLiveRuns', () => {
  it('closes a run on its terminal lifecycle so a later run does not inflate the peak', () => {
    const chunks: ChatEvent[] = [
      lifecycle('blocking', 'running'),
      lifecycle('blocking', 'completed'),
      lifecycle('next', 'running'),
      lifecycle('next', 'completed'),
    ]

    expect(peakLiveRuns(chunks)).toBe(1)
  })

  it('counts two runs that overlap', () => {
    const chunks: ChatEvent[] = [
      lifecycle('first', 'running'),
      lifecycle('second', 'running'),
      lifecycle('first', 'completed'),
      lifecycle('second', 'completed'),
    ]

    expect(peakLiveRuns(chunks)).toBe(2)
  })
})
