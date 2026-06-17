import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {claudeToAguiEvents} from '../src/claude/decode.js'
import type {UsageSnapshot} from '@opendui/aidx-protocol/usage-types'

async function* lines(arr: string[]): AsyncGenerator<string> {
  for (const l of arr) yield l
}
async function collect(input: string[], onUsage?: (u: UsageSnapshot) => void): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const c of claudeToAguiEvents(lines(input), {onSessionId: () => {}, onUsage})) out.push(c)
  return out
}
function finishedUsage(chunks: StreamChunk[]): Record<string, unknown> | undefined {
  const fin = chunks.find((c) => c.type === EventType.RUN_FINISHED)
  return (fin as {usage?: Record<string, unknown>}).usage
}

const ASSISTANT = JSON.stringify({
  type: 'assistant',
  message: {
    model: 'claude-opus-4-8[1m]',
    content: [{type: 'text', text: 'hi'}],
    usage: {input_tokens: 18151, cache_read_input_tokens: 15832, cache_creation_input_tokens: 1912, output_tokens: 19},
  },
})
const RESULT = JSON.stringify({
  type: 'result',
  session_id: 'sess-1',
  total_cost_usd: 0.118,
  num_turns: 1,
  modelUsage: {'claude-opus-4-8[1m]': {contextWindow: 1000000, costUSD: 0.118}},
})

describe('claude decode — usage', () => {
  it('puts per-turn tokens + cache on RUN_FINISHED usage', async () => {
    const u = finishedUsage(await collect([ASSISTANT]))
    expect(u?.promptTokens).toBe(18151)
    expect(u?.completionTokens).toBe(19)
    const prompt = u?.promptTokensDetails as {cachedTokens?: number; cacheWriteTokens?: number} | undefined
    expect(prompt?.cachedTokens).toBe(15832)
    expect(prompt?.cacheWriteTokens).toBe(1912)
  })

  it('merges contextWindow + cost + turns from the result event (providerUsageDetails)', async () => {
    const u = finishedUsage(await collect([ASSISTANT, RESULT]))
    const p = u?.providerUsageDetails as {contextWindow?: number; totalCostUsd?: number; numTurns?: number}
    expect(p.contextWindow).toBe(1000000)
    expect(p.totalCostUsd).toBe(0.118)
    expect(p.numTurns).toBe(1)
    expect(u?.promptTokens).toBe(18151) // carried from the assistant snapshot (last-wins merge)
  })

  it('omits usage when no assistant/result event carries it', async () => {
    const noUsage = JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: 'hi'}]}})
    expect(finishedUsage(await collect([noUsage]))).toBeUndefined()
  })

  it('reports usage live from a partial message_start (context known before turn end)', async () => {
    const seen: UsageSnapshot[] = []
    const MS = JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'message_start',
        message: {
          model: 'claude-opus-4-8[1m]',
          usage: {
            input_tokens: 17206,
            cache_read_input_tokens: 15832,
            cache_creation_input_tokens: 1913,
            output_tokens: 3,
          },
        },
      },
    })
    await collect([MS], (u) => seen.push(u))
    expect(seen[0]?.inputTokens).toBe(17206)
    expect(seen[0]?.cacheReadTokens).toBe(15832)
    expect(seen[0]?.modelId).toBe('claude-opus-4-8[1m]')
  })
})

// Raw Anthropic SSE wrapped by --include-partial-messages.
const streamEvent = (event: unknown) => JSON.stringify({type: 'stream_event', event})
const blockStart = (index: number, content_block: unknown) =>
  streamEvent({type: 'content_block_start', index, content_block})
const blockDelta = (index: number, delta: unknown) => streamEvent({type: 'content_block_delta', index, delta})
const blockStop = (index: number) => streamEvent({type: 'content_block_stop', index})

function ofType(chunks: StreamChunk[], type: EventType): StreamChunk[] {
  return chunks.filter((c) => c.type === type)
}

describe('claude decode — live text streaming', () => {
  it('splits a text block into START, per-delta CONTENT, END', async () => {
    const out = await collect([
      blockStart(0, {type: 'text', text: ''}),
      blockDelta(0, {type: 'text_delta', text: 'Hel'}),
      blockDelta(0, {type: 'text_delta', text: 'lo'}),
      blockStop(0),
    ])
    const start = ofType(out, EventType.TEXT_MESSAGE_START)
    const content = ofType(out, EventType.TEXT_MESSAGE_CONTENT)
    const end = ofType(out, EventType.TEXT_MESSAGE_END)
    expect(start).toHaveLength(1)
    expect(content.map((c) => (c as {delta: string}).delta)).toEqual(['Hel', 'lo'])
    expect(end).toHaveLength(1)
    const mid = (start[0] as {messageId: string}).messageId
    expect(content.every((c) => (c as {messageId: string}).messageId === mid)).toBe(true)
    expect((end[0] as {messageId: string}).messageId).toBe(mid)
  })

  it('CONTENT deltas arrive before RUN_FINISHED (live, not buffered to turn end)', async () => {
    const out = await collect([
      blockStart(0, {type: 'text', text: ''}),
      blockDelta(0, {type: 'text_delta', text: 'hi'}),
      blockStop(0),
    ])
    const firstContent = out.findIndex((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)
    const finished = out.findIndex((c) => c.type === EventType.RUN_FINISHED)
    expect(firstContent).toBeGreaterThanOrEqual(0)
    expect(firstContent).toBeLessThan(finished)
  })

  it('suppresses the terminal assistant event once a block has streamed (no double-render)', async () => {
    const out = await collect([
      blockStart(0, {type: 'text', text: ''}),
      blockDelta(0, {type: 'text_delta', text: 'hi'}),
      blockStop(0),
      ASSISTANT, // consolidated duplicate of the same text
    ])
    expect(ofType(out, EventType.TEXT_MESSAGE_START)).toHaveLength(1)
    const content = ofType(out, EventType.TEXT_MESSAGE_CONTENT)
    expect(content.map((c) => (c as {delta: string}).delta)).toEqual(['hi'])
  })

  it('falls back to the assistant event when no partial blocks stream (partial mode off)', async () => {
    const out = await collect([ASSISTANT])
    const content = ofType(out, EventType.TEXT_MESSAGE_CONTENT)
    expect(content.map((c) => (c as {delta: string}).delta)).toEqual(['hi'])
  })

  it('streams a thinking block to reasoning START/CONTENT/END', async () => {
    const out = await collect([
      blockStart(0, {type: 'thinking', thinking: ''}),
      blockDelta(0, {type: 'thinking_delta', thinking: 'hmm'}),
      blockDelta(0, {type: 'signature_delta', signature: 'sig'}), // ignored
      blockStop(0),
    ])
    expect(ofType(out, EventType.REASONING_MESSAGE_START)).toHaveLength(1)
    const content = ofType(out, EventType.REASONING_MESSAGE_CONTENT)
    expect(content.map((c) => (c as {delta: string}).delta)).toEqual(['hmm'])
    expect(ofType(out, EventType.REASONING_MESSAGE_END)).toHaveLength(1)
  })

  it('streams a tool_use block: START with name/id, accumulated ARGS, END', async () => {
    const out = await collect([
      blockStart(0, {type: 'tool_use', id: 'toolu_1', name: 'Bash'}),
      blockDelta(0, {type: 'input_json_delta', partial_json: '{"command":'}),
      blockDelta(0, {type: 'input_json_delta', partial_json: '"ls"}'}),
      blockStop(0),
    ])
    const start = ofType(out, EventType.TOOL_CALL_START)[0] as {toolCallId: string; toolName: string}
    expect(start.toolCallId).toBe('toolu_1')
    expect(start.toolName).toBe('Bash')
    const args = ofType(out, EventType.TOOL_CALL_ARGS).map((c) => (c as {delta: string}).delta)
    expect(args.join('')).toBe('{"command":"ls"}')
    const end = ofType(out, EventType.TOOL_CALL_END)[0] as {toolCallId: string}
    expect(end.toolCallId).toBe('toolu_1')
  })

  it('emits empty-object ARGS for a tool_use with no input deltas (valid JSON to accumulate)', async () => {
    const out = await collect([blockStart(0, {type: 'tool_use', id: 'toolu_2', name: 'Now'}), blockStop(0)])
    const args = ofType(out, EventType.TOOL_CALL_ARGS).map((c) => (c as {delta: string}).delta)
    expect(args.join('')).toBe('{}')
  })

  it('mints distinct ids for concurrent interleaved blocks (indices 0 and 1)', async () => {
    const out = await collect([
      blockStart(0, {type: 'text', text: ''}),
      blockStart(1, {type: 'thinking', thinking: ''}),
      blockDelta(0, {type: 'text_delta', text: 'A'}),
      blockDelta(1, {type: 'thinking_delta', thinking: 'B'}),
      blockStop(1),
      blockStop(0),
    ])
    const textStart = ofType(out, EventType.TEXT_MESSAGE_START)[0] as {messageId: string}
    const reasonStart = ofType(out, EventType.REASONING_MESSAGE_START)[0] as {messageId: string}
    expect(textStart.messageId).not.toBe(reasonStart.messageId)
    const textContent = ofType(out, EventType.TEXT_MESSAGE_CONTENT)[0] as {messageId: string; delta: string}
    expect(textContent.delta).toBe('A')
    expect(textContent.messageId).toBe(textStart.messageId)
  })

  it('still emits tool results from user events while streaming', async () => {
    const userEvent = JSON.stringify({
      type: 'user',
      message: {content: [{type: 'tool_result', tool_use_id: 'toolu_1', content: 'done'}]},
    })
    const out = await collect([blockStart(0, {type: 'tool_use', id: 'toolu_1', name: 'Bash'}), blockStop(0), userEvent])
    const res = ofType(out, EventType.TOOL_CALL_RESULT)[0] as {toolCallId: string; content: string}
    expect(res.toolCallId).toBe('toolu_1')
    expect(res.content).toBe('done')
  })
})
