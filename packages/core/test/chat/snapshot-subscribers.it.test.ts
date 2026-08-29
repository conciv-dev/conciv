import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {asSnapshot, reconstructTranscript, reconstructUserTexts, userTexts} from '../helpers/snapshots.js'
import {SCRIPTED_REPLY, useFakeSessions} from '../helpers/fake-session.js'

describe('every live subscriber reconstructs the same transcript (IT)', () => {
  const sessions = useFakeSessions()

  it(
    'T7: a subscriber attaching mid-run catches up without disturbing the running one',
    {timeout: 60_000},
    async () => {
      const {kit, harness, sessionId, keeper} = await sessions.open()

      await kit.turn('turn one', {session: sessionId, runId: 'midrun-1'})
      await keeper.done({hangGuardMs: 15_000})

      harness.script.hold()
      await kit.turn('turn two', {session: sessionId, runId: 'midrun-2'})
      await keeper.waitForRunStart()

      const latecomer = await kit.events(sessionId)
      const catchUp = asSnapshot(
        await latecomer.waitFor((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT, {hangGuardMs: 10_000}),
      )
      expect(userTexts(catchUp)).toEqual(['turn one', 'turn two'])
      harness.script.release()

      const keeperEvents = await keeper.done({hangGuardMs: 15_000})
      const latecomerEvents = await latecomer.done({hangGuardMs: 15_000})

      expect(keeperEvents.runs()).toBe(2)
      expect(reconstructTranscript(keeperEvents.all)).toEqual([
        'user: turn one',
        `assistant: ${SCRIPTED_REPLY}`,
        'user: turn two',
        `assistant: ${SCRIPTED_REPLY}`,
      ])
      expect(reconstructUserTexts(latecomerEvents.all)).toEqual(['turn one', 'turn two'])
      expect(latecomerEvents.text()).toContain(SCRIPTED_REPLY)
    },
  )

  it('T8: two subscribers live across a whole turn agree on the transcript', {timeout: 60_000}, async () => {
    const {kit, sessionId, keeper} = await sessions.open()
    const second = await kit.turn('watched turn', {session: sessionId, runId: 'twowatchers-1'})
    const keeperEvents = await keeper.done({hangGuardMs: 15_000})
    const secondEvents = await second.done({hangGuardMs: 15_000})

    expect(reconstructTranscript(keeperEvents.all)).toEqual(['user: watched turn', `assistant: ${SCRIPTED_REPLY}`])
    expect(reconstructTranscript(secondEvents.all)).toEqual(reconstructTranscript(keeperEvents.all))
  })
})
