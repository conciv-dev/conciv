import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb, runMessages, runMessagesFor, sessionHistory, sessionHistoryFor} from '@conciv/db'
import {clearRunState} from '../src/run-store.js'
import {readThread, updateThread} from '../src/thread-queries.js'

const fresh = () => openDb(mkdtempSync(join(tmpdir(), 'conciv-run-')))

describe('run lifecycle queries', () => {
  it('clearRunState drops the thread, its markers and the legacy rows for that session only', () => {
    const db = fresh()
    updateThread(db, 's5', () => ({
      messages: [{role: 'user', content: 'gone'}],
      pendingFrom: 0,
      anchor: {nativeId: 'native-5'},
    }))
    updateThread(db, 'other', () => ({
      messages: [{role: 'user', content: 'kept'}],
      pendingFrom: null,
      anchor: null,
    }))
    db.insert(runMessages)
      .values({sessionId: 's5', messages: [{id: 'legacy'}], updatedAt: 1})
      .run()
    db.insert(sessionHistory)
      .values({sessionId: 's5', messages: [{id: 'legacy'}], updatedAt: 1})
      .run()

    clearRunState(db, 's5')

    expect(readThread(db, 's5')).toEqual({messages: [], pendingFrom: null, anchor: null})
    expect(runMessagesFor(db, 's5')).toBeNull()
    expect(sessionHistoryFor(db, 's5')).toBeNull()
    expect(readThread(db, 'other').messages).toEqual([{role: 'user', content: 'kept'}])
  })
})
