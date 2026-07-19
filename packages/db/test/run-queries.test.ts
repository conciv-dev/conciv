import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb} from '../src/db.js'
import {
  claimRun,
  clearImageHistory,
  clearRunState,
  foldRunMessagesIntoImageHistory,
  imageHistoryFor,
  lastErrorForEpoch,
  modelOf,
  releaseRun,
  replyFor,
  requestStop,
  runEpochOf,
  runMessagesFor,
  setRunMessages,
  statusOf,
  writeReply,
} from '../src/run-queries.js'
import {sessions} from '../src/schema.js'

const fresh = () => openDb(mkdtempSync(join(tmpdir(), 'conciv-run-')))

describe('run lifecycle queries', () => {
  it('claimRun is atomic, bumps runEpoch, and clears prior run rows', () => {
    const db = fresh()
    setRunMessages(db, 's1', [{id: 'stale'}])
    writeReply(db, 's1', 'stale-key', true)
    expect(runEpochOf(db, 's1')).toBe(0)
    expect(claimRun(db, 's1', 'chat')).toBe(1)
    expect(claimRun(db, 's1', 'chat')).toBeNull()
    expect(statusOf(db, 's1')).toBe('running')
    expect(runEpochOf(db, 's1')).toBe(1)
    expect(runMessagesFor(db, 's1')).toBeNull()
    expect(replyFor(db, 's1', 'stale-key')).toBeNull()
    releaseRun(db, 's1', null)
    expect(statusOf(db, 's1')).toBe('idle')
    expect(claimRun(db, 's1', 'compact')).toBe(2)
    expect(statusOf(db, 's1')).toBe('compacting')
  })

  it('fold moves image-bearing run messages into image history and clears the run row', () => {
    const db = fresh()
    const imageTurn = [
      {id: 'u1', role: 'user', parts: [{type: 'image', source: {type: 'data', value: 'aGk=', mimeType: 'image/png'}}]},
      {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'red'}]},
    ]
    setRunMessages(db, 's6', imageTurn)
    foldRunMessagesIntoImageHistory(db, 's6')
    expect(runMessagesFor(db, 's6')).toBeNull()
    expect(imageHistoryFor(db, 's6')?.messages).toEqual(imageTurn)
  })

  it('fold keeps appending once image history exists, even for text-only runs', () => {
    const db = fresh()
    const imageTurn = [{id: 'u1', role: 'user', parts: [{type: 'image', source: {type: 'data'}}]}]
    const textTurn = [{id: 'u2', role: 'user', parts: [{type: 'text', content: 'follow up'}]}]
    setRunMessages(db, 's7', imageTurn)
    foldRunMessagesIntoImageHistory(db, 's7')
    setRunMessages(db, 's7', textTurn)
    foldRunMessagesIntoImageHistory(db, 's7')
    expect(runMessagesFor(db, 's7')).toBeNull()
    expect(imageHistoryFor(db, 's7')?.messages).toEqual([...imageTurn, ...textTurn])
  })

  it('fold leaves text-only runs alone when no image history exists', () => {
    const db = fresh()
    setRunMessages(db, 's8', [{id: 'u1', role: 'user', parts: [{type: 'text', content: 'plain'}]}])
    foldRunMessagesIntoImageHistory(db, 's8')
    expect(runMessagesFor(db, 's8')?.messages).toEqual([
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'plain'}]},
    ])
    expect(imageHistoryFor(db, 's8')).toBeNull()
  })

  it('clearImageHistory drops only the image history row', () => {
    const db = fresh()
    setRunMessages(db, 's9', [{id: 'u1', role: 'user', parts: [{type: 'image', source: {}}]}])
    foldRunMessagesIntoImageHistory(db, 's9')
    setRunMessages(db, 's9', [{id: 'live'}])
    clearImageHistory(db, 's9')
    expect(imageHistoryFor(db, 's9')).toBeNull()
    expect(runMessagesFor(db, 's9')?.messages).toEqual([{id: 'live'}])
  })

  it('releaseRun keys lastError to its epoch and it survives the next claim', () => {
    const db = fresh()
    claimRun(db, 's2', 'chat')
    releaseRun(db, 's2', 'boom')
    expect(lastErrorForEpoch(db, 's2', 1)).toBe('boom')
    claimRun(db, 's2', 'chat')
    expect(lastErrorForEpoch(db, 's2', 1)).toBe('boom')
    expect(lastErrorForEpoch(db, 's2', 2)).toBeNull()
    releaseRun(db, 's2', null)
    expect(lastErrorForEpoch(db, 's2', 1)).toBeNull()
    expect(lastErrorForEpoch(db, 's2', 2)).toBeNull()
  })

  it('requestStop only flips a live run', () => {
    const db = fresh()
    expect(requestStop(db, 's3')).toBe(false)
    claimRun(db, 's3', 'chat')
    expect(requestStop(db, 's3')).toBe(true)
    expect(statusOf(db, 's3')).toBe('stopping')
    expect(requestStop(db, 's3')).toBe(false)
    releaseRun(db, 's3')
    expect(statusOf(db, 's3')).toBe('idle')
  })

  it('reads fall back safely for unknown sessions', () => {
    const db = fresh()
    expect(statusOf(db, 'missing')).toBe('idle')
    expect(runEpochOf(db, 'missing')).toBe(0)
    expect(lastErrorForEpoch(db, 'missing', 1)).toBeNull()
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
    claimRun(db, 's5', 'chat')
    setRunMessages(db, 's5', [{id: 'm', parts: [{type: 'image'}]}])
    foldRunMessagesIntoImageHistory(db, 's5')
    setRunMessages(db, 's5', [{id: 'm'}])
    writeReply(db, 's5', 'k', 1)
    setRunMessages(db, 'other', [{id: 'o'}])
    clearRunState(db, 's5')
    expect(statusOf(db, 's5')).toBe('idle')
    expect(runMessagesFor(db, 's5')).toBeNull()
    expect(imageHistoryFor(db, 's5')).toBeNull()
    expect(replyFor(db, 's5', 'k')).toBeNull()
    expect(runMessagesFor(db, 'other')?.messages).toEqual([{id: 'o'}])
  })
})
