import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {assistantTexts, asSnapshot} from '../helpers/snapshots.js'
import {SCRIPTED_REPLY, useFakeSessions} from '../helpers/fake-session.js'

describe('a subscriber joining a run that is parked mid-turn (IT)', () => {
  const sessions = useFakeSessions()

  it('T1: the catch-up snapshot carries the streamed text and nothing replays it', {timeout: 60_000}, async () => {
    const {kit, harness, sessionId, keeper} = await sessions.open()

    harness.script.hold()
    await kit.rpc.chat.send({runId: 'parked-1', sessionId, text: 'turn one'})
    await keeper.waitFor((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT, {hangGuardMs: 15_000})

    const latecomer = await kit.attach(sessionId)
    const catchUp = asSnapshot(
      await latecomer.waitFor((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT, {hangGuardMs: 10_000}),
    )
    expect(assistantTexts(catchUp)).toEqual([SCRIPTED_REPLY])
    await latecomer.waitForRunStart()

    harness.script.release()
    const latecomerEvents = await latecomer.done({hangGuardMs: 15_000})

    expect(latecomerEvents.all.filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)).toEqual([])
    expect(latecomerEvents.text()).toBe(SCRIPTED_REPLY)
  })
})
