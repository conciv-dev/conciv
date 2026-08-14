import {describe, expect, it} from 'vitest'
import {cn} from './cn'

describe('cn', () => {
  it('joins truthy string parts with a space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('filters out falsy parts', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })
})
