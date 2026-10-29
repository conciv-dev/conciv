import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb} from '../src/db.js'
import {deleteThread, pendingThreadIds, readThread, threadMessages, updateThread} from '../src/thread-queries.js'

const fresh = () => openDb(mkdtempSync(join(tmpdir(), 'conciv-thread-')))

describe('the chat thread store', () => {
  it('reads an empty state for a thread that was never written', () => {
    const db = fresh()
    expect(readThread(db, 't1')).toEqual({messages: [], pendingFrom: null, anchor: null})
  })

  it('round-trips messages, the pending marker and the anchor', () => {
    const db = fresh()
    updateThread(db, 't2', (state) => ({
      messages: [...state.messages, {role: 'user', content: 'one'}],
      pendingFrom: 0,
      anchor: {nativeId: 'native-2'},
    }))
    expect(readThread(db, 't2')).toEqual({
      messages: [{role: 'user', content: 'one'}],
      pendingFrom: 0,
      anchor: {nativeId: 'native-2'},
    })
    expect(threadMessages(db, 't2')).toEqual([{role: 'user', content: 'one'}])
  })

  it('clears the pending marker and the anchor when the fold returns null for them', () => {
    const db = fresh()
    updateThread(db, 't3', () => ({messages: [], pendingFrom: 2, anchor: {nativeId: null}}))
    expect(readThread(db, 't3').anchor).toEqual({nativeId: null})
    updateThread(db, 't3', (state) => ({...state, pendingFrom: null, anchor: null}))
    expect(readThread(db, 't3')).toEqual({messages: [], pendingFrom: null, anchor: null})
  })

  it('lists exactly the threads that carry a pending marker', () => {
    const db = fresh()
    updateThread(db, 'conciv_a', () => ({messages: [], pendingFrom: 0, anchor: null}))
    updateThread(db, 'conciv_b', () => ({messages: [], pendingFrom: null, anchor: {nativeId: 'n'}}))
    expect(pendingThreadIds(db)).toEqual(['conciv_a'])
  })

  it('deleteThread removes the messages, the marker and the anchor', () => {
    const db = fresh()
    updateThread(db, 't4', () => ({messages: [{role: 'user', content: 'x'}], pendingFrom: 0, anchor: {nativeId: 'n'}}))
    deleteThread(db, 't4')
    expect(readThread(db, 't4')).toEqual({messages: [], pendingFrom: null, anchor: null})
    expect(pendingThreadIds(db)).toEqual([])
  })
})
