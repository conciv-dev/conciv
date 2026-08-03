import {describe, it, expect} from 'vitest'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getHarness} from '@conciv/harness'
import type {
  HarnessAdapter,
  TranscriptFailure,
  TranscriptHandle,
  TranscriptRevision,
} from '@conciv/protocol/harness-types'
import {testDb} from '../helpers/memory-store.js'
import {createSession, sessionById} from '../../src/chat/session.js'
import {requireClaude} from '../helpers/adapters.js'
import {
  claimHarnessToken,
  ensureChatRecord,
  recordMintedToken,
  resumableToken,
  resumeTokenFor,
} from '../../src/chat/session.js'

const missing = (path: string): TranscriptFailure => ({
  ok: false,
  reason: 'missing',
  detail: `${path} does not exist`,
})

function fileHandle(path: string): TranscriptHandle {
  return {
    async revision(): Promise<TranscriptRevision | TranscriptFailure> {
      const info = await stat(path).catch(() => null)
      return info ? {rev: `${info.size}:${info.mtimeMs}`, changedAt: info.mtimeMs} : missing(path)
    },
    read: () => Promise.resolve(missing(path)),
    close: () => {},
  }
}

describe('turn session helpers', () => {
  it('resumeTokenFor returns the stored harness token (null when new)', async () => {
    const db = testDb()
    await createSession(db, {
      id: 'conciv_a',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/app',
    })
    expect(await resumeTokenFor(db, 'conciv_a')).toBeNull()
    await recordMintedToken(db, 'conciv_a', 'tok-1')
    expect(await resumeTokenFor(db, 'conciv_a')).toBe('tok-1')
  })

  it('ensureChatRecord lazily births a chat record with a null token', async () => {
    const db = testDb()
    expect(await sessionById(db, 'conciv_b')).toBeNull()
    await ensureChatRecord(db, 'conciv_b', 'claude', '/app')
    const rec = await sessionById(db, 'conciv_b')
    expect(rec?.origin).toBe('chat')
    expect(rec?.harnessSessionId).toBeNull()
    expect(rec?.cwd).toBe('/app')
  })

  it('ensureChatRecord is idempotent: never clobbers an existing record', async () => {
    const db = testDb()
    await ensureChatRecord(db, 'conciv_b', 'claude', '/app')
    await recordMintedToken(db, 'conciv_b', 'tok-1')
    await ensureChatRecord(db, 'conciv_b', 'claude', '/app')
    expect((await sessionById(db, 'conciv_b'))?.harnessSessionId).toBe('tok-1')
  })

  it('resumableToken drops a token whose transcript does not exist (terminal pre-mints ids before claude writes one)', async () => {
    const db = testDb()
    const dir = mkdtempSync(join(tmpdir(), 'conciv-resume-'))
    writeFileSync(join(dir, 'tok-live.jsonl'), '')
    const claude = requireClaude()
    if (!claude.history || !claude.commands) throw new Error('claude harness lacks history or commands')
    const harness: HarnessAdapter = {
      ...claude,
      capabilities: {...claude.capabilities, transcriptHistory: true, slashCommands: 'live'},
      commands: claude.commands,
      history: {
        messages: () => Promise.resolve([]),
        observe: (cwd, sessionId) => fileHandle(join(cwd, `${sessionId}.jsonl`)),
        list: () => Promise.resolve([]),
      },
    }
    expect(await resumableToken(db, harness, dir, 'tok-live')).toBe('tok-live')
    expect(await resumableToken(db, harness, dir, 'tok-ghost')).toBeNull()
    expect(await resumableToken(db, harness, dir, null)).toBeNull()
    rmSync(dir, {recursive: true, force: true})
  })

  it('resumableToken trusts the token when the harness has no transcript history', async () => {
    const stub = getHarness('gemini-cli')
    if (!stub) throw new Error('gemini-cli harness not registered')
    expect(stub.history).toBeUndefined()
    expect(await resumableToken(testDb(), stub, '/app', 'tok-1')).toBe('tok-1')
  })
})

const CODEX_SESSION = '019fb331-4da4-7960-8197-c43d6205c10b'

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
  it('refuses a codex token whose rollout belongs to another project', async () => {
    const db = testDb()
    const home = mkdtempSync(join(tmpdir(), 'conciv-codex-home-'))
    seedCodexRollout(home, '/workspace/other')
    const codex = getHarness('codex')
    if (!codex) throw new Error('codex harness not registered')
    try {
      expect(await resumableToken(db, codex, '/workspace/other', CODEX_SESSION, home)).toBe(CODEX_SESSION)
      expect(await resumableToken(db, codex, '/workspace/demo', CODEX_SESSION, home)).toBeNull()
    } finally {
      rmSync(home, {recursive: true, force: true})
    }
  })
})

async function seedShell(
  db: ReturnType<typeof testDb>,
  id: string,
  fields: {harnessSessionId: string | null; title: string | null; origin: 'chat' | 'external'},
): Promise<void> {
  await createSession(db, {
    id,
    harnessSessionId: fields.harnessSessionId,
    harnessKind: 'claude',
    origin: fields.origin,
    title: fields.title,
    model: null,
    usage: null,
    cwd: '/app',
  })
}

describe('claimHarnessToken', () => {
  it('keeps a token the same session already owns, without writing', async () => {
    const db = testDb()
    await seedShell(db, 'conciv_a', {harnessSessionId: 'tok-1', title: null, origin: 'chat'})
    expect(await claimHarnessToken(db, 'conciv_a', 'tok-1')).toBe('kept')
    expect((await sessionById(db, 'conciv_a'))?.harnessSessionId).toBe('tok-1')
  })

  it('records a token nobody holds', async () => {
    const db = testDb()
    await seedShell(db, 'conciv_a', {harnessSessionId: null, title: null, origin: 'chat'})
    expect(await claimHarnessToken(db, 'conciv_a', 'tok-1')).toBe('recorded')
    expect((await sessionById(db, 'conciv_a'))?.harnessSessionId).toBe('tok-1')
  })

  it('refuses a token held by a session that has real work, leaving both rows alone', async () => {
    const db = testDb()
    await seedShell(db, 'conciv_owner', {harnessSessionId: 'tok-1', title: 'counted the files', origin: 'chat'})
    await seedShell(db, 'conciv_claimant', {harnessSessionId: null, title: null, origin: 'chat'})
    expect(await claimHarnessToken(db, 'conciv_claimant', 'tok-1')).toBe('conflict')
    expect((await sessionById(db, 'conciv_owner'))?.harnessSessionId).toBe('tok-1')
    expect((await sessionById(db, 'conciv_claimant'))?.harnessSessionId).toBeNull()
  })

  it('refuses a token held by an external session even when it has no title', async () => {
    const db = testDb()
    await seedShell(db, 'conciv_owner', {harnessSessionId: 'tok-1', title: null, origin: 'external'})
    await seedShell(db, 'conciv_claimant', {harnessSessionId: null, title: null, origin: 'chat'})
    expect(await claimHarnessToken(db, 'conciv_claimant', 'tok-1')).toBe('conflict')
    expect((await sessionById(db, 'conciv_owner'))?.harnessSessionId).toBe('tok-1')
  })

  it('takes a token away from an empty chat shell', async () => {
    const db = testDb()
    await seedShell(db, 'conciv_shell', {harnessSessionId: 'tok-1', title: null, origin: 'chat'})
    await seedShell(db, 'conciv_claimant', {harnessSessionId: null, title: null, origin: 'chat'})
    expect(await claimHarnessToken(db, 'conciv_claimant', 'tok-1')).toBe('recorded')
    expect((await sessionById(db, 'conciv_shell'))?.harnessSessionId).toBeNull()
    expect((await sessionById(db, 'conciv_claimant'))?.harnessSessionId).toBe('tok-1')
  })

  it('rejects a token that is not a usable harness session id', async () => {
    const db = testDb()
    await seedShell(db, 'conciv_a', {harnessSessionId: null, title: null, origin: 'chat'})
    await expect(claimHarnessToken(db, 'conciv_a', '../../etc/passwd')).rejects.toThrow(/unusable/)
  })
})
