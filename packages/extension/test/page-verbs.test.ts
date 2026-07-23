import {describe, it, expect} from 'vitest'
import {pageVerbError, isPageVerbError} from '../src/page-verbs.js'

describe('pageVerbError', () => {
  it('builds a typed, guardable error carrying extension and verb', () => {
    const error = pageVerbError('no-widget', 'tanstack', 'routerState', 'no widget connected')
    expect(isPageVerbError(error)).toBe(true)
    expect(error.code).toBe('no-widget')
    expect(error.extension).toBe('tanstack')
    expect(error.verb).toBe('routerState')
    expect(error.message).toBe('no widget connected')
    expect(isPageVerbError(new Error('plain'))).toBe(false)
  })
})
