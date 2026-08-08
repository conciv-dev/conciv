import {asc, eq} from 'drizzle-orm'
import {describe, expect, it} from 'vitest'
import {markers} from '@conciv/db'
import {makeChatFixture} from '../helpers/chat-fixture.js'
import {makeCompactor} from '../../src/chat/run.js'

describe('compactor', () => {
  it('runs a compact run, writes marker, session reports running during the run', async () => {
    const {chat, db, sessionId, harness} = await makeChatFixture()
    const compactor = makeCompactor(chat)
    harness.script.hold()
    const run = compactor.run(sessionId)
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(chat.liveRuns.running(sessionId)).toBe(true)
    harness.script.release()
    await run
    expect(chat.liveRuns.running(sessionId)).toBe(false)
    const kinds = (
      await db.select().from(markers).where(eq(markers.sessionId, sessionId)).orderBy(asc(markers.afterTurn))
    ).map((marker) => marker.kind)
    expect(kinds).toContain('compact')
  })

  it('concurrent compacts serialize: both settle, never two live runs at once', async () => {
    const {chat, db, sessionId} = await makeChatFixture()
    const compactor = makeCompactor(chat)
    const tally = {peak: 0}
    const unwatch = chat.liveRuns.onStart(sessionId, () => {
      tally.peak = Math.max(tally.peak, chat.liveRuns.of(sessionId).length)
    })
    await Promise.all([compactor.run(sessionId), compactor.run(sessionId)])
    unwatch()
    expect(tally.peak).toBe(1)
    const kinds = (await db.select().from(markers).where(eq(markers.sessionId, sessionId))).map((marker) => marker.kind)
    expect(kinds.filter((kind) => kind === 'compact')).toHaveLength(2)
  })
})
