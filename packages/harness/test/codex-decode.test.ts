import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {codexToAguiEvents} from '../src/codex/decode.js'

async function* lines(arr: string[]): AsyncGenerator<string> {
  for (const l of arr) yield l
}

async function collect(input: string[], onSessionId = (_: string) => {}): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const c of codexToAguiEvents(lines(input), {onSessionId})) out.push(c)
  return out
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
function strField(chunk: StreamChunk | undefined, key: string): string | undefined {
  if (!isRecord(chunk)) return undefined
  const v = chunk[key]
  return typeof v === 'string' ? v : undefined
}

// Verbatim codex exec --json event lines (verified against the codex CLI docs).
const THREAD = JSON.stringify({type: 'thread.started', thread_id: 'th-1'})
const AGENT = JSON.stringify({type: 'item.completed', item: {id: 'item_3', type: 'agent_message', text: 'hello from codex'}})
const COMMAND = JSON.stringify({
  type: 'item.completed',
  item: {id: 'item_1', type: 'command_execution', command: 'bash -lc ls', aggregated_output: 'docs\nsrc\n', exit_code: 0, status: 'completed'},
})
const DONE = JSON.stringify({type: 'turn.completed', usage: {input_tokens: 1, output_tokens: 2}})

describe('codex decode', () => {
  it('wraps the stream in RUN_STARTED .. RUN_FINISHED', async () => {
    const got = await collect([THREAD, AGENT, DONE])
    expect(got[0]?.type).toBe(EventType.RUN_STARTED)
    expect(got.at(-1)?.type).toBe(EventType.RUN_FINISHED)
  })

  it('emits TEXT_MESSAGE_* for an agent_message item', async () => {
    const got = await collect([AGENT])
    const content = got.find((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)
    expect(strField(content, 'delta')).toBe('hello from codex')
  })

  it('maps a command_execution item to TOOL_CALL_* + result', async () => {
    const got = await collect([COMMAND])
    const start = got.find((c) => c.type === EventType.TOOL_CALL_START)
    expect(strField(start, 'toolCallId')).toBe('item_1')
    const result = got.find((c) => c.type === EventType.TOOL_CALL_RESULT)
    expect(strField(result, 'content')).toBe('docs\nsrc\n')
  })

  it('reports the codex thread id and skips unparseable lines', async () => {
    const seen: string[] = []
    await collect(['not json', '', THREAD], (id) => seen.push(id))
    expect(seen).toContain('th-1')
  })
})
