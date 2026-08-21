import {describe, expect, it} from 'vitest'
import type {MessagePart} from '@tanstack/ai-client'
import type {Turn} from '../src/store/grouping.js'
import {foldTurnClock, formatElapsed} from '../src/store/turn-clock.js'

function turn(key: string, parts: MessagePart[]): Turn {
  return {key, role: 'assistant', parts, start: 0, end: 0}
}

function userTurn(key: string, content: string): Turn {
  return {key, role: 'user', parts: [{type: 'text', content}], start: 0, end: 0}
}

function liveCall(id: string): MessagePart {
  return {type: 'tool-call', id, name: 'Bash', arguments: '{}', state: 'input-streaming'}
}

function settledCall(id: string): MessagePart {
  return {type: 'tool-call', id, name: 'Bash', arguments: '{}', state: 'complete'}
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

function textPart(content: string): MessagePart {
  return {type: 'text', content}
}

describe('foldTurnClock', () => {
  it('returns null when no turn has been observed', () => {
    const state = foldTurnClock([], new Map(), new Map(), () => 1_000, false)
    expect(state).toEqual({elapsedMs: null, frozen: false})
  })

  it('returns null when the latest turn is already settled before its start was ever observed', () => {
    const turns = [turn('t1', [settledCall('c1')])]
    const state = foldTurnClock(turns, new Map(), new Map(), () => 1_000, false)
    expect(state).toEqual({elapsedMs: null, frozen: false})
  })

  it('starts the clock at first observation of a live turn and ticks with now()', () => {
    const startedAt = new Map<string, number>()
    const frozenElapsed = new Map<string, number>()
    const turns = [turn('t1', [liveCall('c1')])]
    const first = foldTurnClock(turns, startedAt, frozenElapsed, () => 10_000, false)
    expect(first).toEqual({elapsedMs: 0, frozen: false})
    const second = foldTurnClock(turns, startedAt, frozenElapsed, () => 12_500, false)
    expect(second).toEqual({elapsedMs: 2_500, frozen: false})
  })

  it('freezes the elapsed time once the turn settles and streaming has stopped', () => {
    const startedAt = new Map<string, number>()
    const frozenElapsed = new Map<string, number>()
    const liveTurns = [turn('t1', [liveCall('c1')])]
    foldTurnClock(liveTurns, startedAt, frozenElapsed, () => 10_000, false)
    const settledTurns = [turn('t1', [settledCall('c1')])]
    const settled = foldTurnClock(settledTurns, startedAt, frozenElapsed, () => 13_000, false)
    expect(settled).toEqual({elapsedMs: 3_000, frozen: true})
    const later = foldTurnClock(settledTurns, startedAt, frozenElapsed, () => 20_000, false)
    expect(later).toEqual({elapsedMs: 3_000, frozen: true})
  })

  it('starts the clock for a text-only turn while the session is streaming, with no tool calls', () => {
    const startedAt = new Map<string, number>()
    const frozenElapsed = new Map<string, number>()
    const turns = [turn('t1', [textPart('thinking out loud')])]
    const first = foldTurnClock(turns, startedAt, frozenElapsed, () => 10_000, true)
    expect(first).toEqual({elapsedMs: 0, frozen: false})
    const second = foldTurnClock(turns, startedAt, frozenElapsed, () => 14_000, true)
    expect(second).toEqual({elapsedMs: 4_000, frozen: false})
  })

  it('keeps running through a tool call settling as long as the session is still streaming the final answer', () => {
    const startedAt = new Map<string, number>()
    const frozenElapsed = new Map<string, number>()
    const liveTurns = [turn('t1', [liveCall('c1')])]
    foldTurnClock(liveTurns, startedAt, frozenElapsed, () => 10_000, true)
    const settledToolTurns = [turn('t1', [settledCall('c1'), textPart('final answer')])]
    const stillStreaming = foldTurnClock(settledToolTurns, startedAt, frozenElapsed, () => 15_000, true)
    expect(stillStreaming).toEqual({elapsedMs: 5_000, frozen: false})
    const done = foldTurnClock(settledToolTurns, startedAt, frozenElapsed, () => 18_000, false)
    expect(done).toEqual({elapsedMs: 8_000, frozen: true})
  })

  it('keeps the clock anchored to the user turn when the first assistant turn arrives', () => {
    const startedAt = new Map<string, number>()
    const frozenElapsed = new Map<string, number>()
    const submitted = [userTurn('u1', 'do the thing')]
    foldTurnClock(submitted, startedAt, frozenElapsed, () => 10_000, true)
    const answering = [userTurn('u1', 'do the thing'), turn('a1', [liveCall('c1')])]
    const continued = foldTurnClock(answering, startedAt, frozenElapsed, () => 16_000, true)
    expect(continued).toEqual({elapsedMs: 6_000, frozen: false})
    const settledTurns = [userTurn('u1', 'do the thing'), turn('a1', [settledCall('c1')])]
    const settled = foldTurnClock(settledTurns, startedAt, frozenElapsed, () => 19_000, false)
    expect(settled).toEqual({elapsedMs: 9_000, frozen: true})
  })

  it('restarts the clock when a new user turn opens the next exchange', () => {
    const startedAt = new Map<string, number>()
    const frozenElapsed = new Map<string, number>()
    const first = [userTurn('u1', 'first'), turn('a1', [settledCall('c1')])]
    foldTurnClock(first, startedAt, frozenElapsed, () => 10_000, true)
    foldTurnClock(first, startedAt, frozenElapsed, () => 12_000, false)
    const next = [...first, userTurn('u2', 'second')]
    const fresh = foldTurnClock(next, startedAt, frozenElapsed, () => 30_000, true)
    expect(fresh).toEqual({elapsedMs: 0, frozen: false})
  })
})
