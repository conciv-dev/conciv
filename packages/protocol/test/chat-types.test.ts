import {describe, it, expect} from 'vitest'
import {
  SessionId,
  isSessionId,
  SessionRecordSchema,
  ResolveRequestSchema,
  ResolveResponseSchema,
} from '../src/chat-types.js'

describe('SessionId (branded, conciv_ prefix)', () => {
  it('accepts an conciv_ id', () => {
    expect(SessionId.safeParse('conciv_018f3a2b-4c5d-6e7f').success).toBe(true)
  })
  it('rejects a non-conciv id (a raw harness token)', () => {
    expect(SessionId.safeParse('5d3f-claude-token').success).toBe(false)
  })
})

describe('isSessionId (branded guard)', () => {
  it('narrows an conciv_ string', () => {
    expect(isSessionId('conciv_018f3a2b-4c5d-6e7f')).toBe(true)
  })
  it('rejects a raw harness token and non-strings', () => {
    expect(isSessionId('5d3f-claude-token')).toBe(false)
    expect(isSessionId(null)).toBe(false)
    expect(isSessionId(42)).toBe(false)
  })
})

describe('SessionRecordSchema', () => {
  it('parses a new record (no harness id yet)', () => {
    const r = SessionRecordSchema.parse({
      id: 'conciv_1',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/app',
      createdAt: 1,
      updatedAt: 1,
    })
    expect(r.harnessSessionId).toBeNull()
  })
})

describe('ResolveRequestSchema', () => {
  it('allows an empty body (new session)', () => {
    expect(ResolveRequestSchema.parse({})).toEqual({})
  })
  it('echoes ResolveResponse with a branded id', () => {
    expect(ResolveResponseSchema.parse({sessionId: 'conciv_x'}).sessionId).toBe('conciv_x')
  })
})
