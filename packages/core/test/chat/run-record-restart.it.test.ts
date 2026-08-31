import {afterEach, describe, expect, it} from 'vitest'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {isRunPhaseTerminal, runLifecycleOf, type RunLifecycle} from '@conciv/protocol/run-types'
import {createTestkit, type Kit, type RunStream} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()

async function nextLifecycle(stream: RunStream, match: (chunk: StreamChunk) => boolean): Promise<RunLifecycle> {
  const lifecycle = runLifecycleOf(await stream.waitFor(match, {hangGuardMs: 20_000}))
  if (!lifecycle) throw new Error('the matched chunk did not carry a run lifecycle')
  return lifecycle
}

function isTerminalLifecycle(chunk: StreamChunk): boolean {
  const lifecycle = runLifecycleOf(chunk)
  return lifecycle !== null && isRunPhaseTerminal(lifecycle.phase)
}

describe('run records survive a server restart (IT)', () => {
  const state: {kits: Kit[]; roots: string[]} = {kits: [], roots: []}

  afterEach(async () => {
    for (const kit of state.kits.splice(0)) await kit.cleanup()
    for (const root of state.roots.splice(0)) rmSync(root, {recursive: true, force: true})
  })

  function stateRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'conciv-restart-'))
    state.roots.push(root)
    return root
  }

  async function boot(root: string, firstChunkTimeoutMs?: number): Promise<Kit> {
    const kit = await createTestkit(
      claude,
      bootCoreApp({
        fakeClaude: firstChunkTimeoutMs ? {env: () => ({CONCIV_FAKE_HANG: '1'})} : {},
        ...(firstChunkTimeoutMs ? {firstChunkTimeoutMs} : {}),
      }),
      {stateRoot: root},
    ).setup()
    state.kits.push(kit)
    return kit
  }

  it('reports the finished run timing to a subscriber on a fresh server over the same database', async () => {
    const root = stateRoot()
    const first = await boot(root)
    const sessionId = await first.session()
    const stream = await first.turn('say hello', {session: sessionId, runId: 'restart-done'})
    await stream.done({hangGuardMs: 20_000})
    const original = await nextLifecycle(stream, isTerminalLifecycle)
    expect(original.phase).toBe('completed')

    const restarted = await boot(root)
    const replayed = (await restarted.hydrate(await restarted.session(sessionId))).lastRun
    expect(replayed).toMatchObject({
      runId: 'restart-done',
      phase: 'completed',
      startedAt: original.startedAt,
      finishedAt: original.finishedAt,
    })
  }, 90_000)

  it('reports the terminal error of a failed run on a fresh server over the same database', async () => {
    const root = stateRoot()
    const first = await boot(root, 300)
    const sessionId = await first.session()
    const stream = await first.turn('never answers', {session: sessionId, runId: 'restart-failed'})
    await stream.waitFor((chunk) => chunk.type === EventType.RUN_ERROR, {hangGuardMs: 20_000})
    const original = await nextLifecycle(stream, isTerminalLifecycle)
    expect(original.phase).toBe('failed')

    const restarted = await boot(root, 300)
    const replayed = (await restarted.hydrate(await restarted.session(sessionId))).lastRun
    expect(replayed?.runId).toBe('restart-failed')
    expect(replayed?.phase).toBe('failed')
    expect(replayed?.error).toContain('no output')
    expect(replayed?.finishedAt).toBe(original.finishedAt)
  }, 90_000)
})
