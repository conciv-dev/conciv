import {describe, it, expect} from 'vitest'
import {EventType} from '@tanstack/ai'
import {userTexts} from '../helpers/snapshots.js'
import {freshSubscriberSnapshot, useFakeSessions} from '../helpers/fake-session.js'

describe('one live run per session (IT)', () => {
  const sessions = useFakeSessions()

  it('T9: a second send without an intervening stop serializes behind the first', {timeout: 60_000}, async () => {
    const {kit, harness, sessionId, keeper} = await sessions.open()

    harness.script.hold()
    await kit.rpc.chat.send({runId: 'concurrent-1', sessionId, text: 'first concurrent send'})
    await keeper.waitFor((chunk) => chunk.type === EventType.RUN_STARTED, {hangGuardMs: 15_000})

    const second = kit.rpc.chat.send({runId: 'concurrent-2', sessionId, text: 'second concurrent send'})
    harness.script.release()
    await second

    await keeper.done({hangGuardMs: 15_000})
    await keeper.done({hangGuardMs: 15_000})

    const snapshot = await freshSubscriberSnapshot(kit, sessionId)
    expect(userTexts(snapshot)).toEqual(['first concurrent send', 'second concurrent send'])
  })
})
