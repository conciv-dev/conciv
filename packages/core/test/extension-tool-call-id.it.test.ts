import {randomUUID} from 'node:crypto'
import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {EventType} from '@tanstack/ai'
import {defineExtension, defineTool} from '@conciv/extension'
import {createTestHarness} from '@conciv/harness-testkit'
import {requireClaude} from './helpers/adapters.js'
import {bootKit} from './helpers/boot.js'

const echoCallId = defineTool({
  name: 'acme_echo_call_id',
  description: 'Echo the tool call id the request carries',
  inputSchema: z.object({}),
  outputSchema: z.object({toolCallId: z.string()}),
  meta: {summary: 'echo the request tool call id', category: 'fixture', mutating: false},
}).server((_input, _ctx, request) => ({toolCallId: request.toolCallId ?? 'none'}))

const acme = defineExtension({name: 'acme', tools: [echoCallId]})

const LAZY_TOOL_DISCOVERY = '__lazy__tool__discovery__'

const EchoResultSchema = z.object({toolCallId: z.string()})

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

describe('an extension tool run from a chat turn knows which tool call it is answering', () => {
  it('hands the tool the same call id the turn put on the wire', async () => {
    const harness = createTestHarness(requireClaude())
    const kit = await bootKit({extensions: [acme]}, harness)
    cleanups.push(() => kit.cleanup())
    const sessionId = await kit.session()
    harness.script.scriptToolCall(LAZY_TOOL_DISCOVERY, {toolNames: ['acme_echo_call_id']})
    harness.script.scriptToolCall('acme_echo_call_id', {})
    const stream = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: randomUUID(), sessionId, text: 'echo the call id'})
    const events = await stream.done({hangGuardMs: 20_000})

    const call = events.toolCalls('acme_echo_call_id').at(-1)
    if (call === undefined) throw new Error('the chat turn never carried the tool call')
    const answer = events.all.findLast(
      (chunk) => chunk.type === EventType.TOOL_CALL_RESULT && chunk.toolCallId === call.toolCallId,
    )
    if (answer === undefined || answer.type !== EventType.TOOL_CALL_RESULT) {
      throw new Error('the chat turn never carried a result for the tool call')
    }
    expect(EchoResultSchema.parse(JSON.parse(answer.content)).toolCallId).toBe(call.toolCallId)
  }, 40_000)
})
