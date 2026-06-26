import {describe, expect, it} from 'vitest'
import {
  COMMENT_COLUMNS,
  CommentSchema,
  commentParse,
  commentSerialize,
  LIMITS,
  type Comment,
  type CommentRecord,
} from '../src/schema.js'

const convert = (conversions: Record<string, (v: never) => unknown>, input: Record<string, unknown>) =>
  Object.fromEntries(Object.keys(input).map((k) => [k, conversions[k]?.(input[k] as never) ?? input[k]]))

const sampleRecord = (): CommentRecord => ({
  cid: '11111111-1111-7111-8111-111111111111',
  preview_id: 'preview-a',
  session_id: 'session-a',
  thread_id: 'thread-a',
  parent_id: null,
  parts: JSON.stringify([
    {type: 'text', text: 'hello'},
    {type: 'tool', name: 'canvas.draw'},
  ]),
  author_kind: 'human',
  author_model: null,
  status: 'open',
  kind: 'source-linked',
  anchor: JSON.stringify({source: {file: 'src/App.tsx', line: 5, column: 3}}),
  anchor_file: 'src/App.tsx',
  anchor_component: 'App',
  anchor_hash: 'abc123',
  last_resolved_commit: 'deadbeef',
  last_resolved_file_hash: 'cafef00d',
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_500_000,
  resolved_at: null,
  resolved_by: null,
})

describe('comment schema', () => {
  it('round-trips a record through parse then serialize', () => {
    const record = sampleRecord()
    const parsed = convert(commentParse, record) as unknown as Comment
    const serialized = convert(commentSerialize, parsed as unknown as Record<string, unknown>)
    expect(serialized).toEqual(record)
  })

  it('parses JSON columns into structured values', () => {
    const parsed = convert(commentParse, sampleRecord()) as unknown as Comment
    expect(parsed.parts).toEqual([
      {type: 'text', text: 'hello'},
      {type: 'tool', name: 'canvas.draw'},
    ])
    expect(parsed.anchor).toEqual({source: {file: 'src/App.tsx', line: 5, column: 3}})
    expect(parsed.created_at).toBeInstanceOf(Date)
    expect(parsed.created_at.getTime()).toBe(1_700_000_000_000)
    expect(parsed.resolved_at).toBeNull()
  })

  it('keeps nulls null through both conversions', () => {
    const record = {...sampleRecord(), anchor: null, resolved_at: null}
    const parsed = convert(commentParse, record) as unknown as Comment
    expect(parsed.anchor).toBeNull()
    expect(parsed.resolved_at).toBeNull()
    const back = convert(commentSerialize, parsed as unknown as Record<string, unknown>)
    expect(back.anchor).toBeNull()
    expect(back.resolved_at).toBeNull()
  })

  it('validates a well-formed comment', () => {
    const parsed = convert(commentParse, sampleRecord()) as unknown as Comment
    expect(CommentSchema.safeParse(parsed).success).toBe(true)
  })

  it('rejects a part exceeding the byte limit', () => {
    const parsed = convert(commentParse, sampleRecord()) as unknown as Comment
    const huge: Comment = {...parsed, parts: [{type: 'text', text: 'x'.repeat(LIMITS.partBytes + 1_000)}]}
    expect(CommentSchema.safeParse(huge).success).toBe(false)
  })

  it('throws on a malformed anchor JSON string', () => {
    expect(() => commentParse.anchor('{not json')).toThrow(/anchor is not valid JSON/)
  })

  it('throws on a non-finite timestamp', () => {
    expect(() => commentParse.created_at(Number.NaN)).toThrow(/finite timestamp/)
  })

  it('exposes column defs without the platform id and cid', () => {
    expect(COMMENT_COLUMNS).toContain('preview_id TEXT NOT NULL')
    expect(COMMENT_COLUMNS).toContain('created_at INTEGER NOT NULL')
    expect(COMMENT_COLUMNS).not.toContain('id BLOB')
    expect(COMMENT_COLUMNS.trim().endsWith(',')).toBe(false)
  })
})
