import {describe, expect, it} from 'vitest'
import {startTurn} from '../helpers/detached-turn.js'
import {stopSession} from '../../src/chat/stop.js'
import {makeChatFixture} from '../helpers/chat-fixture.js'

describe('a user stop is distinguishable from a disconnect (IT)', () => {
  it('records the cancel on the run record rather than a detach', {timeout: 20_000}, async () => {
    const fixture = await makeChatFixture()
    try {
      const runId = 'stop-cancel-reason-1'
      await startTurn(fixture.chat, fixture.sessionId, runId, 'hang around')
      await stopSession(fixture.chat, fixture.sessionId)
      const record = await fixture.chat.runs.get(runId)
      expect(record).toMatchObject({cancelRequested: true})
      expect(record?.detachedSince ?? null).toBeNull()
    } finally {
      await fixture.dispose()
    }
  })
})
