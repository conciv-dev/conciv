import {describe, expect, it} from 'vitest'
import {nativePageBase} from '../src/shared/page-base.js'

describe('nativePageBase', () => {
  it('returns the bare origin when the page has no token prefix', () => {
    expect(nativePageBase({origin: 'http://127.0.0.1:4599', pathname: '/native'})).toBe('http://127.0.0.1:4599')
  })

  it('keeps the /t/<token> prefix when the page is token-scoped', () => {
    expect(nativePageBase({origin: 'http://127.0.0.1:4599', pathname: '/t/tok-abc/native'})).toBe(
      'http://127.0.0.1:4599/t/tok-abc',
    )
  })

  it('tolerates a trailing slash on the native route', () => {
    expect(nativePageBase({origin: 'http://host', pathname: '/t/tok/native/'})).toBe('http://host/t/tok')
  })

  it('falls back to the origin when the path is not the native route', () => {
    expect(nativePageBase({origin: 'http://host', pathname: '/'})).toBe('http://host')
  })
})
