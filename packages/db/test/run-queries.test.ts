import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb} from '../src/db.js'
import {clearRunState, modelOf, runMessagesFor, sessionHistoryFor} from '../src/run-queries.js'
import {readThread, updateThread} from '../src/thread-queries.js'
import {runMessages, sessionHistory} from '../src/run-schema.js'
import {sessions} from '../src/schema.js'

const fresh = () => openDb(mkdtempSync(join(tmpdir(), 'conciv-run-')))

describe('run lifecycle queries', () => {
  it('reads fall back safely for unknown sessions', () => {
    const db = fresh()
    expect(modelOf(db, 'missing')).toBeNull()
    expect(runMessagesFor(db, 'missing')).toBeNull()
    expect(sessionHistoryFor(db, 'missing')).toBeNull()
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
