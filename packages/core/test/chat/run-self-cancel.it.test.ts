import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {requestRunCancel} from '@tanstack/ai'
import {SessionId} from '@conciv/protocol/chat-types'
import type {MadeApp} from '../../src/app.js'
import {makeSend} from '../../src/chat/run.js'
import {bootMadeApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('a run cancels itself off its own record (IT)', () => {
  const state = {apps: [] as MadeApp[], dirs: [] as string[]}

  afterEach(async () => {
    for (const made of state.apps.splice(0)) await made.dispose()
    for (const dir of state.dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
  })

  function tmp(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    state.dirs.push(dir)
    return dir
  }

  it('requestRunCancel alone ends the run and kills the harness', {timeout: 30_000}, async () => {
    const pidFile = join(tmp('conciv-self-cancel-pid-'), 'pid')
    const made = await bootMadeApp(
      {stateRoot: tmp('conciv-self-cancel-state-'), cwd: tmp('conciv-self-cancel-cwd-'), harness: claude},
      {fakeClaude: {env: () => ({CONCIV_FAKE_HANG: '1', CONCIV_TEST_PID_FILE: pidFile})}},
    )
    state.apps.push(made)
    const sessionId = SessionId.parse('conciv_self-cancel')
    const runId = 'run-self-cancel-1'
    await makeSend(made.chat)(sessionId, runId, 'hang around')
    const harnessPid = {value: 0}
    await vi.waitFor(
      () => {
        harnessPid.value = Number(readFileSync(pidFile, 'utf8'))
        expect(harnessPid.value > 0).toBe(true)
      },
      {timeout: 10_000, interval: 50},
    )

    await requestRunCancel(made.chat.runs, runId)

    await vi.waitFor(() => expect(isAlive(harnessPid.value)).toBe(false), {timeout: 10_000, interval: 50})
    await vi.waitFor(async () => expect(await made.chat.runs.findActiveRun(sessionId)).toBeNull(), {
      timeout: 10_000,
      interval: 50,
    })
  })
})
