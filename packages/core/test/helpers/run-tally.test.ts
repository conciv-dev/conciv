import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {peakLiveRuns} from './run-tally.js'

describe('peakLiveRuns', () => {
  it('closes a run on a tool_calls finish so a later run does not inflate the peak', () => {
    const chunks: StreamChunk[] = [
      {type: EventType.RUN_STARTED, threadId: 'blocking', runId: 'blocking'},
      {type: EventType.RUN_FINISHED, threadId: 'blocking', runId: 'blocking', finishReason: 'tool_calls'},
      {type: EventType.RUN_STARTED, threadId: 'next', runId: 'next'},
      {type: EventType.RUN_FINISHED, threadId: 'next', runId: 'next', finishReason: 'stop'},
    ]

    expect(peakLiveRuns(chunks)).toBe(1)
  })
})
