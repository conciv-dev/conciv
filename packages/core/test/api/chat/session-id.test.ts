import {describe, it, expect} from 'vitest'
import {sessionIdFromHeaders} from '../../../src/api/chat/session-id.js'
import {DEFAULT_SESSION_ID} from '@aidx/protocol/chat-types'

describe('sessionIdFromHeaders', () => {
  it('returns the header value when present', () => {
    expect(sessionIdFromHeaders(new Headers({'aidx-session-id': 'sess-a'}))).toBe('sess-a')
  })
  it('falls back to the default when absent or blank', () => {
    expect(sessionIdFromHeaders(new Headers())).toBe(DEFAULT_SESSION_ID)
    expect(sessionIdFromHeaders(new Headers({'aidx-session-id': '  '}))).toBe(DEFAULT_SESSION_ID)
  })
})
