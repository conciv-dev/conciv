import {describe, it, expect} from 'vitest'
import {lastSnapshot, userMessageIds} from '../helpers/snapshots.js'
import {useFakeSessions} from '../helpers/fake-session.js'

describe('the user message id the client minted survives the run (IT)', () => {
  const sessions = useFakeSessions()

  it('publishes the client id in the snapshot instead of a freshly minted one', {timeout: 60_000}, async () => {
    const {kit, sessionId, keeper} = await sessions.open()

    await kit.rpc.chat.send({runId: 'stable-id-1', sessionId, text: 'keep my id', messageId: 'client-minted-1'})
    const events = await keeper.done({hangGuardMs: 15_000})

    expect(userMessageIds(lastSnapshot(events.all))).toEqual(['client-minted-1'])
  })

  it('keeps every turn id stable across a second run in the same session', {timeout: 60_000}, async () => {
    const {kit, sessionId, keeper} = await sessions.open()

    await kit.rpc.chat.send({runId: 'stable-id-2', sessionId, text: 'first', messageId: 'client-minted-first'})
    await keeper.done({hangGuardMs: 15_000})

    const second = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: 'stable-id-3', sessionId, text: 'second', messageId: 'client-minted-second'})
    const events = await second.done({hangGuardMs: 15_000})

    expect(userMessageIds(lastSnapshot(events.all))).toEqual(['client-minted-first', 'client-minted-second'])
  })
})
