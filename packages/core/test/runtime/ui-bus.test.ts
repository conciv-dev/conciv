import {describe, it, expect} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {makeUiBus} from '../../src/runtime/ui-bus.js'

function gatedRun(chunk: StreamChunk): {stream: AsyncGenerator<StreamChunk>; release: () => void} {
  const gate = {open: () => {}}
  const held = new Promise<void>((resolve) => {
    gate.open = resolve
  })
  async function* stream(): AsyncGenerator<StreamChunk> {
    yield chunk
    await held
  }
  return {stream: stream(), release: gate.open}
}

async function drain(generator: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const chunk of generator) out.push(chunk)
  return out
}

describe('uiBus per-session channels', () => {
  it('routes injectApproval to the matching session only', async () => {
    const bus = makeUiBus()
    const runA = gatedRun({type: EventType.RUN_STARTED, threadId: 'a', runId: 'a'})
    const runB = gatedRun({type: EventType.RUN_STARTED, threadId: 'b', runId: 'b'})
    const a = bus.run('h-a', runA.stream)
    const b = bus.run('h-b', runB.stream)
    const request = {toolCallId: 'tc-1', toolName: 'Bash', input: {command: 'rm -rf'}, approvalId: 'ap-1'}
    expect(bus.injectApproval('h-a', request)).toBe(true)
    expect(bus.injectApproval('h-missing', request)).toBe(false)
    runA.release()
    runB.release()
    const [chunksA, chunksB] = await Promise.all([drain(a), drain(b)])
    const custom = (chunks: StreamChunk[]) => chunks.filter((chunk) => chunk.type === EventType.CUSTOM)
    expect(custom(chunksA).length).toBe(1)
    expect(custom(chunksB).length).toBe(0)
  })

  it('hands every harness chunk to the onChunk observer with its session id', async () => {
    const seen: Array<[string, string]> = []
    const bus = makeUiBus({onChunk: (sessionId, chunk) => seen.push([sessionId, chunk.type])})
    const run = gatedRun({type: EventType.RUN_STARTED, threadId: 'a', runId: 'a'})
    const merged = bus.run('h-a', run.stream)
    run.release()
    await drain(merged)
    expect(seen).toContainEqual(['h-a', EventType.RUN_STARTED])
  })
})
