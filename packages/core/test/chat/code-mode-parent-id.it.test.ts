import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {chat, EventType, StreamProcessor, type StreamChunk, type TextOptions} from '@tanstack/ai'
import {makeTextAdapter} from '@conciv/harness'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'
import {makeCodeMode} from '../../src/chat/code-mode.js'
import {codeModeToolChunks} from '../../src/chat/code-mode-parts.js'

const request: ToolRequest = {sessionId: 'conciv_x', model: null}
const allowGate = {decide: async () => 'allow' as const}

const canvas: ExtensionServerTool = {
  name: 'canvas.svg',
  description: 'canvas.svg draws a shape. Extra prose here.',
  inputSchema: z.object({}),
  execute: async () => 'drew',
}

const PARENT_CALL_ID = 'exec-parent-1'

const ToolCallValueSchema = z.object({callId: z.string(), name: z.string(), toolCallId: z.string().optional()})

function parentIdsOfToolCalls(chunks: StreamChunk[]): (string | undefined)[] {
  return chunks.flatMap((chunk) => {
    if (chunk.type !== EventType.CUSTOM || chunk.name !== 'conciv:tool_call') return []
    const parsed = ToolCallValueSchema.safeParse(chunk.value)
    return parsed.success ? [parsed.data.toolCallId] : []
  })
}

function scriptedAdapter(): ReturnType<typeof makeTextAdapter> {
  const rounds = {value: 0}
  async function* stream(options: TextOptions<Record<string, never>>): AsyncGenerator<StreamChunk> {
    void options
    const round = rounds.value
    rounds.value += 1
    yield {type: EventType.RUN_STARTED, threadId: 't', runId: 'r'}
    if (round === 0) {
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId: PARENT_CALL_ID,
        toolCallName: 'execute_typescript',
        toolName: 'execute_typescript',
      }
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: PARENT_CALL_ID,
        delta: JSON.stringify({typescriptCode: 'return await external_canvas_svg({})'}),
      }
      yield {type: EventType.TOOL_CALL_END, toolCallId: PARENT_CALL_ID}
      yield {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r', finishReason: 'tool_calls'}
      return
    }
    yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'done'}
    yield {type: EventType.RUN_FINISHED, threadId: 't', runId: 'r', finishReason: 'stop'}
  }
  return makeTextAdapter('scripted', stream)
}

function foldedMessages(chunks: StreamChunk[]): ReturnType<StreamProcessor['getMessages']> {
  const processor = new StreamProcessor({events: {}})
  for (const chunk of chunks) {
    const synthesized = codeModeToolChunks(chunk)
    if (synthesized) {
      synthesized.forEach((entry) => processor.processChunk(entry))
      continue
    }
    processor.processChunk(chunk)
  }
  return processor.getMessages()
}

describe('code-mode nested-call parent id from real execution (IT, real chat + real isolate + real fold)', () => {
  it('threads the execute_typescript call id onto emitted gated-tool events without hand-injection', async () => {
    const codeMode = makeCodeMode([canvas], request, allowGate)
    if (!codeMode) throw new Error('code mode unavailable: isolated-vm probe reported incompatible')

    const chunks: StreamChunk[] = []
    for await (const chunk of chat({
      adapter: scriptedAdapter(),
      messages: [{role: 'user', content: 'draw a circle'}],
      threadId: 't',
      tools: codeMode.tools,
      lazyToolsConfig: {includeDescription: 'first-sentence'},
    })) {
      chunks.push(chunk)
    }

    const parents = parentIdsOfToolCalls(chunks)
    expect(parents.length).toBeGreaterThan(0)
    expect(parents.every((id) => id === PARENT_CALL_ID)).toBe(true)

    const parts = foldedMessages(chunks).flatMap((message) => message.parts)
    const child = parts.find((part) => part.type === 'tool-call' && part.name === 'canvas.svg')
    expect(child).toMatchObject({name: 'canvas.svg', metadata: {parentToolCallId: PARENT_CALL_ID}})
    const parent = parts.find((part) => part.type === 'tool-call' && part.name === 'execute_typescript')
    expect(parent).toBeDefined()
  })
})
