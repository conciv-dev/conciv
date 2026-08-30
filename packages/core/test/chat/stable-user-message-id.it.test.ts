import {describe, it, expect} from 'vitest'
import {userMessageIds} from '../helpers/snapshots.js'
import {hydratedSnapshot, useFakeSessions} from '../helpers/fake-session.js'

describe('the user message id the client minted survives the run (IT)', () => {
  const sessions = useFakeSessions()

  it('hydrates the client id instead of a freshly minted one', {timeout: 60_000}, async () => {
    const {kit, sessionId} = await sessions.open()

    const turn = await kit.turn('keep my id', {session: sessionId, runId: 'stable-id-1', messageId: 'client-minted-1'})
    await turn.done({hangGuardMs: 15_000})

    expect(userMessageIds(await hydratedSnapshot(kit, sessionId))).toEqual(['client-minted-1'])
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
    await second.done({hangGuardMs: 15_000})

    expect(userMessageIds(await hydratedSnapshot(kit, sessionId))).toEqual([
      'client-minted-first',
      'client-minted-second',
    ])
  })
})
