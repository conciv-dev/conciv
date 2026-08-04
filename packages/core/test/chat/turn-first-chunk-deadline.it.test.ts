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
  id: 'fake-hanging',
  binName: 'true',
  chatConfig: () => ({
    adapter: makeTextAdapter('fake-hanging', (options) => hangingGenerator(options.abortController?.signal)),
  }),
  capabilities: baseCaps,
})

describe('an adapter that never produces a first chunk', () => {
  it('settles the run with a deadline error instead of hanging forever', async () => {
    const runEnd = {resolve: (_sessionId: string) => {}}
    const runEnded = new Promise<string>((resolve) => (runEnd.resolve = resolve))
    const probe = defineExtension({name: 'run-end-probe'}).server(() => ({
      context: {},
      turnEnd: (sessionId: string) => runEnd.resolve(sessionId),
    }))
    const kit = await createTestkit(
      hangingHarness,
      bootCoreApp({firstChunkTimeoutMs: 300, extensions: [probe]}),
    ).setup()
    try {
      const id = await kit.session()
      const stream = await kit.attach(id)
      await kit.rpc.chat.send({runId: 'turn-first-chunk-deadline-1', sessionId: id, text: 'hi'})
      const runError = await stream.waitFor((chunk) => chunk.type === EventType.RUN_ERROR, {hangGuardMs: 5000})
      expect('message' in runError ? runError.message : '').toContain('no output')
      expect(await runEnded).toBe(id)
    } finally {
      await kit.cleanup()
    }
  })
})
