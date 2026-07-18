import {describe, it, expect} from 'vitest'
import {
  SessionId,
  isSessionId,
  SessionRecordSchema,
  ResolveRequestSchema,
  ResolveResponseSchema,
  ChatContentPartSchema,
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

describe('ChatContentPartSchema', () => {
  it('accepts data images with a MIME type', () => {
    expect(
      ChatContentPartSchema.safeParse({
        type: 'image',
        source: {type: 'data', value: 'aGVsbG8=', mimeType: 'image/png'},
      }).success,
    ).toBe(true)
  })

  it('rejects data images without a MIME type', () => {
    expect(ChatContentPartSchema.safeParse({type: 'image', source: {type: 'data', value: 'aGVsbG8='}}).success).toBe(
      false,
    )
  })

  it('rejects unsupported and missing image sources', () => {
    expect(ChatContentPartSchema.safeParse({type: 'image'}).success).toBe(false)
    expect(
      ChatContentPartSchema.safeParse({type: 'image', source: {type: 'url', value: 'https://example.com/image.png'}})
        .success,
    ).toBe(false)
  })
})

describe('ChatContentPartSchema document parts', () => {
  it('accepts a document part with a namespaced mime', () => {
    const parsed = ChatContentPartSchema.safeParse({
      type: 'document',
      source: {type: 'data', mimeType: 'application/x-conciv-recorder', value: 'eyJyZWNvcmRpbmdJZCI6InIxIn0='},
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an oversized document value', () => {
    const parsed = ChatContentPartSchema.safeParse({
      type: 'document',
      source: {type: 'data', mimeType: 'application/x-test', value: 'a'.repeat(27_962_029)},
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an empty document value and a malformed mime', () => {
    expect(
      ChatContentPartSchema.safeParse({
        type: 'document',
        source: {type: 'data', mimeType: 'application/x-test', value: ''},
      }).success,
    ).toBe(false)
    expect(
      ChatContentPartSchema.safeParse({
        type: 'document',
        source: {type: 'data', mimeType: 'no-slash', value: 'aGVsbG8='},
      }).success,
    ).toBe(false)
  })

  it('accepts modelOnly metadata on a text part', () => {
    const parsed = ChatContentPartSchema.safeParse({type: 'text', content: 'x', metadata: {modelOnly: true}})
    expect(parsed.success).toBe(true)
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
