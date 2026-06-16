import {describe, it, expect} from 'vitest'
import {sessionIdFromHeaders} from '../../../src/api/chat/session-id.js'

describe('sessionIdFromHeaders', () => {
  it('returns null when no header (a new session)', () => {
    expect(sessionIdFromHeaders(new Headers())).toBeNull()
  })
  it('returns the aidx_ id from the header', () => {
    const h = new Headers({'aidx-session-id': 'aidx_x'})
    expect(sessionIdFromHeaders(h)).toBe('aidx_x')
  })
  it('rejects a malformed id → null', () => {
    expect(sessionIdFromHeaders(new Headers({'aidx-session-id': 'no spaces!'}))).toBeNull()
  })
})
