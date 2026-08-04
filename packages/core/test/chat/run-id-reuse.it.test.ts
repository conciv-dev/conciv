import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {defineHarness} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {createTestkit} from '@conciv/harness-testkit'
import {makeSend} from '../../src/chat/run.js'
import {makeChatFixture} from '../helpers/chat-fixture.js'
import {bootCoreApp} from '../helpers/boot.js'

const baseCaps = {
  resume: false,
  permissionGate: 'none',
  transcriptHistory: false,
  compaction: false,
  systemPrompt: 'none',
  mcp: 'none',
  slashCommands: 'none',
  imageInput: false,
} as const

async function* instantGenerator(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 'instant', runId: 'instant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'instant-msg', delta: 'ok'}
  yield {type: EventType.RUN_FINISHED, threadId: 'instant', runId: 'instant'}
}

const instantHarness = defineHarness({
  id: 'fake-instant',
  binName: 'true',
  chatConfig: () => ({adapter: makeTextAdapter('fake-instant', () => instantGenerator())}),
  capabilities: baseCaps,
})

describe('runId reuse after a finished run (IT)', () => {
  it('send rejects when the runId already belongs to a finished run', {timeout: 15_000}, async () => {
    const fixture = await makeChatFixture()
    const send = makeSend(fixture.chat)
    const runId = 'run-id-reuse-1'
    await send(fixture.sessionId, runId, 'first turn')
    await Promise.all(fixture.chat.liveRuns.of(fixture.sessionId).map((run) => run.done))
    await expect(send(fixture.sessionId, runId, 'second turn')).rejects.toThrow(/already finished/)
  })

  it('rpc chat.send surfaces the rejection to the client', {timeout: 15_000}, async () => {
    const kit = await createTestkit(instantHarness, bootCoreApp()).setup()
    try {
      const id = await kit.session()
      const stream = await kit.attach(id)
      const runId = 'run-id-reuse-rpc-1'
      await kit.rpc.chat.send({runId, sessionId: id, text: 'first turn'})
      await stream.done({hangGuardMs: 5000})
      const failure = await kit.rpc.chat.send({runId, sessionId: id, text: 'second turn'}).then(
        () => null,
        (error: unknown) => error,
      )
      expect(failure).toBeInstanceOf(Error)
      expect(failure).toMatchObject({
        code: 'RUN_ALREADY_FINISHED',
        defined: true,
        status: 409,
        data: {runId},
        message: expect.stringMatching(/already finished/),
      })
    } finally {
      await kit.cleanup()
    }
  })
})
