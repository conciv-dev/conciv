import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {defineHarness} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import {createTestHarness, createTestkit} from '@conciv/harness-testkit'
import {openDb} from '@conciv/db'
import {SessionId} from '@conciv/protocol/chat-types'
import {ensureRow} from '../../src/chat/session-rows.js'
import {bootMadeApp} from '../helpers/boot.js'
import {startTurn} from '../helpers/detached-turn.js'
import {makeRunControl} from '../../src/chat/runtime.js'
import {makeChatFixture, type ChatFixture} from '../helpers/chat-fixture.js'
import {awaitRunSettled} from '../../src/chat/run-settled.js'
import {bootCoreApp} from '../helpers/boot.js'
import {requireClaude} from '../helpers/adapters.js'

const baseCaps = {
  resume: false,
  permissionGate: 'none',
  transcriptHistory: false,
  compaction: false,
  systemPrompt: 'none',
  mcp: 'none',
  slashCommands: 'none',
  imageInput: false,
  init: 'none',
} as const

async function* instantGenerator(): AsyncGenerator<StreamChunk> {
  yield {type: EventType.RUN_STARTED, threadId: 'instant', runId: 'instant'}
  yield {type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'instant-msg', delta: 'ok'}
  yield {type: EventType.RUN_FINISHED, threadId: 'instant', runId: 'instant'}
}

const instantHarness = defineHarness({
  id: 'fake-instant',
  binName: 'true',
  chatConfig: () => ({adapter: makeTextAdapter('fake-instant', () => instantGenerator())}),
  capabilities: baseCaps,
})

function deferred(): {promise: Promise<void>; resolve: () => void} {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

async function replayRunLog(chat: ChatFixture['chat'], runId: string): Promise<StreamChunk[]> {
  const entries = await chat.durability(runId).snapshot()
  return entries.map((entry) => entry.chunk)
}

describe('runId reuse (IT)', () => {
  it('send rejects when the runId already belongs to a finished run', {timeout: 15_000}, async () => {
    const fixture = await makeChatFixture()
    const runId = 'run-id-reuse-1'
    await startTurn(fixture.chat, fixture.sessionId, runId, 'first turn')
    await awaitRunSettled(fixture.chat.runs, runId)
    await expect(startTurn(fixture.chat, fixture.sessionId, runId, 'second turn')).rejects.toThrow(/cannot be reused/)
  })

  it('concurrent sends with one runId admit exactly one run', {timeout: 15_000}, async () => {
    const fixture = await makeChatFixture()
    const runId = 'run-id-reuse-concurrent-1'
    const results = await Promise.allSettled([
      startTurn(fixture.chat, fixture.sessionId, runId, 'first sender'),
      startTurn(fixture.chat, fixture.sessionId, runId, 'second sender'),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejection = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(rejection?.reason).toMatchObject({name: 'RunIdTakenError'})
    await awaitRunSettled(fixture.chat.runs, runId)
    const chunks = await replayRunLog(fixture.chat, runId)
    const started = chunks.filter((chunk) => chunk.type === EventType.RUN_STARTED)
    const finished = chunks.filter((chunk) => chunk.type === EventType.RUN_FINISHED)
    expect(started).toHaveLength(1)
    expect(finished).toHaveLength(1)
  })

  it('send rejects reuse while the finished stream still awaits onRunEnd', {timeout: 15_000}, async () => {
    const fixture = await makeChatFixture()
    const entered = deferred()
    const release = deferred()
    fixture.chat.onRunEnd = async () => {
      entered.resolve()
      await release.promise
    }
    const runId = 'run-id-reuse-window-1'
    await startTurn(fixture.chat, fixture.sessionId, runId, 'first turn')
    await entered.promise
    await expect(startTurn(fixture.chat, fixture.sessionId, runId, 'reuse in window')).rejects.toMatchObject({
      name: 'RunIdTakenError',
    })
    release.resolve()
    await awaitRunSettled(fixture.chat.runs, runId)
  })

  it('claimStartedAt yields strictly increasing epoch values across rapid calls', () => {
    const {claimStartedAt} = makeRunControl(openDb(mkdtempSync(join(tmpdir(), 'conciv-claim-'))))
    const before = Date.now()
    let previous = claimStartedAt()
    expect(previous).toBeGreaterThanOrEqual(before)
    for (let call = 0; call < 10_000; call += 1) {
      const next = claimStartedAt()
      expect(next).toBeGreaterThan(previous)
      previous = next
    }
    expect(previous).toBeLessThan(Date.now() + 1_000)
  })

  it('marks the claimed run failed when a pre-launch step throws', {timeout: 15_000}, async () => {
    const fixture = await makeChatFixture()
    fixture.chat.onRunStart = () => {
      throw new Error('pre-launch boom')
    }
    const runId = 'run-id-prelaunch-fail-1'
    await expect(startTurn(fixture.chat, fixture.sessionId, runId, 'first turn')).rejects.toThrow('pre-launch boom')
    const record = await fixture.chat.runs.get(runId)
    expect(record).toMatchObject({status: 'failed', error: {message: 'pre-launch boom'}})
    expect(record?.finishedAt).toBeTypeOf('number')
    await expect(fixture.chat.runs.findActiveRun(fixture.sessionId)).resolves.toBeNull()
  })

  it('rejects a runId claimed by a run that started before the server restarted', {timeout: 30_000}, async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-restart-claim-'))
    const sessionId = SessionId.parse('conciv_restart_claim')
    const runId = 'run-id-reuse-across-restart-1'
    const harness = createTestHarness(requireClaude())
    const first = await bootMadeApp({stateRoot, cwd: stateRoot, harness})
    try {
      await ensureRow(first.chat.db, sessionId, harness.id, stateRoot)
      await startTurn(first.chat, sessionId, runId, 'before the restart')
      await awaitRunSettled(first.chat.runs, runId)
    } finally {
      await first.dispose()
    }
    const second = await bootMadeApp({stateRoot, cwd: stateRoot, harness})
    try {
      await expect(startTurn(second.chat, sessionId, runId, 'after the restart')).rejects.toMatchObject({
        name: 'RunIdTakenError',
      })
    } finally {
      await second.dispose()
      rmSync(stateRoot, {recursive: true, force: true})
    }
  })

  it('the turn transport surfaces the rejection to the client', {timeout: 15_000}, async () => {
    const kit = await createTestkit(instantHarness, bootCoreApp()).setup()
    try {
      const id = await kit.session()
      const runId = 'run-id-reuse-rpc-1'
      const stream = await kit.turn('first turn', {session: id, runId: runId})
      await stream.done({hangGuardMs: 5000})
      const reused = await kit.turn('second turn', {session: id, runId: runId})
      const events = await reused.done({hangGuardMs: 5000})
      expect(events.errors().join(' ')).toMatch(/cannot be reused/)
    } finally {
      await kit.cleanup()
    }
  })
})
