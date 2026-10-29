import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createTestHarness, type TestHarness} from '@conciv/harness-testkit'
import type {ConcivDb} from '@conciv/db'
import {SessionId} from '@conciv/protocol/chat-types'
import type {ChatDeps} from '../../src/chat/runtime.js'
import {ensureRow} from '../../src/chat/session-rows.js'
import {bootMadeApp} from './boot.js'
import {requireClaude} from './adapters.js'

export type ChatFixture = {
  chat: ChatDeps
  db: ConcivDb
  harness: TestHarness
  sessionId: SessionId
  stateRoot: string
  dispose: () => Promise<void>
}

export async function makeChatFixture(opts: {seedSession?: boolean} = {}): Promise<ChatFixture> {
  const harness = createTestHarness(requireClaude())
  const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-fixture-'))
  const made = await bootMadeApp({stateRoot, cwd: stateRoot, harness})
  const sessionId = SessionId.parse('conciv_fixture')
  if (opts.seedSession !== false) await ensureRow(made.chat.db, sessionId, harness.id, stateRoot)
  return {chat: made.chat, db: made.chat.db, harness, sessionId, stateRoot, dispose: made.dispose}
}
