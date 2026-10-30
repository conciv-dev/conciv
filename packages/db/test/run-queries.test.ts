import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb} from '../src/db.js'
import {modelOf, runMessagesFor, sessionHistoryFor} from '../src/run-queries.js'
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
})
