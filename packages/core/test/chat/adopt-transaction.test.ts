import {rmSync} from 'node:fs'
import {eq} from 'drizzle-orm'
import {afterEach, describe, expect, it} from 'vitest'
import {sessions, type ConcivDb} from '@conciv/db'
import type {HarnessAdapter, HarnessAttachResult, HarnessLiveSession} from '@conciv/protocol/harness-types'
import {adoptLiveSession, attachedElsewhere, detachLiveSession, processAlive} from '../../src/chat/adopt.js'
import type {ChatDeps} from '../../src/chat/runtime.js'
import {makeChatFixture, type ChatFixture} from '../helpers/chat-fixture.js'

const HARNESS_SESSION = '9f1c2b3a-4d5e-4f60-8a71-b2c3d4e5f607'
const REQUEST_URL = 'http://127.0.0.1:1234/rpc/sessions/attachAdopt'
const OTHER_PID = 424242

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, {recursive: true, force: true})
})

type AttachSpy = {uninstalls: number}

type AttachOverrides = {
  install?: () => Promise<HarnessAttachResult>
  candidates?: () => Promise<HarnessLiveSession[]>
  processAlive?: (pid: number) => boolean
  db?: ConcivDb
}

function liveSession(cwd: string, pid: number): HarnessLiveSession {
  return {pid, cwd, sessionId: HARNESS_SESSION, name: 'terminal', status: 'idle'}
}

async function fixture(): Promise<ChatFixture> {
  const made = await makeChatFixture()
  scratch.push(made.stateRoot)
  return made
}

function wire(base: ChatFixture, over: AttachOverrides = {}): {deps: ChatDeps; spy: AttachSpy} {
  const spy: AttachSpy = {uninstalls: 0}
  const attach = {
    candidates: over.candidates ?? (() => Promise.resolve([liveSession(base.chat.cwd, process.pid)])),
    install: () => over.install?.() ?? Promise.resolve({ok: true, reloadCommand: '/reload-plugins --force'}),
    uninstall: () => {
      spy.uninstalls += 1
      return Promise.resolve()
    },
  }
  const harness: HarnessAdapter = Object.assign({}, base.chat.harness, {attach})
  const deps: ChatDeps = {...base.chat, harness, db: over.db ?? base.chat.db, processAlive: over.processAlive}
  return {deps, spy}
}

function adopt(deps: ChatDeps, pid: number = process.pid) {
  return adoptLiveSession(deps, {harnessSessionId: HARNESS_SESSION, pid, force: false, requestUrl: REQUEST_URL})
}

async function rowFor(db: ConcivDb, sessionId: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId))
  const row = rows[0]
  if (!row) throw new Error(`no session row for ${sessionId}`)
  return row
}

async function adoptedRow(db: ConcivDb) {
  const rows = await db.select().from(sessions).where(eq(sessions.harnessSessionId, HARNESS_SESSION))
  const row = rows[0]
  if (!row) throw new Error('no adopted session row')
  return row
}

function brokenTransactions(db: ConcivDb): ConcivDb {
  return new Proxy(db, {
    get: (target, key) => {
      if (key === 'transaction')
        return () => {
          throw new Error('database is locked')
        }
      const value = Reflect.get(target, key) as unknown
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  }) as ConcivDb
}

describe('adopting a live session is all or nothing', () => {
  it('reports a refused install and leaves every attachment field alone', async () => {
    const base = await fixture()
    const {deps} = wire(base, {
      install: () => Promise.resolve({ok: false, reloadCommand: '', detail: 'claude refused the conciv plugin'}),
    })

    const outcome = await adopt(deps)

    expect(outcome).toMatchObject({ok: false, code: 'INSTALL_FAILED'})
    const row = await adoptedRow(base.db)
    expect(row.attachedPid).toBeNull()
    expect(row.attachedAt).toBeNull()
    expect(row.transcriptCwd).toBeNull()
  })

  it('resolves instead of rejecting when the install throws', async () => {
    const base = await fixture()
    const {deps} = wire(base, {install: () => Promise.reject(new Error('EACCES: permission denied'))})

    const outcome = await adopt(deps)

    expect(outcome).toMatchObject({ok: false, code: 'INSTALL_FAILED'})
    expect(outcome.ok ? '' : outcome.detail).toContain('EACCES')
    const row = await adoptedRow(base.db)
    expect(row.attachedPid).toBeNull()
    expect(row.attachedAt).toBeNull()
    expect(row.transcriptCwd).toBeNull()
  })

  it('rolls the plugin back when the attachment cannot be written', async () => {
    const base = await fixture()
    const {deps, spy} = wire(base, {db: brokenTransactions(base.db)})

    const outcome = await adopt(deps)

    expect(outcome).toMatchObject({ok: false, code: 'ATTACH_FAILED'})
    expect(spy.uninstalls).toBe(1)
    const row = await adoptedRow(base.db)
    expect(row.attachedPid).toBeNull()
    expect(row.transcriptCwd).toBeNull()
  })

  it('refuses to steal a conversation another live terminal already drives', async () => {
    const base = await fixture()
    const {deps, spy} = wire(base, {processAlive: () => true})
    const first = await adopt(deps)
    if (!first.ok) throw new Error(`first adopt failed: ${first.detail}`)
    await base.db.update(sessions).set({attachedPid: OTHER_PID}).where(eq(sessions.id, first.sessionId))

    const outcome = await adopt(deps)

    expect(outcome).toMatchObject({ok: false, code: 'ATTACH_CONFLICT'})
    expect((await rowFor(base.db, first.sessionId)).attachedPid).toBe(OTHER_PID)
    expect(spy.uninstalls).toBe(0)
  })
})

describe('the liveness probe', () => {
  it('reads a permission error as a live process', () => {
    expect(processAlive(1)).toBe(true)
  })

  it('keeps the attachment while the probe says the terminal is alive', async () => {
    const base = await fixture()
    const {deps} = wire(base, {processAlive: () => true})
    const adopted = await adopt(deps)
    if (!adopted.ok) throw new Error(`adopt failed: ${adopted.detail}`)

    expect(await attachedElsewhere(deps, adopted.sessionId)).toBe(true)
    expect((await rowFor(base.db, adopted.sessionId)).attachedPid).toBe(process.pid)
  })

  it('clears the attachment when the terminal no longer lists that session', async () => {
    const base = await fixture()
    const listed = {value: true}
    const {deps} = wire(base, {
      processAlive: () => true,
      candidates: () => Promise.resolve(listed.value ? [liveSession(base.chat.cwd, process.pid)] : []),
    })
    const adopted = await adopt(deps)
    if (!adopted.ok) throw new Error(`adopt failed: ${adopted.detail}`)
    listed.value = false

    expect(await attachedElsewhere(deps, adopted.sessionId)).toBe(false)
    expect((await rowFor(base.db, adopted.sessionId)).attachedPid).toBeNull()
  })
})

describe('detaching a session that was never attached', () => {
  it('does nothing and leaves the plugin installed', async () => {
    const base = await fixture()
    const {deps, spy} = wire(base)

    expect(await detachLiveSession(deps, base.sessionId)).toBe(false)
    expect(spy.uninstalls).toBe(0)
  })

  it('reports the hand-back when a terminal really was driving the session', async () => {
    const base = await fixture()
    const {deps, spy} = wire(base)
    const adopted = await adopt(deps)
    if (!adopted.ok) throw new Error(`adopt failed: ${adopted.detail}`)

    expect(await detachLiveSession(deps, adopted.sessionId)).toBe(true)
    expect(spy.uninstalls).toBe(1)
  })
})
