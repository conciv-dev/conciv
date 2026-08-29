import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {asSnapshot, reconstructTranscript, reconstructUserTexts, userTexts} from '../helpers/snapshots.js'
import {SCRIPTED_REPLY, useFakeSessions} from '../helpers/fake-session.js'

describe('every consumer of a run reconstructs the same transcript (IT)', () => {
  const sessions = useFakeSessions()

  it(
    'T7: joining a run mid-flight catches up without disturbing the turn that owns it',
    {timeout: 60_000},
    async () => {
      const {kit, harness, sessionId} = await sessions.open()

      const first = await kit.turn('turn one', {session: sessionId, runId: 'midrun-1'})
      await first.done({hangGuardMs: 15_000})

      harness.script.hold()
      const second = await kit.turn('turn two', {session: sessionId, runId: 'midrun-2'})
      await second.waitForRunStart()

      const latecomer = kit.join('midrun-2')
      const catchUp = asSnapshot(
        await latecomer.waitFor((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT, {hangGuardMs: 10_000}),
      )
      expect(userTexts(catchUp)).toEqual(['turn one', 'turn two'])
      harness.script.release()

      const ownerEvents = await second.done({hangGuardMs: 15_000})
      const latecomerEvents = await latecomer.done({hangGuardMs: 15_000})

      expect(ownerEvents.runs()).toBe(1)
      expect(reconstructTranscript(ownerEvents.all)).toEqual([
        'user: turn one',
        `assistant: ${SCRIPTED_REPLY}`,
        'user: turn two',
        `assistant: ${SCRIPTED_REPLY}`,
      ])
      expect(reconstructUserTexts(latecomerEvents.all)).toEqual(['turn one', 'turn two'])
      expect(latecomerEvents.text()).toContain(SCRIPTED_REPLY)
    },
  )

  it('T8: the turn that owns a run and a joiner of it agree on the transcript', {timeout: 60_000}, async () => {
    const {kit, harness, sessionId} = await sessions.open()
    harness.script.hold()
    const owner = await kit.turn('watched turn', {session: sessionId, runId: 'twowatchers-1'})
    await owner.waitForRunStart()
    const joiner = kit.join('twowatchers-1')
    harness.script.release()

    const ownerEvents = await owner.done({hangGuardMs: 15_000})
    const joinerEvents = await joiner.done({hangGuardMs: 15_000})

    expect(reconstructTranscript(ownerEvents.all)).toEqual(['user: watched turn', `assistant: ${SCRIPTED_REPLY}`])
    expect(reconstructTranscript(joinerEvents.all)).toEqual(reconstructTranscript(ownerEvents.all))
  })
})
