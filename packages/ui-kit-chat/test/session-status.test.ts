import {describe, expect, it} from 'vitest'
import type {TurnRollup} from '../src/store/turn-rollup.js'
import {deriveSessionStatus, type SessionStatusInput} from '../src/store/session-status.js'

function rollup(overrides: Partial<TurnRollup> = {}): TurnRollup {
  return {
    files: [],
    adds: 0,
    dels: 0,
    toolCalls: 0,
    tools: {},
    failed: 0,
    awaitingApproval: false,
    live: false,
    ...overrides,
  }
}

function input(overrides: Partial<SessionStatusInput> = {}): SessionStatusInput {
  return {
    latestRollup: rollup(),
    isStreaming: false,
    queueLength: 0,
    stopping: false,
    runError: null,
    ...overrides,
  }
}

describe('deriveSessionStatus', () => {
  it('reports waiting when the latest turn is awaiting approval', () => {
    const status = deriveSessionStatus(input({latestRollup: rollup({awaitingApproval: true})}))
    expect(status).toEqual({kind: 'waiting', label: 'WAITING'})
  })

  it('reports running when the latest turn is live', () => {
    const status = deriveSessionStatus(input({latestRollup: rollup({live: true})}))
    expect(status).toEqual({kind: 'running', label: 'RUNNING'})
  })

  it('reports running when the connection is streaming even without a live turn', () => {
    const status = deriveSessionStatus(input({isStreaming: true}))
    expect(status).toEqual({kind: 'running', label: 'RUNNING'})
  })

  it('includes the queue position in the running label when messages are queued', () => {
    const status = deriveSessionStatus(input({latestRollup: rollup({live: true}), queueLength: 2}))
    expect(status).toEqual({kind: 'running', label: 'RUNNING 1/3'})
  })

  it('reports done when nothing failed, nothing live, and nothing queued', () => {
    const status = deriveSessionStatus(input())
    expect(status).toEqual({kind: 'done', label: 'DONE'})
  })

  it('treats a missing rollup as done', () => {
    const status = deriveSessionStatus(input({latestRollup: undefined}))
    expect(status).toEqual({kind: 'done', label: 'DONE'})
  })

  it('reports failed only when the run itself ended with a terminal error', () => {
    const status = deriveSessionStatus(input({runError: 'claude exited with code 1'}))
    expect(status).toEqual({kind: 'failed', label: 'FAILED', reason: 'claude exited with code 1'})
  })

  it('stays done when a tool call was denied but the run completed normally', () => {
    const status = deriveSessionStatus(input({latestRollup: rollup({failed: 1, toolCalls: 1})}))
    expect(status).toEqual({kind: 'done', label: 'DONE'})
  })

  it('stays done when a bash tool exited nonzero but the run completed normally', () => {
    const status = deriveSessionStatus(input({latestRollup: rollup({failed: 3, toolCalls: 4})}))
    expect(status).toEqual({kind: 'done', label: 'DONE'})
  })

  it('prefers running over failed while a new turn is live after an earlier run error', () => {
    const status = deriveSessionStatus(input({latestRollup: rollup({live: true}), runError: 'earlier failure'}))
    expect(status).toEqual({kind: 'running', label: 'RUNNING'})
  })

  it('reports stopping while a stop is in flight, outranking running', () => {
    const status = deriveSessionStatus(input({latestRollup: rollup({live: true}), isStreaming: true, stopping: true}))
    expect(status).toEqual({kind: 'stopping', label: 'STOPPING'})
  })

  it('reports stopping while a stop is in flight, outranking a pending approval', () => {
    const status = deriveSessionStatus(input({latestRollup: rollup({awaitingApproval: true}), stopping: true}))
    expect(status).toEqual({kind: 'stopping', label: 'STOPPING'})
  })

  it('leaves stopping once the run has settled and nothing is live', () => {
    const status = deriveSessionStatus(input({stopping: false, runError: null}))
    expect(status).toEqual({kind: 'done', label: 'DONE'})
  })
})
