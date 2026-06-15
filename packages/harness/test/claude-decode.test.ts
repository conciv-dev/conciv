import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {claudeToAguiEvents} from '../src/claude/decode.js'
import {AIDX_USAGE_EVENT} from '@aidx/protocol/usage-types'

async function* lines(arr: string[]): AsyncGenerator<string> {
  for (const l of arr) yield l
}
async function collect(input: string[]): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const c of claudeToAguiEvents(lines(input), {onSessionId: () => {}})) out.push(c)
  return out
}
function usageValues(chunks: StreamChunk[]): Array<Record<string, unknown>> {
  return chunks
    .filter((c) => c.type === EventType.CUSTOM && (c as {name?: string}).name === AIDX_USAGE_EVENT)
    .map((c) => (c as {value: Record<string, unknown>}).value)
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
  it('extracts per-turn usage + model from an assistant event', async () => {
    const v = usageValues(await collect([ASSISTANT]))
    expect(v[0]).toEqual({
      modelId: 'claude-opus-4-8[1m]',
      inputTokens: 18151,
      outputTokens: 19,
      cacheReadTokens: 15832,
      cacheWriteTokens: 1912,
    })
  })

  it('merges contextWindow + cost + turns from the result event', async () => {
    const v = usageValues(await collect([ASSISTANT, RESULT]))
    const last = v.at(-1)!
    expect(last.contextWindow).toBe(1000000)
    expect(last.totalCostUsd).toBe(0.118)
    expect(last.numTurns).toBe(1)
    expect(last.inputTokens).toBe(18151) // carried from the assistant snapshot (last-wins merge)
  })

  it('emits no usage for an assistant event without a usage field', async () => {
    const noUsage = JSON.stringify({type: 'assistant', message: {content: [{type: 'text', text: 'hi'}]}})
    expect(usageValues(await collect([noUsage]))).toHaveLength(0)
  })
})
