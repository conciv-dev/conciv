import {describe, it, expect} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {getHarness} from '@conciv/harness'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import {memoryStore} from '../helpers/memory-store.js'
import {requireClaude} from '../helpers/adapters.js'
import {resumeTokenFor, recordMintedToken, ensureChatRecord, resumableToken} from '../../src/chat/turn.js'

describe('turn session helpers', () => {
  it('resumeTokenFor returns the stored harness token (null when new)', async () => {
    const store = memoryStore()
    await store.create({
      id: 'conciv_a',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/app',
    })
    expect(await resumeTokenFor(store, 'conciv_a')).toBeNull()
    await recordMintedToken(store, 'conciv_a', 'tok-1')
    expect(await resumeTokenFor(store, 'conciv_a')).toBe('tok-1')
  })

  it('ensureChatRecord lazily births a chat record with a null token', async () => {
    const store = memoryStore()
    expect(await store.get('conciv_b')).toBeNull()
    await ensureChatRecord(store, 'conciv_b', 'claude', '/app')
    const rec = await store.get('conciv_b')
    expect(rec?.origin).toBe('chat')
    expect(rec?.harnessSessionId).toBeNull()
    expect(rec?.cwd).toBe('/app')
  })

  it('ensureChatRecord is idempotent: never clobbers an existing record', async () => {
    const store = memoryStore()
    await ensureChatRecord(store, 'conciv_b', 'claude', '/app')
    await recordMintedToken(store, 'conciv_b', 'tok-1')
    await ensureChatRecord(store, 'conciv_b', 'claude', '/app')
    expect((await store.get('conciv_b'))?.harnessSessionId).toBe('tok-1')
  })

  it('resumableToken drops a token whose transcript does not exist (terminal pre-mints ids before claude writes one)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conciv-resume-'))
    writeFileSync(join(dir, 'tok-live.jsonl'), '')
    const claude = requireClaude()
    if (!claude.history || !claude.commands) throw new Error('claude harness lacks history or commands')
    const harness: HarnessAdapter = {
      ...claude,
      capabilities: {...claude.capabilities, transcriptHistory: true, slashCommands: 'live'},
      commands: claude.commands,
      history: {transcriptPath: (cwd, sessionId) => join(cwd, `${sessionId}.jsonl`), parse: () => []},
    }
    expect(resumableToken(harness, dir, 'tok-live')).toBe('tok-live')
    expect(resumableToken(harness, dir, 'tok-ghost')).toBeNull()
    expect(resumableToken(harness, dir, null)).toBeNull()
    rmSync(dir, {recursive: true, force: true})
  })

  it('resumableToken trusts the token when the harness has no transcript history', () => {
    const stub = getHarness('pi')
    if (!stub) throw new Error('pi stub not registered')
    expect(resumableToken(stub, '/app', 'tok-1')).toBe('tok-1')
  })
})
