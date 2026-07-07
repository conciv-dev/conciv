import {describe, expect, expectTypeOf, it} from 'vitest'
import {
  changeOf,
  commentRow,
  elementRow,
  pinRow,
  type CommentRow,
  type ElementRow,
  type PendingRow,
  type PinRow,
  type ReadRow,
  type ReplyRow,
} from '../src/shared/rows.js'
import type {canvasElements, canvasPending, canvasReplies, comments, pins, reads} from '../src/server/db/schema.js'

describe('wire schemas', () => {
  it('parses an element row and rejects a bad version', () => {
    const row = {room: 'r1', elementId: 'e1', data: {type: 'rectangle'}, version: 3}
    expect(elementRow.parse(row)).toEqual(row)
    expect(() => elementRow.parse({...row, version: 'x'})).toThrow()
  })

  it('parses a comment row with explicit nulls and epoch-millis timestamps', () => {
    const now = 1_700_000_000_000
    const row = {
      id: 'c1',
      sessionId: 's1',
      cid: 'cid1',
      threadId: 'cid1',
      parentId: null,
      parts: [{type: 'text', text: 'hi'}],
      authorKind: 'human',
      authorModel: null,
      authorId: null,
      authorName: null,
      authorAvatar: null,
      status: 'open',
      kind: 'floating',
      anchor: null,
      anchorFile: null,
      anchorComponent: null,
      anchorHash: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    }
    expect(commentRow.parse(row).createdAt).toBe(now)
  })

  it('discriminates change messages', () => {
    const change = changeOf(pinRow).parse({type: 'delete', key: 'p1'})
    expect(change.type).toBe('delete')
  })

  it('wire types equal drizzle row types', () => {
    expectTypeOf<ElementRow>().toEqualTypeOf<typeof canvasElements.$inferSelect>()
    expectTypeOf<PendingRow>().toEqualTypeOf<typeof canvasPending.$inferSelect>()
    expectTypeOf<ReplyRow>().toEqualTypeOf<typeof canvasReplies.$inferSelect>()
    expectTypeOf<CommentRow>().toEqualTypeOf<typeof comments.$inferSelect>()
    expectTypeOf<PinRow>().toEqualTypeOf<typeof pins.$inferSelect>()
    expectTypeOf<ReadRow>().toEqualTypeOf<typeof reads.$inferSelect>()
  })
})
