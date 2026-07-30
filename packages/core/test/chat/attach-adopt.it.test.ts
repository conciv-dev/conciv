import {spawn} from 'node:child_process'
import {chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {delimiter, join} from 'node:path'
import {eq} from 'drizzle-orm'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {openDb, sessions, type ConcivDb} from '@conciv/db'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../helpers/boot.js'

const AGENTS_FILE = 'agents.json'
const HARNESS_SESSION = '758f3da1-2759-42e1-9b49-524139cea6cf'

const scratch = {dir: '', path: ''}

function writeAgents(entries: unknown[]): void {
  writeFileSync(join(scratch.dir, AGENTS_FILE), JSON.stringify(entries))
}

function installFakeClaude(): void {
  const bin = join(scratch.dir, 'bin')
  mkdirSync(bin, {recursive: true})
  const shim = join(bin, 'claude')
  writeFileSync(
    shim,
    [
      '#!/bin/sh',
      'case "$1" in',
      '  --version) echo "2.1.220 (Claude Code)"; exit 0;;',
      `  agents) cat "${join(scratch.dir, AGENTS_FILE)}"; exit 0;;`,
      'esac',
      'exit 0',
      '',
    ].join('\n'),
  )
  chmodSync(shim, 0o755)
  process.env.PATH = `${bin}${delimiter}${scratch.path}`
}

function liveSession(cwd: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pid: process.pid,
    cwd,
    kind: 'interactive',
    sessionId: HARNESS_SESSION,
    name: 'terminal',
    status: 'idle',
    ...over,
  }
}

function deadPid(): Promise<number> {
  return new Promise((settle) => {
    const child = spawn(process.execPath, ['-e', ''], {stdio: 'ignore'})
    child.once('exit', () => settle(child.pid ?? 1))
  })
}

async function attachedRow(db: ConcivDb, sessionId: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId))
  const row = rows[0]
  if (!row) throw new Error(`no session row for ${sessionId}`)
  return row
}

function connectDir(kit: Kit): string {
  return join(kit.stateRoot, '.conciv', 'claude-connect')
}

const opened: Kit[] = []

async function boot(): Promise<Kit> {
  const kit = await bootKit({fakeClaude: {}})
  opened.push(kit)
  writeAgents([liveSession(kit.stateRoot)])
  return kit
}

beforeEach(() => {
  scratch.dir = mkdtempSync(join(tmpdir(), 'conciv-adopt-'))
  scratch.path = process.env.PATH ?? ''
  installFakeClaude()
})

afterEach(async () => {
  process.env.PATH = scratch.path
  for (const kit of opened.splice(0)) await kit.cleanup()
  rmSync(scratch.dir, {recursive: true, force: true})
})

describe('adopting a running terminal session', () => {
  it('lists the live sessions that cover this project', async () => {
    const kit = await boot()
    const found = await kit.rpc.sessions.attachCandidates()
    expect(found).toEqual([
      {
        sessionId: HARNESS_SESSION,
        pid: process.pid,
        cwd: kit.stateRoot,
        name: 'terminal',
        status: 'idle',
        relation: 'same',
      },
    ])
  }, 30_000)

  it('wraps the terminal session once and remembers where it runs', async () => {
    const kit = await boot()
    const first = await kit.rpc.sessions.attachAdopt({harnessSessionId: HARNESS_SESSION, pid: process.pid})
    expect(first.reloadCommand).toBe('/reload-plugins --force')

    const db = openDb(kit.stateRoot)
    const row = await attachedRow(db, first.sessionId)
    expect(row).toMatchObject({
      harnessSessionId: HARNESS_SESSION,
      origin: 'external',
      attachedPid: process.pid,
      transcriptCwd: kit.stateRoot,
    })
    expect(row.attachedAt).toBeGreaterThan(0)
    expect(existsSync(join(connectDir(kit), 'conciv-connect', '.mcp.json'))).toBe(true)

    const again = await kit.rpc.sessions.attachAdopt({harnessSessionId: HARNESS_SESSION, pid: process.pid})
    expect(again.sessionId).toBe(first.sessionId)
    const all = await db.select().from(sessions)
    expect(all.filter((record) => record.harnessSessionId === HARNESS_SESSION)).toHaveLength(1)
  }, 30_000)

  it('refuses a session running outside this project', async () => {
    const kit = await boot()
    writeAgents([liveSession(join(tmpdir(), 'conciv-somewhere-else'))])
    await expect(
      kit.rpc.sessions.attachAdopt({harnessSessionId: HARNESS_SESSION, pid: process.pid}),
    ).rejects.toMatchObject({code: 'CWD_MISMATCH'})
  }, 30_000)

  it('only takes a subdirectory session when told to force it', async () => {
    const kit = await boot()
    const nested = join(kit.stateRoot, 'packages', 'app')
    mkdirSync(nested, {recursive: true})
    writeAgents([liveSession(nested)])

    await expect(
      kit.rpc.sessions.attachAdopt({harnessSessionId: HARNESS_SESSION, pid: process.pid}),
    ).rejects.toMatchObject({code: 'CWD_MISMATCH'})
    const forced = await kit.rpc.sessions.attachAdopt({
      harnessSessionId: HARNESS_SESSION,
      pid: process.pid,
      force: true,
    })
    expect(forced.sessionId).toMatch(/^conciv_/)
  }, 30_000)
})

describe('the snippet for a session we do not own', () => {
  it('keeps the terminal own mcp servers and never opens a window', async () => {
    const kit = await boot()
    const sessionId = await kit.session()
    const snippet = await kit.rpc.sessions.connectCommand({sessionId})

    expect(snippet.opened).toBe(false)
    expect(snippet.command).toContain('--mcp-config')
    expect(snippet.command).not.toContain('--strict-mcp-config')
  }, 30_000)
})

describe('sending while a terminal drives the session', () => {
  it('refuses the send while the attached process is alive', async () => {
    const kit = await boot()
    const {sessionId} = await kit.rpc.sessions.attachAdopt({harnessSessionId: HARNESS_SESSION, pid: process.pid})
    await expect(kit.rpc.chat.send({sessionId, text: 'hi'})).rejects.toMatchObject({code: 'SESSION_ATTACHED'})
  }, 30_000)

  it('forgets a dead terminal and sends again', async () => {
    const kit = await boot()
    const pid = await deadPid()
    writeAgents([liveSession(kit.stateRoot, {pid})])
    const {sessionId} = await kit.rpc.sessions.attachAdopt({harnessSessionId: HARNESS_SESSION, pid})

    const accepted = await kit.rpc.chat.send({sessionId, text: 'hi'})
    expect(accepted.ok).toBe(true)
    expect((await attachedRow(openDb(kit.stateRoot), sessionId)).attachedPid).toBeNull()
  }, 30_000)

  it('hands the session back on detach and removes the generated plugin', async () => {
    const kit = await boot()
    const {sessionId} = await kit.rpc.sessions.attachAdopt({harnessSessionId: HARNESS_SESSION, pid: process.pid})
    expect(existsSync(connectDir(kit))).toBe(true)

    await kit.rpc.sessions.attachDetach({sessionId})
    expect(existsSync(connectDir(kit))).toBe(false)
    expect((await attachedRow(openDb(kit.stateRoot), sessionId)).attachedPid).toBeNull()

    const accepted = await kit.rpc.chat.send({sessionId, text: 'hi'})
    expect(accepted.ok).toBe(true)
  }, 30_000)
})
