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

async function hydratedText(kit: Kit, session: string): Promise<string> {
  return JSON.stringify((await kit.hydrate(session)).messages)
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

  async function startSlowTurn(text: string): Promise<{kit: Kit; id: string; releaseFile: string; run: RunStream}> {
    const releaseFile = join(tmp(), 'release')
    const kit = await setupSlow(releaseFile)
    const id = await kit.session()
    const run = await kit.turn(text, {session: id, runId: 'turn-detach-1'})
    return {kit, id, releaseFile, run}
  }

  it('a resend settles the run still generating and completes on its own', async () => {
    const releaseFile = join(tmp(), 'release')
    const kit = await setupSlow(releaseFile)
    const id = await kit.session()
    const first = await kit.turn('hi', {session: id, runId: 'turn-detach-2'})
    await first.waitForRunStart()
    const second = await kit.turn('again', {session: id, runId: 'turn-detach-3'})
    await second.waitForRunStart()
    writeFileSync(releaseFile, '')
    await first.waitFor((c) => c.type === EventType.RUN_ERROR || c.type === EventType.RUN_FINISHED, {
      hangGuardMs: 10_000,
    })
    await second.waitFor((c) => c.type === EventType.RUN_FINISHED && runIdOf(c) === 'turn-detach-3', {
      hangGuardMs: 10_000,
    })
    expect((await kit.hydrate(id)).activeRun).toBeNull()
  })

  it('a turn starts streaming long before the harness finishes', async () => {
    const releaseFile = join(tmp(), 'release')
    const kit = await setupSlow(releaseFile)
    const id = await kit.session()
    const stream = await kit.turn('hi', {session: id, runId: 'turn-detach-4'})
    await stream.waitForRunStart()
    expect((await kit.hydrate(id)).activeRun).toEqual({runId: 'turn-detach-4'})
    writeFileSync(releaseFile, '')
    const events = await stream.done()
    expect(events.runs()).toBe(1)
  })

  it('a mid-run joiner replays what it missed, keeps RUN_STARTED, and continues live', async () => {
    const {kit, id, releaseFile, run} = await startSlowTurn('hi')
    await run.waitForRunStart()
    await run.waitForText('first-half')
    const late = kit.join('turn-detach-1')
    await late.waitForText('first-half')
    expect(await hydratedText(kit, id)).toContain('first-half')
    writeFileSync(releaseFile, '')
    const events = await late.done()
    expect(events.all.some((c) => c.type === EventType.RUN_STARTED)).toBe(true)
    expect(events.text()).toContain('first-half')
    expect(events.text()).toContain('second-half')
    expect(events.runs()).toBe(1)
  })

  it('a dropped and re-joined viewer sees the complete turn (reload simulation)', async () => {
    const {kit, id, releaseFile, run} = await startSlowTurn('rebuild the page')
    await run.waitForRunStart()
    expect(await hydratedText(kit, id)).toContain('rebuild the page')
    await run.waitForText('first-half')
    writeFileSync(releaseFile, '')
    const after = kit.join('turn-detach-1')
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
    await kit.turn('hi', {session: id, runId: 'turn-detach-5'})
    expect(await runEnded).toBe(id)
    const metas = await kit.rpc.sessions.list(undefined)
    expect(metas.find((meta) => meta.id === id)?.usage).toBeTruthy()
  })

  it('hydrating during a running turn carries the user text and the live run', async () => {
    const {kit, id, releaseFile, run} = await startSlowTurn('summarize this')
    await run.waitForRunStart()
    const hydration = await kit.hydrate(id)
    expect(JSON.stringify(hydration.messages)).toContain('summarize this')
    expect(hydration.activeRun).toEqual({runId: 'turn-detach-1'})
    writeFileSync(releaseFile, '')
    const events = await run.done()
    expect(events.runs()).toBe(1)
  })

  it(
    'a deliberate stop ends the turn with a clean terminal chunk, not a RUN_ERROR banner',
    {timeout: 30_000},
    async () => {
      const kit = await setupHang()
      const id = await kit.session()
      const stream = await kit.turn('hang around', {session: id, runId: 'turn-detach-6'})
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
      const stream = await kit.turn('hang forever', {session: id, runId: 'turn-detach-7'})
      await stream.waitForRunStart()
      await kit.rpc.chat.stop({sessionId: id})
      const events = await stream.done({hangGuardMs: 10_000})
      expect(events.runs()).toBe(1)
      expect(events.errors()).toEqual([])
    },
  )

  it('hydrating an idle session carries an empty transcript and no run', async () => {
    const kit = await setupSlow(join(tmp(), 'never'))
    const id = await kit.session()
    expect(await kit.hydrate(id)).toEqual({messages: [], activeRun: null, lastRun: null, interrupts: null})
  })
})
