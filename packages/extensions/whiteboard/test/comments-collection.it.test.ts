import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {commentParse, type CommentRecord} from '../src/schema.js'
import {bootStack, type Stack} from './helpers/boot-stack.js'

const makeRecord = (overrides: Partial<CommentRecord> = {}): CommentRecord => ({
  cid: crypto.randomUUID(),
  preview_id: 'preview-it',
  session_id: 'session-it',
  thread_id: crypto.randomUUID(),
  parent_id: null,
  parts: JSON.stringify([{type: 'text', text: 'a server comment'}]),
  author_kind: 'human',
  author_model: null,
  status: 'open',
  kind: 'floating',
  anchor: null,
  anchor_file: null,
  anchor_component: null,
  anchor_hash: null,
  last_resolved_commit: null,
  last_resolved_file_hash: null,
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_000_000,
  resolved_at: null,
  resolved_by: null,
  ...overrides,
})

describe('comments collection (it) — real trail via the whiteboard extension', () => {
  let stack: Stack

  beforeAll(async () => {
    stack = await bootStack()
  }, 90_000)

  afterAll(async () => {
    await stack?.stop()
  })

  it('declares the comments collection with an fts index over parts', () => {
    const info = stack.db.list().find((c) => c.name === 'comments')
    expect(info).toBeTruthy()
    expect(info?.fts).toContain('parts')
  })

  it('round-trips a comment record through real trail', async () => {
    const comments = stack.db.get('comments')
    expect(comments).toBeTruthy()
    const record = makeRecord()
    await comments!.insert(record)
    const [stored] = await comments!.query({cid: record.cid})
    expect(stored).toMatchObject({cid: record.cid, preview_id: 'preview-it'})
    const parsedParts = commentParse.parts((stored as unknown as CommentRecord).parts)
    expect(parsedParts).toEqual([{type: 'text', text: 'a server comment'}])
    const created = commentParse.created_at((stored as unknown as CommentRecord).created_at)
    expect(created.getTime()).toBe(1_700_000_000_000)
  })
})
