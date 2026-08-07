import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {defineHarness} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {createTestkit} from '@conciv/harness-testkit'
import {defineExtension} from '@conciv/extension'
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
  init: 'none',
} as const

function hangingGenerator(signal: AbortSignal | undefined): AsyncIterable<StreamChunk> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<IteratorResult<StreamChunk>>((resolve) => {
          signal?.addEventListener('abort', () => resolve({done: true, value: undefined}), {once: true})
        }),
    }),
  }
}

const hangingHarness = defineHarness({
  id: 'fake-hanging-slow-finish',
  binName: 'true',
  chatConfig: () => ({
    adapter: makeTextAdapter('fake-hanging-slow-finish', (options) =>
      hangingGenerator(options.abortController?.signal),
    ),
  }),
  capabilities: baseCaps,
})

const READER_GRACE_OVERRUN_MS = 5_600

describe('run log pre-seeding on the slow-finish deadline path (IT)', () => {
  it(
    'subscribers still receive RUN_ERROR when run teardown outlives the reader deadline',
    {timeout: 15_000},
    async () => {
      const slowTurnEnd = defineExtension({name: 'slow-turn-end'}).server(() => ({
        context: {},
        turnEnd: () => new Promise((resolve) => setTimeout(resolve, READER_GRACE_OVERRUN_MS)),
      }))
      const kit = await createTestkit(
        hangingHarness,
        bootCoreApp({firstChunkTimeoutMs: 250, extensions: [slowTurnEnd]}),
      ).setup()
      try {
        const id = await kit.session()
        const stream = await kit.attach(id)
        await kit.rpc.chat.send({runId: 'run-log-preseed-1', sessionId: id, text: 'hi'})
        const runError = await stream.waitFor((chunk) => chunk.type === EventType.RUN_ERROR, {hangGuardMs: 8_500})
        expect('message' in runError ? runError.message : '').toContain('no output')
      } finally {
        await kit.cleanup()
      }
    },
  )
})
