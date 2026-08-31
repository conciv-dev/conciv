import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {createTestHarness} from '@conciv/harness-testkit'
import {SessionId} from '@conciv/protocol/chat-types'
import type {MadeApp} from '../../src/app.js'
import {ensureRow} from '../../src/chat/session-rows.js'
import {rpcSessionList} from '../../src/api/rpc/sessions.js'
import {bootMadeApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

const SESSION = SessionId.parse('conciv_liveness')

describe('session liveness is read from the run record (IT)', () => {
  const state = {made: undefined as MadeApp | undefined, root: undefined as string | undefined}

  afterEach(async () => {
    if (state.made) await state.made.dispose()
    if (state.root) rmSync(state.root, {recursive: true, force: true})
    state.made = undefined
    state.root = undefined
  })

  async function boot(): Promise<MadeApp> {
    const harness = createTestHarness(requireClaude())
    const root = mkdtempSync(join(tmpdir(), 'conciv-liveness-'))
    state.root = root
    const made = await bootMadeApp({stateRoot: root, cwd: root, harness})
    state.made = made
    await ensureRow(made.chat.db, SESSION, harness.id, root)
    return made
  }

  it('the session list reports a session with a running run record as running', {timeout: 30_000}, async () => {
    const made = await boot()
    await made.chat.runs.createOrResume({runId: 'liveness-listed', threadId: SESSION, startedAt: Date.now()})
    const listed = await rpcSessionList(made.chat, false)
    expect(listed.find((meta) => meta.id === SESSION)?.running).toBe(true)
    await made.chat.runs.update('liveness-listed', {status: 'completed', finishedAt: Date.now()})
    const settled = await rpcSessionList(made.chat, false)
    expect(settled.find((meta) => meta.id === SESSION)?.running).toBe(false)
  })

  it('the session scope reports live from the run record', {timeout: 30_000}, async () => {
    const made = await boot()
    const scope = made.runtime.forSession(SESSION)
    await expect(scope.run.live()).resolves.toBe(false)
    await made.chat.runs.createOrResume({runId: 'liveness-scope', threadId: SESSION, startedAt: Date.now()})
    await expect(scope.run.live()).resolves.toBe(true)
  })
})
