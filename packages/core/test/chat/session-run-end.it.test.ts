import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()

function isRunEnd(chunk: StreamChunk): boolean {
  if (chunk.type === EventType.RUN_ERROR) return true
  return chunk.type === EventType.RUN_FINISHED && chunk.finishReason !== 'tool_calls'
}

describe('the session stream carries the end of a run (IT)', () => {
  const state = {kit: undefined as Kit | undefined}

  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
  })

  it('announces a settled run on the session stream, not only on the run stream', async () => {
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {}})).setup()
    state.kit = kit
    const sessionId = await kit.session()
    const events = await kit.events(sessionId)
    const stream = await kit.turn('say hello', {session: sessionId, runId: 'session-run-end'})
    await stream.done({hangGuardMs: 20_000})

    const ended = await events.waitFor(isRunEnd, {hangGuardMs: 15_000})
    expect(ended).toMatchObject({runId: 'session-run-end'})
  })

  it('announces a stopped run on the session stream so a client that stopped reading still learns it ended', async () => {
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {env: () => ({CONCIV_FAKE_HANG: '1'})}})).setup()
    state.kit = kit
    const sessionId = await kit.session()
    const events = await kit.events(sessionId)
    const stream = await kit.turn('hang around', {session: sessionId, runId: 'session-run-stopped'})
    await stream.waitForRunStart()

    await kit.rpc.chat.stop({sessionId})

    const ended = await events.waitFor(isRunEnd, {hangGuardMs: 20_000})
    expect(ended).toMatchObject({runId: 'session-run-stopped'})
  })
})
