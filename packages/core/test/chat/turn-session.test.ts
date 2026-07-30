import {describe, it, expect} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getHarness} from '@conciv/harness'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {testDb} from '../helpers/memory-store.js'
import {createSession, sessionById} from '../../src/chat/session.js'
import {requireClaude} from '../helpers/adapters.js'
import {resumeTokenFor, recordMintedToken, ensureChatRecord, resumableToken} from '../../src/chat/run.js'

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
        transcriptStat: async (cwd, sessionId) => {
          const info = await stat(join(cwd, `${sessionId}.jsonl`)).catch(() => null)
          return info ? {mtimeMs: info.mtimeMs, size: info.size} : null
        },
        list: () => Promise.resolve([]),
      },
    }
    expect(await resumableToken(db, harness, dir, 'tok-live')).toBe('tok-live')
    expect(await resumableToken(db, harness, dir, 'tok-ghost')).toBeNull()
    expect(await resumableToken(db, harness, dir, null)).toBeNull()
    rmSync(dir, {recursive: true, force: true})
  })

  it('resumableToken trusts the token when the harness has no transcript history', async () => {
    const stub = getHarness('pi')
    if (!stub) throw new Error('pi stub not registered')
    expect(await resumableToken(testDb(), stub, '/app', 'tok-1')).toBe('tok-1')
  })
})
