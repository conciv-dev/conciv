import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {SessionId} from '@conciv/protocol/chat-types'
import type {MadeApp} from '../../src/app.js'
import {makeSend} from '../../src/chat/run.js'
import {stopSession} from '../../src/chat/stop.js'
import {bootMadeApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'
import {drivingRun} from '../helpers/run-drivers.js'

const claude = requireClaude()

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('run durability is owned by withSandbox (IT)', () => {
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

  async function boot(env: NodeJS.ProcessEnv): Promise<MadeApp> {
    const made = await bootMadeApp(
      {stateRoot: tmp('conciv-durability-state-'), cwd: tmp('conciv-durability-cwd-'), harness: claude},
      {fakeClaude: {env: () => env}},
    )
    state.apps.push(made)
    return made
  }

  async function loggedChunks(made: MadeApp, runId: string): Promise<StreamChunk[]> {
    const entries = await made.chat.durability(runId).snapshot()
    return entries.map((entry) => entry.chunk)
  }

  async function waitForHarnessPid(pidFile: string): Promise<number> {
    const found = {pid: 0}
    await vi.waitFor(
      () => {
        found.pid = Number(readFileSync(pidFile, 'utf8'))
        expect(Number.isInteger(found.pid) && found.pid > 0).toBe(true)
      },
      {timeout: 10_000, interval: 50},
    )
    return found.pid
  }

  it('an abort with no cancel intent detaches the run record', {timeout: 30_000}, async () => {
    const pidFile = join(tmp('conciv-durability-pid-'), 'pid')
    const made = await boot({CONCIV_FAKE_HANG: '1', CONCIV_TEST_PID_FILE: pidFile})
    const sessionId = SessionId.parse('conciv_durability-detach')
    const runId = 'run-durability-detach-1'
    await makeSend(made.chat)(sessionId, runId, 'keep going without me')
    await waitForHarnessPid(pidFile)

    drivingRun(made.chat, runId).abort.abort()
    await drivingRun(made.chat, runId).settled

    await expect(made.chat.runs.get(runId)).resolves.toMatchObject({detachedSince: expect.any(Number)})
  })

  it('an explicit stop cancels the run, records no detach, and kills the harness', {timeout: 30_000}, async () => {
    const pidFile = join(tmp('conciv-durability-pid-'), 'pid')
    const made = await boot({CONCIV_FAKE_HANG: '1', CONCIV_TEST_PID_FILE: pidFile})
    const sessionId = SessionId.parse('conciv_durability-stop')
    const runId = 'run-durability-stop-1'
    await makeSend(made.chat)(sessionId, runId, 'hang around')
    const harnessPid = await waitForHarnessPid(pidFile)

    await stopSession(made.chat, sessionId)

    const record = await made.chat.runs.get(runId)
    expect(record?.cancelRequested).toBe(true)
    expect(record?.detachedSince).toBeUndefined()
    await vi.waitFor(() => expect(isAlive(harnessPid)).toBe(false), {timeout: 10_000, interval: 50})
  })

  it('the run log holds every chunk exactly once', {timeout: 30_000}, async () => {
    const made = await boot({})
    const sessionId = SessionId.parse('conciv_durability-once')
    const runId = 'run-durability-once-1'
    await makeSend(made.chat)(sessionId, runId, 'say it once')
    await drivingRun(made.chat, runId).settled

    const chunks = await loggedChunks(made, runId)
    const text = chunks
      .filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((chunk) => (chunk.type === EventType.TEXT_MESSAGE_CONTENT ? chunk.delta : ''))
      .join('')
    expect(chunks.filter((chunk) => chunk.type === EventType.RUN_STARTED)).toHaveLength(1)
    expect(text).toBe('hello from fake')
  })
})
