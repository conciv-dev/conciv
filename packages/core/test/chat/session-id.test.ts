import {describe, it, expect} from 'vitest'
import {sessionIdFromHeaders} from '../../src/api/mcp.js'

describe('sessionIdFromHeaders', () => {
  it('returns null when no header (a new session)', () => {
    expect(sessionIdFromHeaders(new Headers())).toBeNull()
  })
  it('returns the conciv_ id from the header', () => {
    const h = new Headers({'conciv-session-id': 'conciv_x'})
    expect(sessionIdFromHeaders(h)).toBe('conciv_x')
  })
  it('throws 400 on a present-but-non-ours id (only our SessionId is accepted)', () => {
    expect(() => sessionIdFromHeaders(new Headers({'conciv-session-id': 'no spaces!'}))).toThrow()
    expect(() => sessionIdFromHeaders(new Headers({'conciv-session-id': 'raw-harness-token'}))).toThrow()
  })
})
