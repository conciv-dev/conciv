import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {aguiSnapshotFor} from '@conciv/protocol/ui-types'
import {asSnapshot, assistantTexts, userTexts} from '../helpers/snapshots.js'
import {SCRIPTED_REPLY, useFakeSessions} from '../helpers/fake-session.js'

describe('chat.hydrate serves a thread and the run still generating on it (IT)', () => {
  const sessions = useFakeSessions()

  it('a session nobody has written to hydrates empty with no active run', {timeout: 60_000}, async () => {
    const {kit, sessionId} = await sessions.open()

    const hydration = await kit.rpc.chat.hydrate({sessionId})

    expect(hydration.messages).toEqual([])
    expect(hydration.activeRun).toBeNull()
    expect(hydration.interrupts).toBeNull()
  })

  it('a settled turn hydrates as the stored transcript with no active run', {timeout: 60_000}, async () => {
    const {kit, sessionId, keeper} = await sessions.open()

    await kit.turn('turn one', {session: sessionId, runId: 'hydrate-settled'})
    await keeper.done({hangGuardMs: 15_000})

    const hydration = await kit.rpc.chat.hydrate({sessionId})
    const view = asSnapshot(aguiSnapshotFor(hydration.messages))

    expect(userTexts(view)).toEqual(['turn one'])
    expect(assistantTexts(view)).toEqual([SCRIPTED_REPLY])
    expect(hydration.activeRun).toBeNull()
  })

  it('a run held mid-turn hydrates as the active run and settles to null', {timeout: 60_000}, async () => {
    const {kit, harness, sessionId, keeper} = await sessions.open()

    harness.script.hold()
    await kit.turn('turn one', {session: sessionId, runId: 'hydrate-live'})
    await keeper.waitFor((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT, {hangGuardMs: 15_000})

    expect(await kit.rpc.chat.hydrate({sessionId})).toMatchObject({activeRun: {runId: 'hydrate-live'}})

    harness.script.release()
    await keeper.done({hangGuardMs: 15_000})

    expect((await kit.rpc.chat.hydrate({sessionId})).activeRun).toBeNull()
  })
})
