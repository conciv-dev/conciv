import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import type {UIMessage} from '@tanstack/ai'
import {CODE_MODE_SYNTHETIC_PART_MARKER} from '@conciv/protocol/chat-types'
import {concivStateDir} from '@conciv/protocol/state-types'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {migrations} from '../../src/migrations.gen.js'
import {runMessages, runs, sessionHistory} from '../../src/run-schema.js'
import {sessions} from '../../src/schema.js'

export const PRE_CHAT_STORE_MIGRATION_COUNT = 12
export const LAST_PRE_CHAT_STORE_MIGRATION = '20260823083136_overrated_scrambler'

export const LEGACY_SESSION_ID = 's-legacy'
export const LEGACY_ANCHOR_NATIVE_ID = 'native-a2'
export const FOLDED_WITHOUT_ANCHOR_SESSION_ID = 's-legacy-unanchored'

export const LEGACY_HISTORY: UIMessage[] = [
  {
    id: 'u1',
    role: 'user',
    parts: [
      {type: 'text', content: 'look at this'},
      {type: 'image', source: {type: 'data', mimeType: 'image/png', value: 'aGk='}},
    ],
  },
  {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'a cat'}]},
  {id: 'u2', role: 'user', parts: [{type: 'text', content: 'run the code'}]},
  {
    id: 'a2',
    role: 'assistant',
    parts: [
      {
        type: 'tool-call',
        id: 'call-1',
        name: 'conciv_code',
        arguments: '{"source":"return 1 + 1"}',
        state: 'complete',
        metadata: {[CODE_MODE_SYNTHETIC_PART_MARKER]: true},
      },
      {type: 'tool-result', toolCallId: 'call-1', name: 'conciv_code', content: '2', state: 'complete'},
    ],
  },
]

export const LEGACY_PENDING: UIMessage[] = [
  {
    id: 'u3',
    role: 'user',
    parts: [
      {type: 'text', content: 'and now the docs'},
      {
        type: 'document',
        source: {type: 'data', mimeType: 'application/pdf', value: 'JVBE'},
        metadata: {modelOnly: true},
      },
    ],
  },
]

export function seedLegacyDb(stateRoot: string): void {
  mkdirSync(`${stateRoot}/.conciv`, {recursive: true})
  const client = new DatabaseSync(join(concivStateDir(stateRoot), 'conciv.db'), {timeout: 5000})
  client.exec('PRAGMA journal_mode = WAL')
  const db = drizzle({client})
  migrateSync(migrations.slice(0, PRE_CHAT_STORE_MIGRATION_COUNT), db._.session)
  const now = 1_700_000_000_000
  db.insert(sessions)
    .values([
      {
        id: LEGACY_SESSION_ID,
        harnessKind: 'claude',
        origin: 'chat',
        cwd: '/workspace',
        harnessSessionId: 'sess-legacy',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: FOLDED_WITHOUT_ANCHOR_SESSION_ID,
        harnessKind: 'claude',
        origin: 'chat',
        cwd: '/workspace-2',
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run()
  db.insert(sessionHistory)
    .values([
      {
        sessionId: LEGACY_SESSION_ID,
        messages: LEGACY_HISTORY,
        anchorNativeId: LEGACY_ANCHOR_NATIVE_ID,
        updatedAt: now,
      },
      {sessionId: FOLDED_WITHOUT_ANCHOR_SESSION_ID, messages: [], anchorNativeId: null, updatedAt: now},
    ])
    .run()
  db.insert(runMessages).values({sessionId: LEGACY_SESSION_ID, messages: LEGACY_PENDING, updatedAt: now}).run()
  db.insert(runs)
    .values([
      {
        runId: 'legacy-run-live',
        sessionId: LEGACY_SESSION_ID,
        phase: 'stopping',
        startedAt: now,
        finishedAt: null,
        error: null,
        updatedAt: now,
      },
      {
        runId: 'legacy-run-done',
        sessionId: LEGACY_SESSION_ID,
        phase: 'completed',
        startedAt: now - 1000,
        finishedAt: now - 500,
        error: null,
        updatedAt: now,
      },
    ])
    .run()
  client.close()
}
