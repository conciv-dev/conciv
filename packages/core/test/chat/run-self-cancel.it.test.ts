import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it, vi} from 'vitest'
import {requestRunCancel} from '@tanstack/ai'
import {SessionId} from '@conciv/protocol/chat-types'
import {makeSend} from '../../src/chat/run.js'
import {bootMadeApp} from '../helpers/boot.js'
import {useMadeApps} from '../helpers/made-apps.js'
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
  const apps = useMadeApps()
  const tmp = apps.tmp

  it('requestRunCancel alone ends the run and kills the harness', {timeout: 30_000}, async () => {
    const pidFile = join(tmp('conciv-self-cancel-pid-'), 'pid')
    const made = await bootMadeApp(
      {stateRoot: tmp('conciv-self-cancel-state-'), cwd: tmp('conciv-self-cancel-cwd-'), harness: claude},
      {fakeClaude: {env: () => ({CONCIV_FAKE_HANG: '1', CONCIV_TEST_PID_FILE: pidFile})}},
    )
    apps.keep(made)
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
