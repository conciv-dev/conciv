import {describe, it, expect} from 'vitest'
import {userTexts} from '../helpers/snapshots.js'
import {hydratedSnapshot, useFakeSessions} from '../helpers/fake-session.js'

describe('compaction over a database-owned transcript (IT)', () => {
  const sessions = useFakeSessions()

  it('T10: the marker lands after the accumulated turns and compaction drops them', {timeout: 60_000}, async () => {
    const {kit, sessionId} = await sessions.open()

    const first = await kit.turn('turn one', {session: sessionId, runId: 'compact-1'})
    await first.done({hangGuardMs: 15_000})
    const second = await kit.turn('turn two', {session: sessionId, runId: 'compact-2'})
    await second.done({hangGuardMs: 15_000})

    await kit.rpc.sessions.compact({sessionId})

    const markers = await kit.rpc.markers.list({sessionId})
    expect(markers.filter((marker) => marker.kind === 'compact').map((marker) => marker.afterTurn)).toEqual([4])

    const third = await kit.turn('turn three after compaction', {session: sessionId, runId: 'compact-3'})
    await third.done({hangGuardMs: 15_000})

    const snapshot = await hydratedSnapshot(kit, sessionId)
    expect(userTexts(snapshot)).toEqual(['turn three after compaction'])
  })
})
