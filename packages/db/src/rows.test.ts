import {describe, expect, it} from 'vitest'
import {SessionRowSchema, sessionRecordToRow, sessionRowToRecord} from './rows.js'
import {SessionRecordSchema} from '@conciv/protocol/chat-types'

const record = SessionRecordSchema.parse({
  id: 'conciv_5e0c2f34-0000-4000-8000-000000000000',
  harnessSessionId: null,
  harnessKind: 'claude',
  origin: 'chat',
  title: null,
  model: null,
  usage: {inputTokens: 10, outputTokens: 2},
  cwd: '/tmp/project',
  createdAt: 1,
  updatedAt: 2,
})

describe('session rows', () => {
  it('round-trips record -> row -> record', () => {
    const row = SessionRowSchema.parse({...sessionRecordToRow(record), id: 'AZ9DoWFmdZCnwINWnCVR_g=='})
    expect(sessionRowToRecord(row)).toEqual(record)
  })
  it('defaults status to idle when the column is absent from input', () => {
    const row = SessionRowSchema.parse({...sessionRecordToRow(record), id: 'x'})
    expect(row.status).toBe('idle')
    expect('status' in sessionRecordToRow(record)).toBe(false)
  })
})
