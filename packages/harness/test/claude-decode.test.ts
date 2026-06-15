import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {claudeToAguiEvents} from '../src/claude/decode.js'

async function* lines(arr: string[]): AsyncGenerator<string> {
  for (const l of arr) yield l
}
async function collect(input: string[]): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const c of claudeToAguiEvents(lines(input), {onSessionId: () => {}})) out.push(c)
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
})
