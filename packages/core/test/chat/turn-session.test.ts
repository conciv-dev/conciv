import {describe, it, expect} from 'vitest'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getHarness} from '@conciv/harness'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {testDb} from '../helpers/memory-store.js'
import {createRow, ensureRow, nativeIdFor, recordNativeId, rowById} from '../../src/chat/session-rows.js'
import {requireClaude} from '../helpers/adapters.js'
import {resumableToken} from '../../src/chat/run.js'

const SESSION_A = SessionId.parse('conciv_a')
const SESSION_B = SessionId.parse('conciv_b')

describe('turn session helpers', () => {
  it('nativeIdFor returns the stored harness token (null when new)', async () => {
    const db = testDb()
    await createRow(db, {
      id: SESSION_A,
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/app',
      deletedAt: null,
    })
    expect(await nativeIdFor(db, SESSION_A)).toBeNull()
    await recordNativeId(db, SESSION_A, HarnessSessionId.parse('tok-1'))
    expect(await nativeIdFor(db, SESSION_A)).toBe('tok-1')
  })

  it('ensureRow lazily births a chat record with a null token', async () => {
    const db = testDb()
    expect(await rowById(db, SESSION_B)).toBeNull()
    await ensureRow(db, SESSION_B, 'claude', '/app')
    const rec = await rowById(db, SESSION_B)
    expect(rec?.origin).toBe('chat')
    expect(rec?.harnessSessionId).toBeNull()
    expect(rec?.cwd).toBe('/app')
  })

  it('ensureRow is idempotent: never clobbers an existing record', async () => {
    const db = testDb()
    await ensureRow(db, SESSION_B, 'claude', '/app')
    await recordNativeId(db, SESSION_B, HarnessSessionId.parse('tok-1'))
    await ensureRow(db, SESSION_B, 'claude', '/app')
    expect((await rowById(db, SESSION_B))?.harnessSessionId).toBe('tok-1')
  })

  it('resumableToken drops a token whose transcript does not exist (terminal pre-mints ids before claude writes one)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conciv-resume-'))
    writeFileSync(join(dir, 'tok-live.jsonl'), '')
    const claude = requireClaude()
    if (!claude.history || !claude.commands || !claude.init) throw new Error('claude harness lacks a sidecar')
    const harness: HarnessAdapter = {
      ...claude,
      capabilities: {...claude.capabilities, transcriptHistory: true, slashCommands: 'live', init: 'files'},
      init: claude.init,
      commands: claude.commands,
      history: {
        ...claude.history,
        transcriptPath: (cwd, sessionId) => join(cwd, `${sessionId}.jsonl`),
      },
    }
    expect(resumableToken(harness, dir, HarnessSessionId.parse('tok-live'))).toBe('tok-live')
    expect(resumableToken(harness, dir, HarnessSessionId.parse('tok-ghost'))).toBeNull()
    expect(resumableToken(harness, dir, null)).toBeNull()
    rmSync(dir, {recursive: true, force: true})
  })

  it('resumableToken trusts the token when the harness has no transcript history', () => {
    const stub = getHarness('gemini-cli')
    if (!stub) throw new Error('gemini-cli harness not registered')
    expect(stub.history).toBeUndefined()
    expect(resumableToken(stub, '/app', HarnessSessionId.parse('tok-1'))).toBe('tok-1')
  })
})

const CODEX_SESSION = HarnessSessionId.parse('019fb331-4da4-7960-8197-c43d6205c10b')

function seedCodexRollout(home: string, cwd: string): void {
  const dir = join(home, '.codex', 'sessions', '2026', '07', '30')
  mkdirSync(dir, {recursive: true})
  const lines = [
    {
      timestamp: '2026-07-30T13:23:05.125Z',
      type: 'session_meta',
      payload: {session_id: CODEX_SESSION, id: CODEX_SESSION, cwd, originator: 'codex_exec', cli_version: '0.145.0'},
    },
    {
      timestamp: '2026-07-30T13:23:06.744Z',
      type: 'event_msg',
      payload: {type: 'user_message', message: 'list the files', images: [], text_elements: []},
    },
  ]
  const name = `rollout-2026-07-30T13-23-05-${CODEX_SESSION}.jsonl`
  writeFileSync(join(dir, name), `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8')
}

describe('resumableToken honours the cwd a transcript was recorded in', () => {
  it('refuses a codex token whose rollout belongs to another project', () => {
    const home = mkdtempSync(join(tmpdir(), 'conciv-codex-home-'))
    seedCodexRollout(home, '/workspace/other')
    const codex = getHarness('codex')
    if (!codex) throw new Error('codex harness not registered')
    try {
      expect(resumableToken(codex, '/workspace/other', CODEX_SESSION, home)).toBe(CODEX_SESSION)
      expect(resumableToken(codex, '/workspace/demo', CODEX_SESSION, home)).toBeNull()
    } finally {
      rmSync(home, {recursive: true, force: true})
    }
  })
})
