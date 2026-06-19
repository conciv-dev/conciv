import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {claudeMessagesToAgui} from '../src/claude/decode.js'
import type {UsageSnapshot} from '@mandarax/protocol/usage-types'

async function* messages(arr: unknown[]): AsyncGenerator<unknown> {
  for (const m of arr) yield m
}
async function collect(
  input: unknown[],
  hooks: {onSessionId?: (id: string) => void; onUsage?: (u: UsageSnapshot) => void} = {},
): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  const opts = {onSessionId: hooks.onSessionId ?? (() => {}), onUsage: hooks.onUsage}
  for await (const c of claudeMessagesToAgui(messages(input), opts)) out.push(c)
  return out
}
const types = (chunks: StreamChunk[]): string[] => chunks.map((c) => c.type)
const finishedUsage = (chunks: StreamChunk[]): Record<string, unknown> | undefined =>
  (chunks.find((c) => c.type === EventType.RUN_FINISHED) as {usage?: Record<string, unknown>}).usage

const initMsg = (sessionId: string) => ({type: 'system', subtype: 'init', session_id: sessionId})

describe('claude SDK-message decode → AG-UI', () => {
  it('surfaces session_id from the init system message', async () => {
    let seen = ''
    await collect([initMsg('sess-sdk-1')], {onSessionId: (id) => (seen = id)})
    expect(seen).toBe('sess-sdk-1')
  })

  it('maps a non-streamed assistant text block to TEXT_MESSAGE start/content/end', async () => {
    const assistant = {type: 'assistant', message: {content: [{type: 'text', text: 'hello'}]}}
    const chunks = await collect([assistant])
    expect(types(chunks)).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ])
    const content = chunks.find((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)
    expect((content as {delta?: string}).delta).toBe('hello')
  })

  it('maps an assistant tool_use block to a TOOL_CALL with its id, name and args', async () => {
    const assistant = {
      type: 'assistant',
      message: {content: [{type: 'tool_use', id: 'toolu_9', name: 'Bash', input: {command: 'ls'}}]},
    }
    const chunks = await collect([assistant])
    const start = chunks.find((c) => c.type === EventType.TOOL_CALL_START)
    expect((start as {toolCallId?: string; toolName?: string}).toolCallId).toBe('toolu_9')
    expect((start as {toolName?: string}).toolName).toBe('Bash')
    const args = chunks.find((c) => c.type === EventType.TOOL_CALL_ARGS)
    expect((args as {delta?: string}).delta).toContain('ls')
  })

  it('emits a tool_result from the user-message echo', async () => {
    const user = {type: 'user', message: {content: [{type: 'tool_result', tool_use_id: 'toolu_9', content: 'a.ts'}]}}
    const chunks = await collect([user])
    const result = chunks.find((c) => c.type === EventType.TOOL_CALL_RESULT)
    expect((result as {toolCallId?: string; content?: string}).toolCallId).toBe('toolu_9')
    expect((result as {content?: string}).content).toBe('a.ts')
  })

  it('streams partial stream_event blocks live (content_block_start/delta/stop)', async () => {
    const ev = (event: unknown) => ({type: 'stream_event', event, session_id: 's'})
    const chunks = await collect([
      ev({type: 'content_block_start', index: 0, content_block: {type: 'text'}}),
      ev({type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'hi '}}),
      ev({type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'there'}}),
      ev({type: 'content_block_stop', index: 0}),
    ])
    const deltas = chunks
      .filter((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((c) => (c as {delta?: string}).delta)
    expect(deltas).toEqual(['hi ', 'there'])
    expect(types(chunks)).toContain(EventType.TEXT_MESSAGE_START)
    expect(types(chunks)).toContain(EventType.TEXT_MESSAGE_END)
  })

  it('reports usage live from a partial message_start and on RUN_FINISHED', async () => {
    const seen: UsageSnapshot[] = []
    const messageStart = {
      type: 'stream_event',
      session_id: 's',
      event: {
        type: 'message_start',
        message: {model: 'claude-opus-4-8[1m]', usage: {input_tokens: 1234, output_tokens: 0}},
      },
    }
    const chunks = await collect([messageStart], {onUsage: (u) => seen.push(u)})
    expect(seen.at(-1)?.inputTokens).toBe(1234)
    expect(finishedUsage(chunks)?.promptTokens).toBe(1234)
  })

  it('carries cost, turns and context window from the result message', async () => {
    const assistant = {
      type: 'assistant',
      message: {
        model: 'claude-opus-4-8[1m]',
        content: [{type: 'text', text: 'ok'}],
        usage: {input_tokens: 5, output_tokens: 2},
      },
    }
    const result = {
      type: 'result',
      subtype: 'success',
      session_id: 'sess-sdk-2',
      total_cost_usd: 0.02,
      num_turns: 1,
      modelUsage: {'claude-opus-4-8[1m]': {contextWindow: 1000000}},
    }
    const u = finishedUsage(await collect([assistant, result]))
    const p = u?.providerUsageDetails as {contextWindow?: number; totalCostUsd?: number; numTurns?: number}
    expect(p.contextWindow).toBe(1000000)
    expect(p.totalCostUsd).toBe(0.02)
    expect(p.numTurns).toBe(1)
  })

  it('ignores SDK-only message types it does not map (no spurious chunks)', async () => {
    const chunks = await collect([
      {type: 'system', subtype: 'status'},
      {type: 'stream_event', event: {type: 'ping'}},
    ])
    expect(types(chunks)).toEqual([EventType.RUN_STARTED, EventType.RUN_FINISHED])
  })
})
