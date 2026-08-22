import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getHarness} from '@conciv/harness'
import {createTestHarness, type TestHarness} from '@conciv/harness-testkit'
import {openDb, type ConcivDb} from '@conciv/db'
import {SessionId} from '@conciv/protocol/chat-types'
import {makeConcivSandbox} from '../../src/chat/sandbox.js'
import {createAskRegistry} from '../../src/chat/ask.js'
import {createSessionStreams} from '../../src/chat/subscribe.js'
import {createLiveRuns} from '../../src/chat/live-runs.js'
import {ensureRow} from '../../src/chat/session-rows.js'
import {makeRunControl, type ChatDeps} from '../../src/chat/runtime.js'
import {sessionSnapshot} from '../../src/chat/transcript.js'

export type ChatFixture = {
  chat: ChatDeps
  db: ConcivDb
  harness: TestHarness
  sessionId: SessionId
  stateRoot: string
}

export async function makeChatFixture(opts: {seedSession?: boolean} = {}): Promise<ChatFixture> {
  const real = getHarness('claude')
  if (!real) throw new Error('claude harness missing')
  const harness = createTestHarness(real)
  const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-fixture-'))
  const db = openDb(stateRoot)
  const {claimStartedAt, durability, runControl, runs} = makeRunControl()
  const chat: ChatDeps = {
    cwd: stateRoot,
    stateRoot,
    basePath: '',
    harness,
    systemText: '',
    sandbox: makeConcivSandbox(stateRoot),
    db,
    asks: createAskRegistry(),
    durability,
    runControl,
    runs,
    claimStartedAt,
    liveRuns: createLiveRuns(),
    stream: createSessionStreams(),
    snapshot: (sessionId) => sessionSnapshot(chat, sessionId),
    commandAllows: () => [],
    risky: new Set<string>(),
    toolNames: new Set<string>(),
    codeModeCapabilities: () => [],
    attachmentExpanders: {},
  }
  const sessionId = SessionId.parse('conciv_fixture')
  if (opts.seedSession !== false) await ensureRow(db, sessionId, harness.id, stateRoot)
  return {chat, db, harness, sessionId, stateRoot}
}
