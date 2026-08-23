import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../helpers/boot.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function boot(): Promise<Kit> {
  const kit = await bootKit({fakeClaude: {}})
  cleanups.push(() => kit.cleanup())
  return kit
}

function runStartsOf(chunks: readonly StreamChunk[], runId: string): number {
  return chunks.filter((chunk) => chunk.type === EventType.RUN_STARTED && 'runId' in chunk && chunk.runId === runId)
    .length
}

function textDeltasOf(chunks: readonly StreamChunk[]): string[] {
  return chunks.flatMap((chunk) =>
    chunk.type === EventType.TEXT_MESSAGE_CONTENT && typeof chunk.delta === 'string' ? [chunk.delta] : [],
  )
}

describe('a run started while a subscription is being established is tailed once (IT)', () => {
  it('delivers each run-started and each text delta exactly once', async () => {
    const kit = await boot()
    const sessionId = await kit.session()

    const attaching = kit.attach(sessionId)
    const sending = kit.rpc.chat.send({runId: 'double-tail-1', sessionId, text: 'say hello'})
    const [stream] = await Promise.all([attaching, sending])
    const events = await stream.done({hangGuardMs: 25_000})

    expect(runStartsOf(events.all, 'double-tail-1')).toBe(1)
    const spoken = textDeltasOf(events.all).join('')
    expect(spoken).not.toBe('')
    const firstHalf = spoken.slice(0, spoken.length / 2)
    const doubled = spoken.length % 2 === 0 && firstHalf === spoken.slice(spoken.length / 2)
    expect(doubled).toBe(false)
  }, 60_000)

  it('does not replay a live run twice when the subscriber arrives mid-run', async () => {
    const kit = await boot()
    const sessionId = await kit.session()
    const keeper = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: 'double-tail-2', sessionId, text: 'say hello'})
    await keeper.done({hangGuardMs: 25_000})

    const late = await kit.attach(sessionId)
    const snapshot = await late.waitFor((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT, {hangGuardMs: 10_000})
    if (snapshot.type !== EventType.MESSAGES_SNAPSHOT) throw new Error('expected a messages snapshot chunk')
    expect(snapshot.messages.filter((message) => message.role === 'user')).toHaveLength(1)
  }, 60_000)
})
