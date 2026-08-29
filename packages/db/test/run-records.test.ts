import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb} from '../src/db.js'
import {createRunStore} from '../src/run-store.js'
import {
  foldRichRunMessagesIntoHistory,
  foldRunMessagesIntoHistory,
  historyAnchorFor,
  setRunMessages,
} from '../src/run-queries.js'

const fresh = () => openDb(mkdtempSync(join(tmpdir(), 'conciv-run-records-')))
const freshStore = () => createRunStore(fresh())
const stateRoot = () => mkdtempSync(join(tmpdir(), 'conciv-run-restart-'))

describe('durable run records', () => {
  it('round-trips a terminal run record through the migrated schema', async () => {
    const store = freshStore()
    await store.createOrResume({runId: 'run-a', threadId: 's1', startedAt: 1000})
    await store.update('run-a', {status: 'completed', finishedAt: 2000})
    await expect(store.listByThread?.('s1')).resolves.toEqual([
      {runId: 'run-a', threadId: 's1', status: 'completed', startedAt: 1000, finishedAt: 2000},
    ])
  })

  it('keeps the terminal error of a failed run', async () => {
    const store = freshStore()
    await store.createOrResume({runId: 'run-b', threadId: 's2', startedAt: 10})
    await store.update('run-b', {
      status: 'failed',
      finishedAt: 20,
      error: {message: 'claude produced no output within 5s'},
    })
    await expect(store.get('run-b')).resolves.toMatchObject({
      error: {message: 'claude produced no output within 5s'},
    })
  })

  it('advances one run record from running to its terminal phase instead of appending a second row', async () => {
    const store = freshStore()
    await store.createOrResume({runId: 'run-c', threadId: 's3', startedAt: 5})
    const started = await store.get('run-c')
    expect(started?.status).toBe('running')
    expect(started?.finishedAt).toBeUndefined()
    await store.update('run-c', {status: 'completed', finishedAt: 9})
    await expect(store.listByThread?.('s3')).resolves.toMatchObject([
      {runId: 'run-c', status: 'completed', finishedAt: 9},
    ])
  })

  it('returns the newest run of a session last', async () => {
    const store = freshStore()
    await store.createOrResume({runId: 'old', threadId: 's4', startedAt: 1})
    await store.update('old', {status: 'completed', finishedAt: 2})
    await store.createOrResume({runId: 'new', threadId: 's4', startedAt: 3})
    await store.update('new', {status: 'completed', finishedAt: 4})
    const listed = await store.listByThread?.('s4')
    expect(listed?.at(-1)?.runId).toBe('new')
  })

  it('survives reopening the database over the same state root', async () => {
    const root = stateRoot()
    const first = createRunStore(openDb(root))
    await first.createOrResume({runId: 'run-d', threadId: 's5', startedAt: 100})
    await first.update('run-d', {status: 'completed', finishedAt: 200})
    await expect(createRunStore(openDb(root)).get('run-d')).resolves.toMatchObject({
      runId: 'run-d',
      status: 'completed',
      finishedAt: 200,
    })
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
