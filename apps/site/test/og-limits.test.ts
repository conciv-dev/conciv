import {describe, expect, it} from 'vitest'
import {clampOgText, MAX_OG_DESCRIPTION_LENGTH, MAX_OG_TITLE_LENGTH} from '../src/lib/og-limits'

describe('clampOgText', () => {
  it('leaves short text untouched', () => {
    expect(clampOgText('quick start', 20)).toBe('quick start')
  })

  it('trims surrounding whitespace before measuring length', () => {
    expect(clampOgText('  quick start  ', 20)).toBe('quick start')
  })

  it('truncates long text and appends an ellipsis within the max length', () => {
    const long = 'a'.repeat(200)
    const clamped = clampOgText(long, MAX_OG_TITLE_LENGTH)

    expect(clamped.length).toBe(MAX_OG_TITLE_LENGTH)
    expect(clamped.endsWith('…')).toBe(true)
  })

  it('respects the description max length', () => {
    const long = 'word '.repeat(100)
    const clamped = clampOgText(long, MAX_OG_DESCRIPTION_LENGTH)

    expect(clamped.length).toBeLessThanOrEqual(MAX_OG_DESCRIPTION_LENGTH)
  })
})
