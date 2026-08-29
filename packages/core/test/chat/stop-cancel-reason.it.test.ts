import {describe, expect, it} from 'vitest'
import {isCancelRequestedReason} from '@tanstack/ai'
import {makeSend} from '../../src/chat/run.js'
import {stopSession} from '../../src/chat/stop.js'
import {makeChatFixture} from '../helpers/chat-fixture.js'
import {drivingRun} from '../helpers/run-drivers.js'

describe('a user stop is distinguishable from a disconnect (IT)', () => {
  it('records the cancel on the run record and aborts with the cancel reason', {timeout: 20_000}, async () => {
    const fixture = await makeChatFixture()
    try {
      const send = makeSend(fixture.chat)
      const runId = 'stop-cancel-reason-1'
      await send(fixture.sessionId, runId, 'hang around')
      const driver = drivingRun(fixture.chat, runId)
      await stopSession(fixture.chat, fixture.sessionId)
      expect(isCancelRequestedReason(driver.abort.signal.reason)).toBe(true)
      await expect(fixture.chat.runs.get(runId)).resolves.toMatchObject({cancelRequested: true})
    } finally {
      await fixture.dispose()
    }
  })
})
