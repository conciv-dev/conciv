import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb} from '../src/db.js'
import {
  foldRichRunMessagesIntoHistory,
  foldRunMessagesIntoHistory,
  historyAnchorFor,
  latestRunLifecycleFor,
  recordRunLifecycle,
  setRunMessages,
} from '../src/run-queries.js'

const fresh = () => openDb(mkdtempSync(join(tmpdir(), 'conciv-run-records-')))
const stateRoot = () => mkdtempSync(join(tmpdir(), 'conciv-run-restart-'))

describe('durable run records', () => {
  it('round-trips a terminal run record through the migrated schema', () => {
    const db = fresh()
    recordRunLifecycle(db, 's1', {
      runId: 'run-a',
      phase: 'completed',
      startedAt: 1000,
      finishedAt: 2000,
      serverNow: 2000,
      error: null,
    })
    const read = latestRunLifecycleFor(db, 's1')
    expect(read).toMatchObject({runId: 'run-a', phase: 'completed', startedAt: 1000, finishedAt: 2000, error: null})
  })

  it('keeps the terminal error of a failed run', () => {
    const db = fresh()
    recordRunLifecycle(db, 's2', {
      runId: 'run-b',
      phase: 'failed',
      startedAt: 10,
      finishedAt: 20,
      serverNow: 20,
      error: 'claude produced no output within 5s',
    })
    expect(latestRunLifecycleFor(db, 's2')?.error).toBe('claude produced no output within 5s')
  })

  it('advances one run record from running to its terminal phase instead of appending a second row', () => {
    const db = fresh()
    const started = {
      runId: 'run-c',
      phase: 'running',
      startedAt: 5,
      finishedAt: null,
      serverNow: 5,
      error: null,
    } as const
    recordRunLifecycle(db, 's3', started)
    expect(latestRunLifecycleFor(db, 's3')).toMatchObject({phase: 'running', finishedAt: null})
    recordRunLifecycle(db, 's3', {...started, phase: 'completed', finishedAt: 9, serverNow: 9})
    expect(latestRunLifecycleFor(db, 's3')).toMatchObject({runId: 'run-c', phase: 'completed', finishedAt: 9})
  })

  it('returns the newest run of a session', () => {
    const db = fresh()
    recordRunLifecycle(db, 's4', {
      runId: 'old',
      phase: 'completed',
      startedAt: 1,
      finishedAt: 2,
      serverNow: 2,
      error: null,
    })
    recordRunLifecycle(db, 's4', {
      runId: 'new',
      phase: 'completed',
      startedAt: 3,
      finishedAt: 4,
      serverNow: 4,
      error: null,
    })
    expect(latestRunLifecycleFor(db, 's4')?.runId).toBe('new')
  })

  it('survives reopening the database over the same state root', () => {
    const root = stateRoot()
    const first = openDb(root)
    recordRunLifecycle(first, 's5', {
      runId: 'run-d',
      phase: 'completed',
      startedAt: 100,
      finishedAt: 200,
      serverNow: 200,
      error: null,
    })
    const second = openDb(root)
    expect(latestRunLifecycleFor(second, 's5')).toMatchObject({runId: 'run-d', phase: 'completed', finishedAt: 200})
  })

  it('marks a run left mid-flight by a dead server as aborted when the database reopens', () => {
    const root = stateRoot()
    const first = openDb(root)
    recordRunLifecycle(first, 's6', {
      runId: 'run-e',
      phase: 'running',
      startedAt: 100,
      finishedAt: null,
      serverNow: 100,
      error: null,
    })
    const second = openDb(root)
    const recovered = latestRunLifecycleFor(second, 's6')
    expect(recovered?.phase).toBe('aborted')
    expect(recovered?.finishedAt).not.toBeNull()
  })
})

describe('the transcript merge anchor', () => {
  it('records the native anchor when a run folds into history', () => {
    const db = fresh()
    setRunMessages(db, 's7', [{id: 'u1', role: 'user', parts: [{type: 'text', content: 'hi'}]}])
    foldRunMessagesIntoHistory(db, 's7', 'native-7')
    expect(historyAnchorFor(db, 's7')).toEqual({nativeId: 'native-7'})
  })

  it('anchors at nothing when no transcript record preceded the first fold', () => {
    const db = fresh()
    setRunMessages(db, 's7b', [{id: 'u1', role: 'user', parts: [{type: 'text', content: 'hi'}]}])
    foldRunMessagesIntoHistory(db, 's7b', null)
    expect(historyAnchorFor(db, 's7b')).toEqual({nativeId: null})
  })

  it('keeps the first anchor across later folds', () => {
    const db = fresh()
    setRunMessages(db, 's8', [{id: 'u1', role: 'user', parts: [{type: 'text', content: 'one'}]}])
    foldRunMessagesIntoHistory(db, 's8', 'native-first')
    setRunMessages(db, 's8', [{id: 'u2', role: 'user', parts: [{type: 'text', content: 'two'}]}])
    foldRunMessagesIntoHistory(db, 's8', 'native-second')
    expect(historyAnchorFor(db, 's8')).toEqual({nativeId: 'native-first'})
  })

  it('records the anchor through the rich fold as well', () => {
    const db = fresh()
    setRunMessages(db, 's9', [
      {id: 'u1', role: 'user', parts: [{type: 'image', source: {type: 'data', value: 'aGk=', mimeType: 'image/png'}}]},
    ])
    foldRichRunMessagesIntoHistory(db, 's9', 'native-rich')
    expect(historyAnchorFor(db, 's9')).toEqual({nativeId: 'native-rich'})
  })

  it('has no anchor for a session that never folded', () => {
    const db = fresh()
    expect(historyAnchorFor(db, 's10')).toBeNull()
  })
})
