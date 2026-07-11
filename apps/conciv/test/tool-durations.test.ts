import {describe, expect, it} from 'vitest'
import {foldToolDurations, type ToolPartLike} from '../src/chat/tool-durations.js'

const message = (...parts: ToolPartLike[]): {parts: ToolPartLike[]} => ({parts})

function makeClock(start: number): {now: () => number; advance: (ms: number) => void} {
  const state = {at: start}
  return {
    now: () => state.at,
    advance: (ms) => {
      state.at += ms
    },
  }
}

describe('foldToolDurations', () => {
  it('measures from first pending sighting to the settling fold', () => {
    const startedAt = new Map<string, number>()
    const clock = makeClock(1_000)
    const pending = foldToolDurations(
      [message({type: 'tool-call', id: 'a', state: 'input-streaming'})],
      startedAt,
      clock.now,
      {},
    )
    expect(pending).toEqual({})
    clock.advance(250)
    const settled = foldToolDurations(
      [message({type: 'tool-call', id: 'a', state: 'complete'})],
      startedAt,
      clock.now,
      pending,
    )
    expect(settled).toEqual({a: 250})
  })

  it('treats error state and present output as settled', () => {
    const startedAt = new Map<string, number>()
    const clock = makeClock(0)
    foldToolDurations(
      [message({type: 'tool-call', id: 'err', state: 'pending'}, {type: 'tool-call', id: 'out', state: 'pending'})],
      startedAt,
      clock.now,
      {},
    )
    clock.advance(40)
    const next = foldToolDurations(
      [
        message(
          {type: 'tool-call', id: 'err', state: 'error'},
          {type: 'tool-call', id: 'out', state: 'pending', output: {ok: true}},
        ),
      ],
      startedAt,
      clock.now,
      {},
    )
    expect(next).toEqual({err: 40, out: 40})
  })

  it('never rewrites a recorded duration on later folds', () => {
    const startedAt = new Map<string, number>()
    const clock = makeClock(0)
    foldToolDurations([message({type: 'tool-call', id: 'a', state: 'pending'})], startedAt, clock.now, {})
    clock.advance(10)
    const first = foldToolDurations(
      [message({type: 'tool-call', id: 'a', state: 'complete'})],
      startedAt,
      clock.now,
      {},
    )
    clock.advance(500)
    const second = foldToolDurations(
      [message({type: 'tool-call', id: 'a', state: 'complete'})],
      startedAt,
      clock.now,
      first,
    )
    expect(second).toEqual({a: 10})
  })

  it('records nothing for a part that was already settled at first sight', () => {
    const startedAt = new Map<string, number>()
    const clock = makeClock(0)
    const next = foldToolDurations([message({type: 'tool-call', id: 'a', state: 'complete'})], startedAt, clock.now, {})
    expect(next).toEqual({})
  })

  it('ignores non-tool parts and tool calls without ids', () => {
    const startedAt = new Map<string, number>()
    const clock = makeClock(0)
    const next = foldToolDurations(
      [message({type: 'text'}, {type: 'tool-call', id: '', state: 'complete'}, {type: 'tool-call', state: 'complete'})],
      startedAt,
      clock.now,
      {},
    )
    expect(next).toEqual({})
    expect(startedAt.size).toBe(0)
  })
})
