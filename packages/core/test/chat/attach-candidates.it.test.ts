import {chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {delimiter, join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {CONCIV_CLAUDE_SESSION_HEADER} from '@conciv/protocol/chat-types'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../helpers/boot.js'

const AGENTS_FILE = 'agents.json'
const HARNESS_SESSION = '758f3da1-2759-42e1-9b49-524139cea6cf'

const encodeProjectDir = (cwd: string): string => cwd.replace(/[^a-zA-Z0-9]/g, '-')

const scratch = {dir: '', home: '', path: ''}

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

function liveSession(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pid: process.pid,
    cwd: scratch.dir,
    kind: 'interactive',
    sessionId: HARNESS_SESSION,
    name: 'terminal',
    status: 'idle',
    ...over,
  }
}

function user(text: string): string {
  return JSON.stringify({type: 'user', message: {content: [{type: 'text', text}]}})
}

function assistant(id: string, text: string): string {
  return JSON.stringify({type: 'assistant', message: {id, content: [{type: 'text', text}]}})
}

function toolCall(id: string, callId: string, name: string): string {
  return JSON.stringify({type: 'assistant', message: {id, content: [{type: 'tool_use', id: callId, name, input: {}}]}})
}

function toolResult(callId: string, text: string): string {
  return JSON.stringify({type: 'user', message: {content: [{type: 'tool_result', tool_use_id: callId, content: text}]}})
}

function writeTranscript(sessionId: string, lines: string[]): void {
  const dir = join(scratch.home, '.claude', 'projects', encodeProjectDir(scratch.dir))
  mkdirSync(dir, {recursive: true})
  writeFileSync(join(dir, `${sessionId}.jsonl`), `${lines.join('\n')}\n`)
}

async function dialMcp(kit: Kit, harnessSessionId: string): Promise<void> {
  await fetch(`${kit.base}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      [CONCIV_CLAUDE_SESSION_HEADER]: harnessSessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'conciv-test', version: '0'}},
    }),
  })
}

const opened: Kit[] = []

async function boot(): Promise<Kit> {
  const kit = await bootKit({fakeClaude: {}, cwd: scratch.dir, claudeHome: scratch.home})
  opened.push(kit)
  return kit
}

beforeEach(() => {
  scratch.dir = mkdtempSync(join(tmpdir(), 'conciv-candidates-'))
  scratch.home = mkdtempSync(join(tmpdir(), 'conciv-claude-home-'))
  scratch.path = process.env.PATH ?? ''
  installFakeClaude()
  writeAgents([liveSession()])
})

afterEach(async () => {
  process.env.PATH = scratch.path
  for (const kit of opened.splice(0)) await kit.cleanup()
  rmSync(scratch.dir, {recursive: true, force: true})
  rmSync(scratch.home, {recursive: true, force: true})
})

describe('the running sessions the picker offers', () => {
  it('carries the title, the message count and the transcript tail', async () => {
    writeTranscript(HARNESS_SESSION, [
      user('rename the widget package'),
      assistant('a1', 'Looking at the manifests now.'),
      toolCall('a2', 'call-1', 'Read'),
      toolResult('call-1', 'package.json read'),
      assistant('a3', 'Renamed it everywhere.'),
    ])
    const kit = await boot()

    const [found, ...rest] = await kit.rpc.sessions.attachCandidates()
    expect(rest).toEqual([])
    expect(found).toMatchObject({
      sessionId: HARNESS_SESSION,
      relation: 'same',
      ready: false,
      working: false,
      title: 'rename the widget package',
      messageCount: 4,
    })
    expect(found?.lastActivityAt).toBeGreaterThan(0)
    expect(found?.tail).toEqual([
      {role: 'user', text: 'rename the widget package'},
      {role: 'assistant', text: 'Looking at the manifests now.'},
      {role: 'tool', text: '', toolName: 'Read', toolResult: 'package.json read'},
      {role: 'assistant', text: 'Renamed it everywhere.'},
    ])
  }, 30_000)

  it('reports a session with no transcript as untitled and empty', async () => {
    const kit = await boot()

    const [found] = await kit.rpc.sessions.attachCandidates()
    expect(found).toMatchObject({title: '', messageCount: 0, tail: [], ready: false})
  }, 30_000)

  it('marks a busy session as working', async () => {
    writeAgents([liveSession({status: 'busy'})])
    const kit = await boot()

    const [found] = await kit.rpc.sessions.attachCandidates()
    expect(found).toMatchObject({status: 'busy', working: true})
  }, 30_000)

  it('flips to ready once that session dials our mcp server', async () => {
    const kit = await boot()
    expect((await kit.rpc.sessions.attachCandidates())[0]?.ready).toBe(false)

    await dialMcp(kit, HARNESS_SESSION)

    expect((await kit.rpc.sessions.attachCandidates())[0]?.ready).toBe(true)
  }, 30_000)

  it('leaves the other sessions unready when only one dials in', async () => {
    const second = '0f5b6a41-1c2d-4a3e-9f10-8b7c6d5e4f30'
    writeAgents([liveSession(), liveSession({sessionId: second, name: 'other'})])
    const kit = await boot()

    await dialMcp(kit, second)

    const byId = new Map((await kit.rpc.sessions.attachCandidates()).map((row) => [row.sessionId, row.ready]))
    expect(byId.get(second)).toBe(true)
    expect(byId.get(HARNESS_SESSION)).toBe(false)
  }, 30_000)

  it('puts the most recently active session first', async () => {
    const older = '0f5b6a41-1c2d-4a3e-9f10-8b7c6d5e4f30'
    writeAgents([liveSession({sessionId: older, name: 'older'}), liveSession()])
    writeTranscript(older, [user('the older one')])
    await new Promise((settle) => setTimeout(settle, 20))
    writeTranscript(HARNESS_SESSION, [user('the newer one')])
    const kit = await boot()

    const found = await kit.rpc.sessions.attachCandidates()
    expect(found.map((row) => row.title)).toEqual(['the newer one', 'the older one'])
  }, 30_000)
})
