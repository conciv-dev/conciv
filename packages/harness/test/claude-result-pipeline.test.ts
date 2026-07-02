import {describe, it, expect} from 'vitest'
import {StreamProcessor, type UIMessage, type MessagePart} from '@tanstack/ai'
import {claudeToAguiEvents} from '../src/claude/decode.js'

async function* lines(arr: string[]): AsyncGenerator<string> {
  for (const l of arr) yield l
}

async function runThroughProcessor(input: string[]): Promise<UIMessage[]> {
  const proc = new StreamProcessor()
  await proc.process(claudeToAguiEvents(lines(input), {onSessionId: () => {}}))
  return proc.getMessages()
}

function toolResultParts(messages: UIMessage[]): Extract<MessagePart, {type: 'tool-result'}>[] {
  return messages.flatMap((m) =>
    m.parts.filter((p): p is Extract<MessagePart, {type: 'tool-result'}> => p.type === 'tool-result'),
  )
}
function toolCallParts(messages: UIMessage[]): Extract<MessagePart, {type: 'tool-call'}>[] {
  return messages.flatMap((m) =>
    m.parts.filter((p): p is Extract<MessagePart, {type: 'tool-call'}> => p.type === 'tool-call'),
  )
}

const streamEvent = (event: unknown) => JSON.stringify({type: 'stream_event', event})
const blockStart = (index: number, content_block: unknown) =>
  streamEvent({type: 'content_block_start', index, content_block})
const blockDelta = (index: number, delta: unknown) => streamEvent({type: 'content_block_delta', index, delta})
const blockStop = (index: number) => streamEvent({type: 'content_block_stop', index})
const userResult = (toolUseId: string, content: string, isError?: boolean) =>
  JSON.stringify({
    type: 'user',
    message: {content: [{type: 'tool_result', tool_use_id: toolUseId, content, ...(isError ? {is_error: true} : {})}]},
  })

const mcpUserResult = (toolUseId: string, payload: unknown) =>
  JSON.stringify({
    type: 'user',
    message: {
      content: [
        {type: 'tool_result', tool_use_id: toolUseId, content: [{type: 'text', text: JSON.stringify(payload)}]},
      ],
    },
  })

describe('claude decode → StreamProcessor: tool results settle', () => {
  it('settles a streamed tool call + user tool_result to a complete result part', async () => {
    const messages = await runThroughProcessor([
      blockStart(0, {type: 'tool_use', id: 'toolu_1', name: 'mcp__conciv__conciv_page'}),
      blockDelta(0, {type: 'input_json_delta', partial_json: '{"verb":"tree"}'}),
      blockStop(0),
      userResult('toolu_1', '<page tree>'),
    ])
    const calls = toolCallParts(messages)
    const results = toolResultParts(messages)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.name).toBe('conciv_page')
    expect(results).toHaveLength(1)
    expect(results[0]?.toolCallId).toBe('toolu_1')
    expect(results[0]?.state).toBe('complete')
  })

  it('unwraps the MCP content envelope to the clean payload (no double-encoded array)', async () => {
    const payload = {nodes: [{ref: 'v1', role: 'navigation', name: 'Home'}]}
    const messages = await runThroughProcessor([
      blockStart(0, {type: 'tool_use', id: 'toolu_p', name: 'mcp__conciv__conciv_page'}),
      blockDelta(0, {type: 'input_json_delta', partial_json: '{"verb":"snapshot"}'}),
      blockStop(0),
      mcpUserResult('toolu_p', payload),
    ])
    const results = toolResultParts(messages)
    expect(results).toHaveLength(1)
    const content = results[0]?.content
    expect(typeof content).toBe('string')

    expect(content).not.toContain('"type":"text"')

    expect(JSON.parse(content as string)).toEqual(payload)
  })

  it('marks an is_error tool_result as an error result part', async () => {
    const messages = await runThroughProcessor([
      blockStart(0, {type: 'tool_use', id: 'toolu_2', name: 'Bash'}),
      blockDelta(0, {type: 'input_json_delta', partial_json: '{"command":"false"}'}),
      blockStop(0),
      userResult('toolu_2', 'exit 1', true),
    ])
    const results = toolResultParts(messages)
    expect(results).toHaveLength(1)
    expect(results[0]?.state).toBe('error')
  })
})
