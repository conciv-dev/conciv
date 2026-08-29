import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {makeSend} from '../../src/chat/run.js'
import {makeChatFixture, type ChatFixture} from '../helpers/chat-fixture.js'
import {drivingRun} from '../helpers/run-drivers.js'

const PROBE_EVENT = 'isolation-probe'

async function runToCompletion(fixture: ChatFixture, runId: string, origin: string): Promise<void> {
  fixture.harness.script.scriptCustomEvent(PROBE_EVENT, {origin})
  const send = makeSend(fixture.chat)
  await send(fixture.sessionId, runId, `hello from ${origin}`)
  await drivingRun(fixture.chat, runId).settled
}

async function replayRunLog(fixture: ChatFixture, runId: string): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const entry of fixture.chat.runControl.attach(runId, '-1')) chunks.push(entry.chunk)
  return chunks
}

function probeOrigins(chunks: StreamChunk[]): string[] {
  return chunks.flatMap((chunk) => {
    if (chunk.type !== EventType.CUSTOM || chunk.name !== PROBE_EVENT) return []
    const value = chunk.value
    if (typeof value !== 'object' || value === null || !('origin' in value)) return []
    return typeof value.origin === 'string' ? [value.origin] : []
  })
}

describe('run log isolation between app instances (IT)', () => {
  it('two instances reusing one runId never replay each other chunks', {timeout: 15_000}, async () => {
    const first = await makeChatFixture()
    const second = await makeChatFixture()
    const runId = 'instance-isolation-shared-1'
    await runToCompletion(first, runId, 'first')
    await runToCompletion(second, runId, 'second')
    expect(probeOrigins(await replayRunLog(second, runId))).toEqual(['second'])
    expect(probeOrigins(await replayRunLog(first, runId))).toEqual(['first'])
  })
})
