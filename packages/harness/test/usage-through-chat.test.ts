import {Readable} from 'node:stream'
import {describe, expect, it} from 'vitest'
import {chat, EventType, type StreamChunk} from '@tanstack/ai'
import type {HarnessChild} from '@opendui/aidx-protocol/harness-types'
import {harnessText} from '../src/_shared/text-adapter.js'
import {claude} from '../src/claude/index.js'

// Scripted claude stream-json stdout: a system init, an assistant turn carrying usage, then a
// result with modelUsage. Mirrors the real claude CLI shape (verified against claude 2.1.177).
const STDOUT =
  [
    JSON.stringify({type: 'system', subtype: 'init', session_id: 's1', model: 'claude-opus-4-8[1m]'}),
    JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-opus-4-8[1m]',
        content: [{type: 'text', text: 'hi'}],
        usage: {input_tokens: 100, cache_read_input_tokens: 50, cache_creation_input_tokens: 10, output_tokens: 5},
      },
    }),
    JSON.stringify({
      type: 'result',
      session_id: 's1',
      total_cost_usd: 0.01,
      num_turns: 1,
      modelUsage: {'claude-opus-4-8[1m]': {contextWindow: 1000000}},
    }),
  ].join('\n') + '\n'

const spawnHarness = (): HarnessChild => ({
  pid: 1234,
  stdout: Readable.from([STDOUT]),
  stderr: Readable.from([]),
  stdin: undefined,
  kill: () => {},
})

// Regression guard for the real /api/chat path: usage rides RUN_FINISHED.usage (native), which
// survives chat() — unlike an adapter-emitted CUSTOM chunk, which chat() drops.
describe('usage survives chat() on RUN_FINISHED', () => {
  it('carries contextWindow through chat() on the terminal RUN_FINISHED', async () => {
    const adapter = harnessText(claude, {cwd: process.cwd(), spawnHarness, systemPrompt: '', onSpawn() {}})
    const out: StreamChunk[] = []
    for await (const c of chat({adapter, messages: [{role: 'user', content: 'hi'}]})) out.push(c)
    const fin = out.find((c) => c.type === EventType.RUN_FINISHED)
    const provider = (fin as {usage?: {providerUsageDetails?: {contextWindow?: number}}}).usage?.providerUsageDetails
    expect(provider?.contextWindow).toBe(1000000)
  })
})
