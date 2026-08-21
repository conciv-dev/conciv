import {describe, expect, it} from 'vitest'
import type {TurnRollup} from '../src/store/turn-rollup.js'
import {deriveSessionStatus} from '../src/store/session-status.js'

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

describe('deriveSessionStatus', () => {
  it('reports waiting when the latest turn is awaiting approval', () => {
    const status = deriveSessionStatus({
      latestRollup: rollup({awaitingApproval: true}),
      isStreaming: false,
      queueLength: 0,
    })
    expect(status).toEqual({kind: 'waiting', label: 'WAITING'})
  })

  it('reports failed when the latest turn failed and nothing is live', () => {
    const status = deriveSessionStatus({latestRollup: rollup({failed: 1}), isStreaming: false, queueLength: 0})
    expect(status).toEqual({kind: 'failed', label: 'FAILED'})
  })

  it('reports running when the latest turn is live', () => {
    const status = deriveSessionStatus({latestRollup: rollup({live: true}), isStreaming: false, queueLength: 0})
    expect(status).toEqual({kind: 'running', label: 'RUNNING'})
  })

  it('reports running when the connection is streaming even without a live turn', () => {
    const status = deriveSessionStatus({latestRollup: rollup(), isStreaming: true, queueLength: 0})
    expect(status).toEqual({kind: 'running', label: 'RUNNING'})
  })

  it('includes the queue position in the running label when messages are queued', () => {
    const status = deriveSessionStatus({latestRollup: rollup({live: true}), isStreaming: false, queueLength: 2})
    expect(status).toEqual({kind: 'running', label: 'RUNNING 1/3'})
  })

  it('reports done when nothing failed, nothing live, and nothing queued', () => {
    const status = deriveSessionStatus({latestRollup: rollup(), isStreaming: false, queueLength: 0})
    expect(status).toEqual({kind: 'done', label: 'DONE'})
  })

  it('prefers running over failed when a turn is both live and previously failed', () => {
    const status = deriveSessionStatus({
      latestRollup: rollup({live: true, failed: 1}),
      isStreaming: false,
      queueLength: 0,
    })
    expect(status).toEqual({kind: 'running', label: 'RUNNING'})
  })

  it('treats a missing rollup as done', () => {
    const status = deriveSessionStatus({latestRollup: undefined, isStreaming: false, queueLength: 0})
    expect(status).toEqual({kind: 'done', label: 'DONE'})
  })
})
