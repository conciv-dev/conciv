import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {userTexts} from '../helpers/snapshots.js'
import {freshSubscriberSnapshot, useFakeSessions} from '../helpers/fake-session.js'

describe('compaction over a database-owned transcript (IT)', () => {
  const sessions = useFakeSessions()

  it('T10: the marker lands after the accumulated turns and compaction drops them', {timeout: 60_000}, async () => {
    const {kit, sessionId, keeper} = await sessions.open()

    await kit.turn('turn one', {session: sessionId, runId: 'compact-1'})
    await keeper.done({hangGuardMs: 15_000})
    await kit.turn('turn two', {session: sessionId, runId: 'compact-2'})
    await keeper.done({hangGuardMs: 15_000})

    await kit.rpc.sessions.compact({sessionId})

    const markers = await kit.rpc.markers.list({sessionId})
    expect(markers.filter((marker) => marker.kind === 'compact').map((marker) => marker.afterTurn)).toEqual([4])

    await kit.turn('turn three after compaction', {session: sessionId, runId: 'compact-3'})
    await keeper.waitFor((chunk) => chunk.type === EventType.RUN_FINISHED, {hangGuardMs: 15_000})

    const snapshot = await freshSubscriberSnapshot(kit, sessionId)
    expect(userTexts(snapshot)).toEqual(['turn three after compaction'])
  })
})
