import {asc, eq} from 'drizzle-orm'
import {describe, expect, it} from 'vitest'
import {markers, statusOf} from '@conciv/db'
import {makeChatFixture} from '../helpers/chat-fixture.js'
import {makeCompactor} from '../../src/chat/run.js'

describe('compactor', () => {
  it('runs a compact run, writes marker, status is compacting during the run', async () => {
    const {chat, db, sessionId, harness} = await makeChatFixture()
    const compactor = makeCompactor(chat)
    harness.__scripted.hold()
    const run = compactor.run(sessionId)
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(statusOf(db, sessionId)).toBe('compacting')
    harness.__scripted.release()
    await run
    expect(statusOf(db, sessionId)).toBe('idle')
    const kinds = (
      await db.select().from(markers).where(eq(markers.sessionId, sessionId)).orderBy(asc(markers.afterTurn))
    ).map((marker) => marker.kind)
    expect(kinds).toContain('compact')
  })

  it('rejects a concurrent run as busy', async () => {
    const {chat, sessionId, harness} = await makeChatFixture()
    const compactor = makeCompactor(chat)
    harness.__scripted.hold()
    const run = compactor.run(sessionId)
    await expect(compactor.run(sessionId)).rejects.toThrow(/busy/)
    harness.__scripted.release()
    await run
  })
})
