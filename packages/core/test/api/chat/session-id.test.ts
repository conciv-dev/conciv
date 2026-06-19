import {describe, it, expect} from 'vitest'
import {sessionIdFromHeaders} from '../../../src/api/chat/session-id.js'

describe('sessionIdFromHeaders', () => {
  it('returns null when no header (a new session)', () => {
    expect(sessionIdFromHeaders(new Headers())).toBeNull()
  })
  it('returns the mandarax_ id from the header', () => {
    const h = new Headers({'mandarax-session-id': 'mandarax_x'})
    expect(sessionIdFromHeaders(h)).toBe('mandarax_x')
  })
  it('throws 400 on a present-but-non-ours id (only our SessionId is accepted)', () => {
    expect(() => sessionIdFromHeaders(new Headers({'mandarax-session-id': 'no spaces!'}))).toThrow()
    expect(() => sessionIdFromHeaders(new Headers({'mandarax-session-id': 'raw-harness-token'}))).toThrow()
  })
})
