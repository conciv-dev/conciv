import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {EventType} from '@tanstack/ai'
import {createTestkit, type Kit, type RunStream} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'
import {makeRunEndProbe} from '../helpers/run-end-probe.js'

const claude = requireClaude()
const dirs: string[] = []

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-detach-it-'))
  dirs.push(dir)
  return dir
}

function runIdOf(chunk: {runId?: unknown}): string | null {
  return typeof chunk.runId === 'string' ? chunk.runId : null
}

async function waitForSnapshot(stream: RunStream): Promise<string> {
  const chunk = await stream.waitFor((c) => c.type === EventType.MESSAGES_SNAPSHOT, {
    hangGuardMs: 5000,
  })
  return chunk.type === EventType.MESSAGES_SNAPSHOT ? JSON.stringify(chunk.messages) : ''
}

describe('detached turns (IT)', () => {
  const state = {kit: undefined as Kit | undefined}
  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  async function setup(env: NodeJS.ProcessEnv = {}): Promise<Kit> {
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {env: () => env}})).setup()
    state.kit = kit
    return kit
  }
  const setupSlow = (releaseFile: string) => setup({CONCIV_FAKE_RELEASE_FILE: releaseFile})
  const setupHang = () => setup({CONCIV_FAKE_HANG: '1'})

  async function startSlowTurn(text: string): Promise<{kit: Kit; id: string; releaseFile: string}> {
    const releaseFile = join(tmp(), 'release')
    const kit = await setupSlow(releaseFile)
    const id = await kit.session()
    await kit.rpc.chat.send({runId: 'turn-detach-1', sessionId: id, text})
    return {kit, id, releaseFile}
  }

  it('a resend while the prior turn is still generating runs concurrently to completion', async () => {
    const releaseFile = join(tmp(), 'release')
    const kit = await setupSlow(releaseFile)
    const id = await kit.session()
    const stream = await kit.attach(id)
    await kit.rpc.chat.send({runId: 'turn-detach-2', sessionId: id, text: 'hi'})
    await stream.waitForRunStart()
    await expect(kit.rpc.chat.send({runId: 'turn-detach-3', sessionId: id, text: 'again'})).resolves.toEqual({
      ok: true,
      runId: 'turn-detach-3',
    })
    writeFileSync(releaseFile, '')
    await stream.waitFor((c) => c.type === EventType.RUN_FINISHED && runIdOf(c) === 'turn-detach-2', {
      hangGuardMs: 10_000,
    })
    await stream.waitFor((c) => c.type === EventType.RUN_FINISHED && runIdOf(c) === 'turn-detach-3', {
      hangGuardMs: 10_000,
    })
  })

  it('chat.send resolves ok before the turn finishes', async () => {
    const releaseFile = join(tmp(), 'release')
    const kit = await setupSlow(releaseFile)
    const id = await kit.session()
    const stream = await kit.attach(id)
    expect(await kit.rpc.chat.send({runId: 'turn-detach-4', sessionId: id, text: 'hi'})).toEqual({
      ok: true,
      runId: 'turn-detach-4',
    })
    writeFileSync(releaseFile, '')
    const events = await stream.done()
    expect(events.runs()).toBe(1)
  })

  it('a mid-run attach catches up in the snapshot, keeps RUN_STARTED, and continues live', async () => {
    const {kit, id, releaseFile} = await startSlowTurn('hi')
    const early = await kit.attach(id)
    await waitForSnapshot(early)
    await early.waitForRunStart()
    await early.waitForText('first-half')
    const late = await kit.attach(id)
    const catchUp = await waitForSnapshot(late)
    expect(catchUp).toContain('first-half')
    writeFileSync(releaseFile, '')
    const events = await late.done()
    expect(events.all.some((c) => c.type === EventType.RUN_STARTED)).toBe(true)
    expect(events.text()).toContain('first-half')
    expect(events.text()).toContain('second-half')
    expect(events.runs()).toBe(1)
  })

  it('a dropped and re-opened attach sees the complete turn (reload simulation)', async () => {
    const {kit, id, releaseFile} = await startSlowTurn('rebuild the page')
    const drop = new AbortController()
    const before = await kit.attach(id, {signal: drop.signal})
    const snapshot = await waitForSnapshot(before)
    expect(snapshot).toContain('rebuild the page')
    await before.waitForRunStart()
    await before.waitForText('first-half')
    drop.abort()
    writeFileSync(releaseFile, '')
    const after = await kit.attach(id)
    const events = await after.done()
    expect(events.text()).toContain('first-half')
    expect(events.text()).toContain('second-half')
    expect(events.runs()).toBe(1)
  })

  it('the turn completes with zero subscribers and persists usage', async () => {
    const {probe, runEnded} = makeRunEndProbe()
    const kit = await createTestkit(claude, bootCoreApp({fakeClaude: {}, extensions: [probe]})).setup()
    state.kit = kit
    const id = await kit.session()
    await kit.rpc.chat.send({runId: 'turn-detach-5', sessionId: id, text: 'hi'})
    expect(await runEnded).toBe(id)
    const metas = await kit.rpc.sessions.list(undefined)
    expect(metas.find((meta) => meta.id === id)?.usage).toBeTruthy()
  })

  it('attach during a running turn returns a snapshot with the user text, not 500', async () => {
    const {kit, id, releaseFile} = await startSlowTurn('summarize this')
    const early = await kit.attach(id)
    const snapshot = await waitForSnapshot(early)
    expect(snapshot).toContain('summarize this')
    await early.waitForRunStart()
    writeFileSync(releaseFile, '')
    const late = await kit.attach(id)
    const events = await late.done()
    expect(events.runs()).toBe(1)
  })

  it(
    'a deliberate stop ends the turn with a clean terminal chunk, not a RUN_ERROR banner',
    {timeout: 30_000},
    async () => {
      const kit = await setupHang()
      const id = await kit.session()
      const stream = await kit.attach(id)
      await kit.rpc.chat.send({runId: 'turn-detach-6', sessionId: id, text: 'hang around'})
      await stream.waitForRunStart()
      await kit.rpc.chat.stop({sessionId: id})
      const events = await stream.done({hangGuardMs: 8000})
      expect(events.runs()).toBe(1)
      expect(events.errors()).toEqual([])
      expect(events.text()).not.toContain('143')
    },
  )

  it(
    'a stop still ends the turn when the harness child ignores the kill (bounded stop grace)',
    {timeout: 30_000},
    async () => {
      const kit = await setup({CONCIV_FAKE_HANG: '1', CONCIV_FAKE_IGNORE_TERM: '1'})
      const id = await kit.session()
      const stream = await kit.attach(id)
      await kit.rpc.chat.send({runId: 'turn-detach-7', sessionId: id, text: 'hang forever'})
      await stream.waitForRunStart()
      await kit.rpc.chat.stop({sessionId: id})
      const events = await stream.done({hangGuardMs: 10_000})
      expect(events.runs()).toBe(1)
      expect(events.errors()).toEqual([])
    },
  )

  it('attach on an idle session emits the messages snapshot first', async () => {
    const kit = await setupSlow(join(tmp(), 'never'))
    const id = await kit.session()
    const stream = await kit.attach(id)
    const snapshot = await waitForSnapshot(stream)
    expect(snapshot).toBe('[]')
  })
})
