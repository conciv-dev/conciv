import {asc, eq} from 'drizzle-orm'
import {describe, expect, it} from 'vitest'
import type {RunRecord} from '@tanstack/ai'
import {markers} from '@conciv/db'
import {makeChatFixture} from '../helpers/chat-fixture.js'
import {makeCompactor} from '../../src/chat/run.js'

function overlapping(records: readonly RunRecord[]): boolean {
  const spans = records
    .map((record) => ({from: record.startedAt, to: record.finishedAt ?? Number.POSITIVE_INFINITY}))
    .toSorted((left, right) => left.from - right.from)
  return spans.some((span, index) => index > 0 && span.from < (spans[index - 1]?.to ?? 0))
}

describe('compactor', () => {
  it('runs a compact run, writes marker, session reports running during the run', async () => {
    const {chat, db, sessionId, harness} = await makeChatFixture()
    const compactor = makeCompactor(chat)
    harness.script.hold()
    const run = compactor.run(sessionId)
    await new Promise((resolve) => setTimeout(resolve, 25))
    await expect(chat.runs.findActiveRun(sessionId)).resolves.not.toBeNull()
    harness.script.release()
    await run
    await expect(chat.runs.findActiveRun(sessionId)).resolves.toBeNull()
    const kinds = (
      await db.select().from(markers).where(eq(markers.sessionId, sessionId)).orderBy(asc(markers.afterTurn))
    ).map((marker) => marker.kind)
    expect(kinds).toContain('compact')
  })

  it('concurrent compacts serialize: both settle, never two live runs at once', async () => {
    const {chat, db, sessionId} = await makeChatFixture()
    const compactor = makeCompactor(chat)
    await Promise.all([compactor.run(sessionId), compactor.run(sessionId)])
    const records = (await chat.runs.listByThread?.(sessionId)) ?? []
    expect(records).toHaveLength(2)
    expect(overlapping(records)).toBe(false)
    const kinds = (await db.select().from(markers).where(eq(markers.sessionId, sessionId))).map((marker) => marker.kind)
    expect(kinds.filter((kind) => kind === 'compact')).toHaveLength(2)
  })
})
