import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../helpers/boot.js'
import {hydratedSnapshot} from '../helpers/fake-session.js'
import {userTexts} from '../helpers/snapshots.js'

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

describe('a run whose log is joined while it is still starting is tailed once (IT)', () => {
  it('delivers each run-started and each text delta exactly once', async () => {
    const kit = await boot()
    const sessionId = await kit.session()

    const turn = await kit.turn('say hello', {session: sessionId, runId: 'double-tail-1'})
    const joined = kit.join('double-tail-1')
    const events = await joined.done({hangGuardMs: 25_000})
    await turn.done({hangGuardMs: 25_000})

    expect(runStartsOf(events.all, 'double-tail-1')).toBe(1)
    const spoken = textDeltasOf(events.all).join('')
    expect(spoken).not.toBe('')
    const firstHalf = spoken.slice(0, spoken.length / 2)
    const doubled = spoken.length % 2 === 0 && firstHalf === spoken.slice(spoken.length / 2)
    expect(doubled).toBe(false)
  }, 60_000)

  it('does not replay a settled run into the next hydrate', async () => {
    const kit = await boot()
    const sessionId = await kit.session()
    const turn = await kit.turn('say hello', {session: sessionId, runId: 'double-tail-2'})
    await turn.done({hangGuardMs: 25_000})

    expect(userTexts(await hydratedSnapshot(kit, sessionId))).toEqual(['say hello'])
  }, 60_000)
})
