import {describe, expect, it} from 'vitest'
import {DraftRowSchema, MarkerRowSchema, SessionMetaSchema} from '../src/rows.js'

describe('row schemas', () => {
  it('parses a session meta with status', () => {
    const parsed = SessionMetaSchema.parse({
      id: 'conciv_1',
      title: 'hello',
      updatedAt: 1,
      messageCount: 0,
      running: false,
      origin: 'conciv',
      usage: null,
      status: 'idle',
      model: null,
    })
    expect(parsed.status).toBe('idle')
  })

  it('rejects an unknown marker kind', () => {
    expect(() => MarkerRowSchema.parse({id: 'm1', sessionId: 'conciv_1', afterTurn: 2, kind: 'weird'})).toThrow()
  })

  it('drafts are explicit about selection and grabs', () => {
    const draft = DraftRowSchema.parse({
      sessionId: 'conciv_1',
      text: 'hi',
      selectionStart: 2,
      selectionEnd: 2,
      grabs: ['<div/>'],
      updatedAt: 5,
    })
    expect(draft.grabs).toEqual(['<div/>'])
  })
})
