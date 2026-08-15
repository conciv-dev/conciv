import {describe, expect, it} from 'vitest'
import {formatStarCount, parseStarCount} from '../src/lib/star-count'

describe('parseStarCount', () => {
  it('reads the star count from a valid GitHub repo payload', () => {
    expect(parseStarCount({stargazers_count: 42})).toBe(42)
  })

  it('returns null for a malformed payload', () => {
    expect(parseStarCount({stargazers_count: 'not-a-number'})).toBeNull()
  })

  it('returns null when the field is missing', () => {
    expect(parseStarCount({})).toBeNull()
  })

  it('returns null for a negative count', () => {
    expect(parseStarCount({stargazers_count: -1})).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(parseStarCount(null)).toBeNull()
  })
})

describe('formatStarCount', () => {
  it('renders counts under 1000 verbatim', () => {
    expect(formatStarCount(0)).toBe('0')
    expect(formatStarCount(42)).toBe('42')
    expect(formatStarCount(999)).toBe('999')
  })

  it('renders thousands with one decimal and a k suffix', () => {
    expect(formatStarCount(1200)).toBe('1.2k')
    expect(formatStarCount(15400)).toBe('15.4k')
  })

  it('drops a trailing zero decimal', () => {
    expect(formatStarCount(1000)).toBe('1k')
  })
})
