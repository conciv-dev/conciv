import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {SessionId} from '@conciv/protocol/chat-types'
import type {MadeApp} from '../../src/app.js'
import {makeSend, makeTurn} from '../../src/chat/run.js'
import {stopSession} from '../../src/chat/stop.js'
import {bootMadeApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'
import {awaitRunSettled} from '../../src/chat/run-settled.js'

const claude = requireClaude()

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function drain(stream: AsyncIterable<StreamChunk>): Promise<void> {
  try {
    for await (const chunk of stream) void chunk
  } catch {}
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

  it('a viewer leaving with no cancel intent detaches the run record', {timeout: 30_000}, async () => {
    const pidFile = join(tmp('conciv-durability-pid-'), 'pid')
    const made = await boot({CONCIV_FAKE_HANG: '1', CONCIV_TEST_PID_FILE: pidFile})
    const sessionId = SessionId.parse('conciv_durability-detach')
    const runId = 'run-durability-detach-1'
    const viewer = new AbortController()
    const stream = await makeTurn(made.chat)(sessionId, runId, 'keep going without me', {signal: viewer.signal})
    void drain(stream)
    await waitForHarnessPid(pidFile)

    viewer.abort()

    await vi.waitFor(
      async () => expect(await made.chat.runs.get(runId)).toMatchObject({detachedSince: expect.any(Number)}),
      {timeout: 15_000, interval: 50},
    )
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
    await awaitRunSettled(made.chat.runs, runId)

    const chunks = await loggedChunks(made, runId)
    const text = chunks
      .filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((chunk) => (chunk.type === EventType.TEXT_MESSAGE_CONTENT ? chunk.delta : ''))
      .join('')
    expect(chunks.filter((chunk) => chunk.type === EventType.RUN_STARTED)).toHaveLength(1)
    expect(text).toBe('hello from fake')
  })
})
