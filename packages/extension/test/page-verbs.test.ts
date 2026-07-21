import {describe, it, expect} from 'vitest'
import {pageVerbError, isPageVerbError} from '../src/page-verbs.js'

describe('pageVerbError', () => {
  it('builds a typed, guardable error', () => {
    const error = pageVerbError('no-widget', 'tanstack', 'routerState', 'no widget connected')
    expect(isPageVerbError(error)).toBe(true)
    expect(error.code).toBe('no-widget')
    expect(isPageVerbError(new Error('plain'))).toBe(false)
  })
})
