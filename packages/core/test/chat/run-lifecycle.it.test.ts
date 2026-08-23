import {afterEach, describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {isRunPhaseTerminal, runLifecycleOf, type RunLifecycle} from '@conciv/protocol/run-types'
import {createTestkit, type Kit, type RunStream} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()

function isLifecyclePhase(chunk: StreamChunk, phase: RunLifecycle['phase']): boolean {
  return runLifecycleOf(chunk)?.phase === phase
}

function isTerminalLifecycle(chunk: StreamChunk): boolean {
  const lifecycle = runLifecycleOf(chunk)
  return lifecycle !== null && isRunPhaseTerminal(lifecycle.phase)
}

async function nextLifecycle(stream: RunStream, match: (chunk: StreamChunk) => boolean): Promise<RunLifecycle> {
  const lifecycle = runLifecycleOf(await stream.waitFor(match, {hangGuardMs: 15_000}))
  if (!lifecycle) throw new Error('the matched chunk did not carry a run lifecycle')
  return lifecycle
}

describe('run lifecycle on the wire (IT)', () => {
  const state = {kit: undefined as Kit | undefined}

  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
  })

  it('publishes a terminal lifecycle carrying the run id, the phase, and both timestamps', async () => {
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {}})).setup()
    state.kit = kit
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: 'lifecycle-1', sessionId, text: 'say hello'})
    await stream.done({hangGuardMs: 20_000})
    const terminal = await nextLifecycle(stream, isTerminalLifecycle)
    expect(terminal.runId).toBe('lifecycle-1')
    expect(terminal.phase).toBe('completed')
    expect(terminal.error).toBeNull()
    expect(typeof terminal.startedAt).toBe('number')
    expect(terminal.finishedAt).toBeGreaterThanOrEqual(terminal.startedAt)
  })

  it('replays the last run lifecycle to a fresh subscriber so timing survives a reload', async () => {
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {}})).setup()
    state.kit = kit
    const sessionId = await kit.session()
    const first = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: 'lifecycle-replay', sessionId, text: 'say hello'})
    await first.done({hangGuardMs: 20_000})
    const original = await nextLifecycle(first, isTerminalLifecycle)

    const reloaded = await kit.attach(sessionId)
    const replayed = await nextLifecycle(reloaded, (chunk) => runLifecycleOf(chunk) !== null)
    expect(replayed.runId).toBe('lifecycle-replay')
    expect(replayed.phase).toBe('completed')
    expect(replayed.startedAt).toBe(original.startedAt)
    expect(replayed.finishedAt).toBe(original.finishedAt)
  })

  it('acknowledges a stop immediately, before the run has settled', async () => {
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {env: () => ({CONCIV_FAKE_HANG: '1'})}})).setup()
    state.kit = kit
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: 'lifecycle-stop', sessionId, text: 'hang around'})
    await stream.waitFor((chunk) => chunk.type === EventType.RUN_STARTED, {hangGuardMs: 10_000})

    const stopping = nextLifecycle(stream, (chunk) => isLifecyclePhase(chunk, 'stopping'))
    await kit.rpc.chat.stop({sessionId})
    const acked = await stopping
    expect(acked.runId).toBe('lifecycle-stop')
    expect(acked.phase).toBe('stopping')
    expect(acked.finishedAt).toBeNull()

    await stream.done({hangGuardMs: 20_000})
    const settled = await nextLifecycle(stream, isTerminalLifecycle)
    expect(settled.runId).toBe('lifecycle-stop')
    expect(settled.finishedAt).not.toBeNull()
  })

  it('reports a run that failed with the terminal error as the reason', async () => {
    const kit = await createTestkit(
      claude,
      bootCoreApp({fakeClaude: {env: () => ({CONCIV_FAKE_HANG: '1'})}, firstChunkTimeoutMs: 300}),
    ).setup()
    state.kit = kit
    const sessionId = await kit.session()
    const stream = await kit.attach(sessionId)
    await kit.rpc.chat.send({runId: 'lifecycle-fail', sessionId, text: 'never answers'})
    await stream.waitFor((chunk) => chunk.type === EventType.RUN_ERROR, {hangGuardMs: 20_000})

    const reloaded = await kit.attach(sessionId)
    const replayed = await nextLifecycle(reloaded, (chunk) => runLifecycleOf(chunk) !== null)
    expect(replayed.phase).toBe('failed')
    expect(replayed.error).toContain('no output')
  })
})
