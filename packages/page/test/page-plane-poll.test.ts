import {describe, expect, it} from 'vitest'
import {pagePlanePollDelayMs} from '../src/index.js'

describe('pagePlanePollDelayMs', () => {
  it('polls at the normal cadence while the engine is reachable', () => {
    expect(pagePlanePollDelayMs(() => true)).toBe(500)
  })

  it('backs off while the engine is unreachable instead of hammering it', () => {
    expect(pagePlanePollDelayMs(() => false)).toBe(2000)
  })
})
