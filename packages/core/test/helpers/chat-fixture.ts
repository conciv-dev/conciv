import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getHarness} from '@conciv/harness'
import {createTestHarness, type TestHarness} from '@conciv/harness-testkit'
import {openDb, type ConcivDb} from '@conciv/db'
import {makeConcivSandbox} from '../../src/chat/gate.js'
import {createAskRegistry} from '../../src/chat/ask.js'
import {createTurnRegistry} from '../../src/chat/run.js'
import {createSessionStreams} from '../../src/chat/subscribe.js'
import {createSnapshotCache} from '../../src/chat/transcript.js'
import {ensureRow} from '../../src/chat/session-rows.js'
import type {ChatDeps} from '../../src/chat/runtime.js'
import {createRunTracker} from '../../src/chat/run-tracker.js'

export type ChatFixture = {
  chat: ChatDeps
  db: ConcivDb
  harness: TestHarness
  sessionId: string
  stateRoot: string
}

export async function makeChatFixture(opts: {seedSession?: boolean} = {}): Promise<ChatFixture> {
  const real = getHarness('claude')
  if (!real) throw new Error('claude harness missing')
  const harness = createTestHarness(real)
  const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-fixture-'))
  const db = openDb(stateRoot)
  const chat: ChatDeps = {
    cwd: stateRoot,
    stateRoot,
    basePath: '',
    harness,
    systemText: '',
    sandbox: makeConcivSandbox(stateRoot),
    db,
    asks: createAskRegistry(),
    turns: createTurnRegistry(),
    stream: createSessionStreams(),
    snapshots: createSnapshotCache(),
    risky: new Set<string>(),
    tools: () => [],
    toolNames: new Set<string>(),
    extensionServerTools: () => [],
    attachmentExpanders: {},
    runs: createRunTracker(),
  }
  const sessionId = 'conciv_fixture'
  if (opts.seedSession !== false) await ensureRow(db, sessionId, harness.id, stateRoot)
  return {chat, db, harness, sessionId, stateRoot}
}
