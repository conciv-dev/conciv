import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb} from '../src/db.js'
import {
  clearRunState,
  clearSessionHistory,
  deleteRunMessages,
  foldRichRunMessagesIntoHistory,
  foldRunMessagesIntoHistory,
  hasRichPart,
  modelOf,
  replyFor,
  runMessagesFor,
  sessionHistoryFor,
  setRunMessages,
  writeReply,
} from '../src/run-queries.js'
import {sessions} from '../src/schema.js'

const fresh = () => openDb(mkdtempSync(join(tmpdir(), 'conciv-run-')))

describe('run lifecycle queries', () => {
  it('the rich fold moves image-bearing run messages into session history and clears the run row', () => {
    const db = fresh()
    const imageTurn = [
      {id: 'u1', role: 'user', parts: [{type: 'image', source: {type: 'data', value: 'aGk=', mimeType: 'image/png'}}]},
      {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'red'}]},
    ]
    setRunMessages(db, 's6', imageTurn)
    foldRichRunMessagesIntoHistory(db, 's6')
    expect(runMessagesFor(db, 's6')).toBeNull()
    expect(sessionHistoryFor(db, 's6')?.messages).toEqual(imageTurn)
  })

  it('the rich fold keeps appending once session history exists, even for text-only runs', () => {
    const db = fresh()
    const imageTurn = [{id: 'u1', role: 'user', parts: [{type: 'image', source: {type: 'data'}}]}]
    const textTurn = [{id: 'u2', role: 'user', parts: [{type: 'text', content: 'follow up'}]}]
    setRunMessages(db, 's7', imageTurn)
    foldRichRunMessagesIntoHistory(db, 's7')
    setRunMessages(db, 's7', textTurn)
    foldRichRunMessagesIntoHistory(db, 's7')
    expect(runMessagesFor(db, 's7')).toBeNull()
    expect(sessionHistoryFor(db, 's7')?.messages).toEqual([...imageTurn, ...textTurn])
  })

  it('the rich fold leaves text-only runs alone when no session history exists', () => {
    const db = fresh()
    setRunMessages(db, 's8', [{id: 'u1', role: 'user', parts: [{type: 'text', content: 'plain'}]}])
    foldRichRunMessagesIntoHistory(db, 's8')
    expect(runMessagesFor(db, 's8')?.messages).toEqual([
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'plain'}]},
    ])
    expect(sessionHistoryFor(db, 's8')).toBeNull()
  })

  it('the plain fold accumulates text-only turns into session history', () => {
    const db = fresh()
    const firstTurn = [{id: 'u1', role: 'user', parts: [{type: 'text', content: 'one'}]}]
    const secondTurn = [{id: 'u2', role: 'user', parts: [{type: 'text', content: 'two'}]}]
    setRunMessages(db, 's10', firstTurn)
    foldRunMessagesIntoHistory(db, 's10')
    setRunMessages(db, 's10', secondTurn)
    foldRunMessagesIntoHistory(db, 's10')
    expect(runMessagesFor(db, 's10')).toBeNull()
    expect(sessionHistoryFor(db, 's10')?.messages).toEqual([...firstTurn, ...secondTurn])
  })

  it('deleteRunMessages drops only the run row for that session', () => {
    const db = fresh()
    setRunMessages(db, 's11', [{id: 'live'}])
    setRunMessages(db, 'other', [{id: 'kept'}])
    deleteRunMessages(db, 's11')
    expect(runMessagesFor(db, 's11')).toBeNull()
    expect(runMessagesFor(db, 'other')?.messages).toEqual([{id: 'kept'}])
  })

  it('clearSessionHistory drops only the session history row', () => {
    const db = fresh()
    setRunMessages(db, 's9', [{id: 'u1', role: 'user', parts: [{type: 'image', source: {}}]}])
    foldRichRunMessagesIntoHistory(db, 's9')
    setRunMessages(db, 's9', [{id: 'live'}])
    clearSessionHistory(db, 's9')
    expect(sessionHistoryFor(db, 's9')).toBeNull()
    expect(runMessagesFor(db, 's9')?.messages).toEqual([{id: 'live'}])
  })

  it('reads fall back safely for unknown sessions', () => {
    const db = fresh()
    expect(modelOf(db, 'missing')).toBeNull()
    expect(runMessagesFor(db, 'missing')).toBeNull()
    expect(replyFor(db, 'missing', 'k')).toBeNull()
  })

  it('modelOf reads the sessions row', () => {
    const db = fresh()
    db.insert(sessions)
      .values({
        id: 'conciv_m',
        harnessSessionId: null,
        harnessKind: 'claude',
        origin: 'chat',
        title: null,
        model: 'haiku',
        usage: null,
        cwd: '/w',
        createdAt: 1,
        updatedAt: 1,
      })
      .run()
    expect(modelOf(db, 'conciv_m')).toBe('haiku')
  })

  it('run messages and replies round-trip typed JSON and overwrite by key', () => {
    const db = fresh()
    setRunMessages(db, 's4', [{id: 'm1', role: 'assistant', parts: []}])
    setRunMessages(db, 's4', [{id: 'm1'}, {id: 'm2'}])
    expect(runMessagesFor(db, 's4')?.messages).toEqual([{id: 'm1'}, {id: 'm2'}])
    writeReply(db, 's4', 'call_1', {answered: false})
    writeReply(db, 's4', 'call_1', {answered: true, value: 'yes'})
    expect(replyFor(db, 's4', 'call_1')).toEqual({answered: true, value: 'yes'})
    expect(replyFor(db, 's4', 'other')).toBeNull()
    expect(replyFor(db, 'other-session', 'call_1')).toBeNull()
  })

  it('clearRunState removes everything for the session only', () => {
    const db = fresh()
    setRunMessages(db, 's5', [{id: 'm', parts: [{type: 'image'}]}])
    foldRichRunMessagesIntoHistory(db, 's5')
    setRunMessages(db, 's5', [{id: 'm'}])
    writeReply(db, 's5', 'k', 1)
    setRunMessages(db, 'other', [{id: 'o'}])
    clearRunState(db, 's5')
    expect(runMessagesFor(db, 's5')).toBeNull()
    expect(sessionHistoryFor(db, 's5')).toBeNull()
    expect(replyFor(db, 's5', 'k')).toBeNull()
    expect(runMessagesFor(db, 'other')?.messages).toEqual([{id: 'o'}])
  })
})

describe('hasRichPart', () => {
  it('is true for a document part', () => {
    expect(
      hasRichPart({parts: [{type: 'document', source: {type: 'data', mimeType: 'application/x-test', value: 'x'}}]}),
    ).toBe(true)
  })

  it('is true for an image part and false for text-only', () => {
    expect(hasRichPart({parts: [{type: 'image'}]})).toBe(true)
    expect(hasRichPart({parts: [{type: 'text', content: 'hi'}]})).toBe(false)
  })

  it('folds a document-part turn into durable session history', () => {
    const db = fresh()
    const messages = [
      {id: 'm', parts: [{type: 'document', source: {type: 'data', mimeType: 'application/x-test', value: 'x'}}]},
    ]
    setRunMessages(db, 's6', messages)
    foldRichRunMessagesIntoHistory(db, 's6')
    expect(sessionHistoryFor(db, 's6')?.messages).toEqual(messages)
  })
})
