import {describe, it, expect} from 'vitest'
import type {StreamChunk} from '@tanstack/ai'
import {aguiRunLifecycleFor} from '@conciv/protocol/run-types'
import {peakLiveRuns} from './run-tally.js'

function lifecycle(runId: string, phase: 'running' | 'completed'): StreamChunk {
  return aguiRunLifecycleFor({
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
    const chunks: StreamChunk[] = [
      lifecycle('blocking', 'running'),
      lifecycle('blocking', 'completed'),
      lifecycle('next', 'running'),
      lifecycle('next', 'completed'),
    ]

    expect(peakLiveRuns(chunks)).toBe(1)
  })

  it('counts two runs that overlap', () => {
    const chunks: StreamChunk[] = [
      lifecycle('first', 'running'),
      lifecycle('second', 'running'),
      lifecycle('first', 'completed'),
      lifecycle('second', 'completed'),
    ]

    expect(peakLiveRuns(chunks)).toBe(2)
  })
})
