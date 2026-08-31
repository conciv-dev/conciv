import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {startTurn} from '../helpers/detached-turn.js'
import {makeChatFixture, type ChatFixture} from '../helpers/chat-fixture.js'
import {awaitRunSettled} from '../../src/chat/run-settled.js'

const PROBE_EVENT = 'isolation-probe'

async function runToCompletion(fixture: ChatFixture, runId: string, origin: string): Promise<void> {
  fixture.harness.script.scriptCustomEvent(PROBE_EVENT, {origin})
  await startTurn(fixture.chat, fixture.sessionId, runId, `hello from ${origin}`)
  await awaitRunSettled(fixture.chat.runs, runId)
}

async function replayRunLog(fixture: ChatFixture, runId: string): Promise<StreamChunk[]> {
  const entries = await fixture.chat.durability(runId).snapshot()
  return entries.map((entry) => entry.chunk)
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
