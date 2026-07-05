import {describe, expect, it} from 'vitest'
import {getHarness} from '@conciv/harness'
import {createTestHarness} from '../src/create-test-harness.js'

describe('createTestHarness', () => {
  it('keeps the real capabilities but swaps run for a deterministic one', () => {
    const real = getHarness('claude')
    if (!real) throw new Error('claude adapter not registered')
    const test = createTestHarness(real)
    expect(test.id).toBe(real.id)
    expect(test.capabilities).toEqual(real.capabilities)
    expect(typeof test.run).toBe('function')
    expect(test.run).not.toBe(real.run)
  })
})
