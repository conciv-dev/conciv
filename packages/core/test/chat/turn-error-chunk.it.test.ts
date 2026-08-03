import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {defineHarness} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {createTestkit} from '@conciv/harness-testkit'
import {defineExtension} from '@conciv/extension'
import {bootCoreApp} from '../helpers/boot.js'

const CHUNK_FAIL = 'stub is not installed or not yet supported'

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

async function* erroringGenerator(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 'stub', runId: 'stub'}
  yield {type: EventType.RUN_ERROR, message: CHUNK_FAIL}
}

const erroringHarness = defineHarness({
  id: 'fake-chunk-error',
  binName: 'true',
  chatConfig: () => ({adapter: makeTextAdapter('fake-chunk-error', () => erroringGenerator())}),
  capabilities: baseCaps,
})

describe('an adapter that yields RUN_ERROR as a chunk (stub harnesses, acp adapters)', () => {
  it('surfaces the error on the wire and settles the run', async () => {
    const runEnd = {resolve: (_sessionId: string) => {}}
    const runEnded = new Promise<string>((resolve) => (runEnd.resolve = resolve))
    const probe = defineExtension({name: 'run-end-probe'}).server(() => ({
      context: {},
      turnEnd: (sessionId: string) => runEnd.resolve(sessionId),
    }))
    const kit = await createTestkit(erroringHarness, bootCoreApp({extensions: [probe]})).setup()
    try {
      const id = await kit.session()
      const stream = await kit.attach(id)
      await kit.rpc.chat.send({runId: 'turn-error-chunk-1', sessionId: id, text: 'hi'})
      const runError = await stream.waitFor((chunk) => chunk.type === EventType.RUN_ERROR, {hangGuardMs: 5000})
      expect(runError.type).toBe(EventType.RUN_ERROR)
      expect('message' in runError ? runError.message : '').toContain(CHUNK_FAIL)
      expect(await runEnded).toBe(id)
    } finally {
      await kit.cleanup()
    }
  })
})
