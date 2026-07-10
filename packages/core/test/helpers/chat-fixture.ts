import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getHarness} from '@conciv/harness'
import {createTestHarness, type TestHarness} from '@conciv/harness-testkit'
import {makeSessionStore, makeUiState, openDb, type SessionStore, type UiState} from '@conciv/db'
import {makeUiBus} from '../../src/runtime/ui-bus.js'
import {makeUiAsks} from '../../src/runtime/ui-asks.js'
import {makeTurnHub} from '../../src/runtime/turn-hub.js'
import {makePermissionGate} from '../../src/api/chat/permission.js'
import {ensureChatRecord} from '../../src/api/chat/turn.js'
import type {ChatRuntime} from '../../src/api/chat/chat-env.js'

export type ChatFixture = {
  chat: ChatRuntime
  store: SessionStore
  uiState: UiState
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
  const store = makeSessionStore({db})
  const uiState = makeUiState(db)
  const uiBus = makeUiBus()
  const uiAsks = makeUiAsks()
  const chat: ChatRuntime = {
    cwd: stateRoot,
    stateRoot,
    harness,
    systemText: '',
    gate: makePermissionGate(uiBus),
    uiBus,
    uiAsks,
    store,
    hub: makeTurnHub(),
    tools: () => [],
  }
  const sessionId = 'conciv_fixture'
  if (opts.seedSession !== false) await ensureChatRecord(store, sessionId, harness.id, stateRoot)
  return {chat, store, uiState, harness, sessionId, stateRoot}
}
