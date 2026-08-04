import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {defineHarness} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {createTestkit} from '@conciv/harness-testkit'
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

async function* innerIdGenerator(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 'inner', runId: 'inner'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'inner-msg', delta: 'ok'}
  yield {type: EventType.RUN_FINISHED, threadId: 'inner', runId: 'inner'}
}

const innerIdHarness = defineHarness({
  id: 'fake-inner-id',
  binName: 'true',
  chatConfig: () => ({adapter: makeTextAdapter('fake-inner-id', () => innerIdGenerator())}),
  capabilities: baseCaps,
})

function runIdOf(chunk: StreamChunk): string | null {
  return 'runId' in chunk && typeof chunk.runId === 'string' ? chunk.runId : null
}

describe('lifecycle runId stamping (the wire identity of a run is the client-minted runId)', () => {
  it('overrides harness-internal ids on RUN_STARTED and RUN_FINISHED with the request runId', async () => {
    const kit = await createTestkit(innerIdHarness, bootCoreApp()).setup()
    try {
      const id = await kit.session()
      const stream = await kit.attach(id)
      await kit.rpc.chat.send({runId: 'stamp-1', sessionId: id, text: 'hi'})
      const started = await stream.waitFor((chunk) => chunk.type === EventType.RUN_STARTED, {hangGuardMs: 5000})
      const finished = await stream.waitFor((chunk) => chunk.type === EventType.RUN_FINISHED, {hangGuardMs: 5000})
      expect(runIdOf(started)).toBe('stamp-1')
      expect(runIdOf(finished)).toBe('stamp-1')
    } finally {
      await kit.cleanup()
    }
  })
})
