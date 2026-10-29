import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {SCRIPTED_REPLY, useFakeSessions} from '../helpers/fake-session.js'

function textDeltas(chunks: readonly StreamChunk[]): string[] {
  return chunks.flatMap((chunk) =>
    chunk.type === EventType.TEXT_MESSAGE_CONTENT && typeof chunk.delta === 'string' ? [chunk.delta] : [],
  )
}

describe('joining a run that is parked mid-turn (IT)', () => {
  const sessions = useFakeSessions()

  it('T1: the joiner catches up on what already streamed and nothing replays twice', {timeout: 60_000}, async () => {
    const {kit, harness, sessionId} = await sessions.open()

    harness.script.hold()
    const owner = await kit.turn('turn one', {session: sessionId, runId: 'parked-1'})
    await owner.waitFor((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT, {hangGuardMs: 15_000})

    const latecomer = kit.join('parked-1')
    await latecomer.waitForRunStart()

    harness.script.release()
    const latecomerEvents = await latecomer.done({hangGuardMs: 15_000})
    const ownerEvents = await owner.done({hangGuardMs: 15_000})

    expect(latecomerEvents.text()).toBe(SCRIPTED_REPLY)
    expect(textDeltas(latecomerEvents.all)).toEqual(textDeltas(ownerEvents.all))
  })
})
