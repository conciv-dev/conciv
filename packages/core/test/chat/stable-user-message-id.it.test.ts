import {describe, it, expect} from 'vitest'
import {lastSnapshot, userMessageIds} from '../helpers/snapshots.js'
import {useFakeSessions} from '../helpers/fake-session.js'

describe('the user message id the client minted survives the run (IT)', () => {
  const sessions = useFakeSessions()

  it('publishes the client id in the snapshot instead of a freshly minted one', {timeout: 60_000}, async () => {
    const {kit, sessionId} = await sessions.open()

    const turn = await kit.turn('keep my id', {session: sessionId, runId: 'stable-id-1', messageId: 'client-minted-1'})
    const events = await turn.done({hangGuardMs: 15_000})

    expect(userMessageIds(lastSnapshot(events.all))).toEqual(['client-minted-1'])
  })

  it('keeps every turn id stable across a second run in the same session', {timeout: 60_000}, async () => {
    const {kit, sessionId} = await sessions.open()

    const first = await kit.turn('first', {session: sessionId, runId: 'stable-id-2', messageId: 'client-minted-first'})
    await first.done({hangGuardMs: 15_000})

    const second = await kit.turn('second', {
      session: sessionId,
      runId: 'stable-id-3',
      messageId: 'client-minted-second',
    })
    const events = await second.done({hangGuardMs: 15_000})

    expect(userMessageIds(lastSnapshot(events.all))).toEqual(['client-minted-first', 'client-minted-second'])
  })
})
