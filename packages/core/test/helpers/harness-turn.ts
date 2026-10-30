import {expect} from 'vitest'
import {ChatEventType} from '@conciv/protocol/chat-event-types'
import type {HarnessAdapter} from '@conciv/harness'
import type {SessionId} from '@conciv/protocol/chat-types'
import {bootKit} from './boot.js'

export type ResumeScenarioOpts = {
  harness: HarnessAdapter
  dir: string
  sessionId: SessionId
  sessionEvent: string
  model?: string
}

export async function assertTurnAndResume(opts: ResumeScenarioOpts): Promise<void> {
  const kit = await bootKit({cwd: opts.dir}, opts.harness)
  try {
    const sessionId = (await kit.rpc.sessions.resolve({id: opts.sessionId})).sessionId
    if (opts.model) await kit.rpc.sessions.model({sessionId, model: opts.model})
    const first = await (
      await kit.turn('Remember the token PLUM42. Reply with exactly OK.', {session: sessionId})
    ).done()
    expect(first.all.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
    expect(first.text().length).toBeGreaterThan(0)
    expect(first.custom(opts.sessionEvent).length).toBeGreaterThan(0)

    const second = await (
      await kit.turn('What was the token I asked you to remember? Reply with the token only.', {session: sessionId})
    ).done()
    expect(second.all.at(-1)?.type).toBe(ChatEventType.RUN_FINISHED)
    expect(second.text()).toContain('PLUM42')
  } finally {
    await kit.cleanup()
  }
}
