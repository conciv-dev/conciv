import {describe, expect, it} from 'vitest'
import {formatDuration} from '../src/tools/primitives/tool-util.js'

describe('formatDuration', () => {
  it('renders sub-second durations with one decimal', () => {
    expect(formatDuration(900)).toBe('0.9s')
  })

  it('renders whole seconds under a minute', () => {
    expect(formatDuration(42_000)).toBe('42s')
  })

  it('renders durations at or above a minute as minutes and seconds', () => {
    expect(formatDuration(65_000)).toBe('1m 5s')
  })

  it('renders exactly one minute with a zero-second remainder', () => {
    expect(formatDuration(60_000)).toBe('1m 0s')
  })

  it('rounds the seconds remainder for multi-minute durations', () => {
    expect(formatDuration(125_400)).toBe('2m 5s')
  })

  it('returns undefined for undefined input', () => {
    expect(formatDuration(undefined)).toBeUndefined()
  })

  it('returns undefined for negative durations', () => {
    expect(formatDuration(-5)).toBeUndefined()
  })
})
