import {describe, expect, it} from 'vitest'
import {until} from '../src/until.js'

describe('until', () => {
  it('resolves once the predicate turns true', async () => {
    const state = {n: 0}
    const tick = setInterval(() => (state.n += 1), 5)
    await until(() => state.n >= 3)
    clearInterval(tick)
    expect(state.n).toBeGreaterThanOrEqual(3)
  })

  it('rejects fast via failWhen without waiting for the guard', async () => {
    const started = performance.now()
    await expect(until(() => false, {failWhen: () => true, hangGuardMs: 4000})).rejects.toThrow()
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('rejects with a stall error after the hang guard', async () => {
    await expect(until(() => false, {hangGuardMs: 60})).rejects.toThrow(/stall|guard|timed out/i)
  })

  it('waits for the predicate to hold continuously when settleFor is set', async () => {
    const state = {open: true}
    setTimeout(() => (state.open = false), 20)
    await until(() => !state.open, {settleFor: 40})
    expect(state.open).toBe(false)
  })
})
