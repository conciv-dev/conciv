import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb, runMessages, runMessagesFor, sessions, type ConcivDb} from '@conciv/db'
import {createRunStore} from '../src/run-store.js'

function seedRunMessages(db: ConcivDb, sessionId: string, messages: unknown[]): void {
  db.insert(runMessages).values({sessionId, messages, updatedAt: 1}).run()
}

const record = (id: string) => ({
  id,
  harnessSessionId: null,
  harnessKind: 'claude',
  origin: 'chat' as const,
  title: null,
  model: null,
  usage: null,
  cwd: '/w',
  createdAt: 1,
  updatedAt: 1,
})

describe('openDb', () => {
  it('boot detach hands a stuck run to the reclaim sweep, leaving session and run rows alone', async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-db-sweep-'))
    const first = openDb(stateRoot)
    first
      .insert(sessions)
      .values({...record('conciv_z'), title: 'keep'})
      .run()
    await createRunStore(first).createOrResume({runId: 'run-stuck', threadId: 'conciv_z', startedAt: Date.now()})
    seedRunMessages(first, 'conciv_z', [{id: 'm1'}])
    const second = openDb(stateRoot)
    expect(second.select().from(sessions).all()[0]?.title).toBe('keep')
    const reclaimable = await createRunStore(second).listReclaimable?.({now: Date.now(), ttlMs: 0})
    expect(reclaimable?.map((run) => run.runId)).toEqual(['run-stuck'])
    expect(runMessagesFor(second, 'conciv_z')?.messages).toEqual([{id: 'm1'}])
  })
})
