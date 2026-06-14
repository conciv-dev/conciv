import {describe, it, expect} from 'vitest'
import {cn} from './cn.js'

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('drops falsey values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })

  it('is empty when nothing is truthy', () => {
    expect(cn(false, null)).toBe('')
  })
})
