import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getHarness} from '@conciv/harness'
import {createTestHarness, type TestHarness} from '@conciv/harness-testkit'
import {openDb, type ConcivDb} from '@conciv/db'
import {makeChanges} from '../../src/chat/attach.js'
import {makeConcivSandbox} from '../../src/chat/gate.js'
import {ensureChatRecord} from '../../src/chat/run.js'
import type {ChatDeps} from '../../src/chat/runtime.js'

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
    harness,
    systemText: '',
    sandbox: makeConcivSandbox(stateRoot),
    db,
    changes: makeChanges(),
    risky: new Set<string>(),
    tools: () => [],
    extensionServerTools: () => [],
    attachmentExpanders: {},
  }
  const sessionId = 'conciv_fixture'
  if (opts.seedSession !== false) await ensureChatRecord(db, sessionId, harness.id, stateRoot)
  return {chat, db, harness, sessionId, stateRoot}
}
