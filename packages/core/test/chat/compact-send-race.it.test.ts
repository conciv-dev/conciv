import {describe, it, expect} from 'vitest'
import {type StreamChunk} from '@tanstack/ai'
import {until} from '@conciv/harness-testkit'
import {userTexts} from '../helpers/snapshots.js'
import {collectChunks, peakLiveRuns, runsFinished, runsStarted} from '../helpers/run-tally.js'
import {freshSubscriberSnapshot, useFakeSessions} from '../helpers/fake-session.js'

const PARKED_RUN_MS = 150

describe('compaction shares the per-session run chain (IT)', () => {
  const sessions = useFakeSessions()

  it('T11: a compact fired while a chat run is live never overlaps it', {timeout: 60_000}, async () => {
    const {kit, harness, sessionId} = await sessions.open()
    const seen: StreamChunk[] = []
    const watching = new AbortController()
    const stream = await kit.rpc.chat.events({sessionId}, {signal: watching.signal})
    void collectChunks(stream, seen)

    harness.script.hold()
    await kit.turn('chat turn racing a compact', {session: sessionId, runId: 'compact-race-chat'})
    await until(() => runsStarted(seen) === 1, {hangGuardMs: 15_000})

    setTimeout(() => harness.script.release(), PARKED_RUN_MS)
    await kit.rpc.sessions.compact({sessionId})
    await until(() => runsFinished(seen) === 2, {hangGuardMs: 15_000})

    expect(peakLiveRuns(seen)).toBe(1)

    await kit.turn('turn after compaction', {session: sessionId, runId: 'compact-race-after'})
    await until(() => runsFinished(seen) === 3, {hangGuardMs: 15_000})
    watching.abort()

    const snapshot = await freshSubscriberSnapshot(kit, sessionId)
    expect(userTexts(snapshot)).toEqual(['turn after compaction'])
  })
})
