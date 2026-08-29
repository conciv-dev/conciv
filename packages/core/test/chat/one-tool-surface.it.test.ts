import {randomUUID} from 'node:crypto'
import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {EventType, type StreamChunk, type TextOptions} from '@tanstack/ai'
import {makeTextAdapter} from '@conciv/harness'
import {defineHarness, type HarnessAdapter} from '@conciv/protocol/harness-types'
import {defineExtension, defineTool} from '@conciv/extension'
import {bootKit} from '../helpers/boot.js'

const echo = defineTool({
  name: 'acme_echo',
  description: 'Echo the input back',
  inputSchema: z.object({}),
  outputSchema: z.object({ok: z.boolean()}),
  meta: {summary: 'echo the input back', category: 'fixture', mutating: false},
}).server(() => ({ok: true}))

const acme = defineExtension({name: 'acme', tools: [echo]})

function recordingHarness(): {harness: HarnessAdapter; provisioned: () => string[]} {
  const rounds: string[][] = []
  async function* stream(options: TextOptions<Record<string, never>>): AsyncGenerator<StreamChunk> {
    rounds.push((options.tools ?? []).map((tool) => tool.name))
    yield {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'}
    yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'ok'}
    yield {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r'}
  }
  const harness = defineHarness({
    id: 'recording',
    binName: 'true',
    capabilities: {
      resume: false,
      permissionGate: 'none',
      transcriptHistory: false,
      compaction: false,
      systemPrompt: 'none',
      mcp: 'none',
      imageInput: false,
      init: 'none',
      slashCommands: 'none',
    },
    chatConfig: () => ({adapter: makeTextAdapter('recording', stream)}),
  })
  return {harness, provisioned: () => rounds.at(-1) ?? []}
}

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

describe('a chat turn carries one tool surface', () => {
  it('provisions code mode only, with no direct built-in or extension tool beside it', async () => {
    const {harness, provisioned} = recordingHarness()
    const kit = await bootKit({extensions: [acme]}, harness)
    cleanups.push(() => kit.cleanup())
    const sessionId = await kit.session()
    const stream = await kit.turn('say hello', {session: sessionId, runId: randomUUID()})
    await stream.done({hangGuardMs: 20_000})

    expect(provisioned()).toEqual(['execute_typescript'])
  }, 40_000)
})
