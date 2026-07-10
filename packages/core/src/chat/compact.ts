import {randomUUID} from 'node:crypto'
import {claimRun, markers, releaseRun, type ConcivDb} from '@conciv/db'
import type {ChatDeps} from './runtime.js'
import {toModelMessages} from './history.js'
import {startRun} from './run.js'
import {transcriptMessages} from './attach.js'

export const SESSION_BUSY = 'session busy'

export type Compactor = {run: (sessionId: string) => Promise<void>}

async function addCompactMarker(db: ConcivDb, sessionId: string, afterTurn: number): Promise<void> {
  await db.insert(markers).values({id: randomUUID(), sessionId, afterTurn, kind: 'compact'})
}

export function makeCompactor(deps: ChatDeps): Compactor {
  async function run(sessionId: string): Promise<void> {
    if (!claimRun(deps.db, sessionId, 'compact')) throw new Error(SESSION_BUSY)
    deps.changes.notify()
    try {
      deps.onRunStart?.(sessionId)
      const history = await transcriptMessages(deps, sessionId)
      await addCompactMarker(deps.db, sessionId, history.length)
      deps.changes.notify()
    } catch (error) {
      releaseRun(deps.db, sessionId, null)
      deps.changes.notify()
      throw error
    }
    await startRun(deps, sessionId, {
      messages: toModelMessages([{role: 'user', content: '/compact'}]),
      model: null,
      kind: 'compact',
    })
  }

  return {run}
}
