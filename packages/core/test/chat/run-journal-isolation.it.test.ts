import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it, vi} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {SessionId} from '@conciv/protocol/chat-types'
import type {MadeApp} from '../../src/app.js'
import {makeTurn, mintedSessionId} from '../../src/chat/run.js'
import {startTurn} from '../helpers/detached-turn.js'
import {awaitRunSettled} from '../../src/chat/run-settled.js'
import {bootMadeApp} from '../helpers/boot.js'
import {useMadeApps} from '../helpers/made-apps.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()

async function drain(stream: AsyncIterable<StreamChunk>): Promise<void> {
  try {
    for await (const chunk of stream) void chunk
  } catch {}
}

function textOf(chunks: readonly StreamChunk[]): string {
  return chunks
    .filter((chunk) => chunk.type === EventType.TEXT_MESSAGE_CONTENT)
    .map((chunk) => (chunk.type === EventType.TEXT_MESSAGE_CONTENT ? chunk.delta : ''))
    .join('')
}

describe('run journals are scoped to the server that wrote them (IT)', () => {
  const apps = useMadeApps()
  const tmp = apps.tmp

  function boot(env: NodeJS.ProcessEnv): Promise<MadeApp> {
    return bootMadeApp(
      {stateRoot: tmp('conciv-journal-state-'), cwd: tmp('conciv-journal-cwd-'), harness: claude},
      {fakeClaude: {env: () => env}},
    )
  }

  it('a fresh run never replays output an earlier server left behind under the same run id', async () => {
    const runId = `journal-isolation-${randomUUID()}`
    const pidFile = join(tmp('conciv-journal-pid-'), 'pid')

    const abandoned = apps.keep(await boot({CONCIV_FAKE_HANG: '1', CONCIV_TEST_PID_FILE: pidFile}))
    const viewer = new AbortController()
    const abandonedSession = SessionId.parse('conciv_journal-abandoned')
    void drain(await makeTurn(abandoned.chat)(abandonedSession, runId, 'hang here forever', {signal: viewer.signal}))
    await vi.waitFor(() => expect(Number(readFileSync(pidFile, 'utf8'))).toBeGreaterThan(0), {
      timeout: 10_000,
      interval: 50,
    })
    viewer.abort()

    const fresh = apps.keep(await boot({}))
    const freshSession = SessionId.parse('conciv_journal-fresh')
    const turn = await startTurn(fresh.chat, freshSession, runId, 'say it once')
    await awaitRunSettled(fresh.chat.runs, runId)
    const chunks = await turn.drained

    expect(chunks.filter((chunk) => mintedSessionId(chunk) !== null)).toHaveLength(1)
    expect(textOf(chunks)).toBe('hello from fake')
    expect(await fresh.chat.runs.get(runId)).toMatchObject({status: 'completed'})
  }, 30_000)
})
