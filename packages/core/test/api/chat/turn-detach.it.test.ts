import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {EventType} from '@tanstack/ai'
import {createTestkit, until, type Kit, type RunStream} from '@conciv/harness-testkit'
import {readLock, releaseLock} from '../../../src/store/lock.js'
import {bootCoreApp} from '../../helpers/boot.js'
import {requireClaude} from '../../helpers/adapters.js'

const claude = requireClaude()
const dirs: string[] = []

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-detach-it-'))
  dirs.push(dir)
  return dir
}

const turn = (text: string) => ({id: 'u-live', role: 'user', parts: [{type: 'text', content: text}]})
const contentTurn = (text: string) => ({role: 'user', content: text})

async function waitForSnapshot(stream: RunStream): Promise<string> {
  const chunk = await stream.waitFor((c) => c.type === EventType.CUSTOM && c.name === 'conciv-snapshot', {
    hangGuardMs: 5000,
  })
  return chunk.type === EventType.CUSTOM ? JSON.stringify(chunk.value) : ''
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

  it('rejects a resend while the prior turn is still generating even if its lock file is gone (stop-drain guard)', async () => {
    const kit = await setupHang()
    const id = await kit.session()
    await kit.post('/api/chat', {messages: [turn('hi')]}, id)
    await until(() => readLock(kit.stateRoot, id).held, {hangGuardMs: 5000})
    releaseLock(kit.stateRoot, id)
    expect(readLock(kit.stateRoot, id).held).toBe(false)
    const resend = await kit.post('/api/chat', {messages: [turn('again')]}, id)
    expect(resend.status).toBe(409)
    await kit.post('/api/chat/stop', {}, id)
  })

  it('POST /api/chat returns ok JSON before the turn finishes', async () => {
    const releaseFile = join(tmp(), 'release')
    const kit = await setupSlow(releaseFile)
    const id = await kit.session()
    const stream = await kit.attach(id)
    const response = await kit.post('/api/chat', {messages: [turn('hi')]}, id)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ok: true})
    writeFileSync(releaseFile, '')
    const events = await stream.done()
    expect(events.runs()).toBe(1)
  })

  it('a mid-run attach replays from RUN_STARTED and continues live', async () => {
    const releaseFile = join(tmp(), 'release')
    const kit = await setupSlow(releaseFile)
    const id = await kit.session()
    await kit.post('/api/chat', {messages: [turn('hi')]}, id)
    const early = await kit.attach(id)
    const snapshot = await waitForSnapshot(early)
    expect(snapshot).toContain('"generating":true')
    await early.waitFor((c) => c.type === EventType.RUN_STARTED, {hangGuardMs: 3000})
    await early.waitForText('first-half')
    writeFileSync(releaseFile, '')
    const late = await kit.attach(id)
    const events = await late.done()
    expect(events.all.some((c) => c.type === EventType.RUN_STARTED)).toBe(true)
    expect(events.text()).toContain('first-half')
    expect(events.text()).toContain('second-half')
    expect(events.runs()).toBe(1)
  })

  it('a dropped and re-opened attach sees the complete turn (reload simulation)', async () => {
    const releaseFile = join(tmp(), 'release')
    const kit = await setupSlow(releaseFile)
    const id = await kit.session()
    await kit.post('/api/chat', {messages: [turn('rebuild the page')]}, id)
    const drop = new AbortController()
    const before = await kit.attach(id, {signal: drop.signal})
    const snapshot = await waitForSnapshot(before)
    expect(snapshot).toContain('"generating":true')
    expect(snapshot).toContain('rebuild the page')
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
    const kit = await setup()
    const id = await kit.session()
    await kit.post('/api/chat', {messages: [turn('hi')]}, id)
    await until(
      async () => {
        const session = (await (await kit.get('/api/chat/session', id)).json()) as {usage: unknown}
        return Boolean(session.usage)
      },
      {hangGuardMs: 5000},
    )
  })

  it('attach during a content-form (parts-less) turn returns a snapshot with the user text, not 500', async () => {
    const releaseFile = join(tmp(), 'release')
    const kit = await setupSlow(releaseFile)
    const id = await kit.session()
    const response = await kit.post('/api/chat', {messages: [contentTurn('summarize this')]}, id)
    expect(response.status).toBe(200)
    const early = await kit.attach(id)
    const snapshot = await waitForSnapshot(early)
    expect(snapshot).toContain('"generating":true')
    expect(snapshot).toContain('summarize this')
    writeFileSync(releaseFile, '')
    const late = await kit.attach(id)
    const events = await late.done()
    expect(events.runs()).toBe(1)
  })

  it('a deliberate stop ends the turn with a clean terminal chunk, not a RUN_ERROR banner', async () => {
    const kit = await setupHang()
    const id = await kit.session()
    const stream = await kit.attach(id)
    await kit.post('/api/chat', {messages: [turn('hang around')]}, id)
    await stream.waitFor((c) => c.type === EventType.RUN_STARTED, {hangGuardMs: 5000})
    await kit.post('/api/chat/stop', {}, id)
    const events = await stream.done({hangGuardMs: 8000})
    expect(events.runs()).toBe(1)
    expect(events.errors()).toEqual([])
    expect(events.text()).not.toContain('143')
  })

  it('attach on an idle session emits a snapshot with generating:false', async () => {
    const kit = await setupSlow(join(tmp(), 'never'))
    const id = await kit.session()
    const stream = await kit.attach(id)
    const snapshot = await waitForSnapshot(stream)
    expect(snapshot).toContain('"generating":false')
  })
})
