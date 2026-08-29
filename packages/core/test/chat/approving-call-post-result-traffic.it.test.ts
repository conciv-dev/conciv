import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {EventType, type StreamChunk, type TextOptions} from '@tanstack/ai'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {defineExtension, defineTool} from '@conciv/extension'
import {makeApprovingCallTool} from '@conciv/harness-testkit'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'

const canvasDelete = defineTool({
  name: 'canvas_delete',
  description: 'Remove an element from the canvas by elementId.',
  inputSchema: z.object({elementId: z.string()}),
  outputSchema: z.object({removed: z.string()}),
  approval: 'ask',
  meta: {summary: 'remove an element from the canvas', category: 'fixture', mutating: true},
}).server((input) => ({removed: input.elementId}))

const whiteboardish = defineExtension({name: 'whiteboardish', tools: [canvasDelete]})

const NOISE_CHUNK_COUNT = 60
const NOISE_INTERVAL_MS = 15

async function* noisyStream(options: TextOptions<Record<string, never>>): AsyncGenerator<StreamChunk> {
  void options
  yield {type: EventType.RUN_STARTED, threadId: 'noisy', runId: 'noisy'}
  for (let index = 0; index < NOISE_CHUNK_COUNT; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, NOISE_INTERVAL_MS))
    yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'noisy-msg', delta: `chunk-${index} `}
  }
  yield {type: EventType.RUN_FINISHED, threadId: 'noisy', runId: 'noisy'}
}

function noisyHarness(): HarnessAdapter {
  return Object.assign({}, requireClaude(), {
    chatConfig: () => ({adapter: makeTextAdapter('noisy', noisyStream)}),
  })
}

describe('an approving call keeps completing while its session subscription is busy', () => {
  it('resolves quickly even while a long-running chat turn keeps streaming on the same session', async () => {
    const kit = await bootKit({extensions: [whiteboardish]}, noisyHarness())
    try {
      const session = await kit.session()
      await kit.attach(session)
      await kit.chat('keep talking', session)
      const approvingCall = makeApprovingCallTool(kit.base, session)
      const outcome = await approvingCall('canvas_delete', {elementId: 'target'})
      expect(JSON.stringify(outcome)).toContain('target')
    } finally {
      await kit.cleanup()
    }
  }, 8_000)
})
