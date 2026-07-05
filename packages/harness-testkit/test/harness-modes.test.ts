import {afterEach, describe, expect, it} from 'vitest'
import {getHarness} from '@conciv/harness'
import {harnessModes} from '../src/harness-modes.js'

const claude = getHarness('claude')
if (!claude) throw new Error('claude adapter not registered')

const priorCI = process.env.CI

afterEach(() => {
  if (priorCI === undefined) delete process.env.CI
  else process.env.CI = priorCI
})

describe('harnessModes', () => {
  it('always runs the fake leg', () => {
    const fake = harnessModes(claude).find((mode) => mode.name === 'fake')
    expect(fake?.run).toBe(true)
  })

  it('disables the real leg under CI regardless of the binary', () => {
    process.env.CI = '1'
    const real = harnessModes(claude).find((mode) => mode.name === 'real')
    expect(real?.run).toBe(false)
  })
})
