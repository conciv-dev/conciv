import {chmodSync, mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {delimiter, join} from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {CONCIV_SESSION_HEADER, SessionId} from '@conciv/protocol/chat-types'
import {
  claudeConnectDir,
  claudeConnectPluginFiles,
  relatedCwd,
  meetsReloadFloor,
  parseLiveSessions,
  CLAUDE_RELOAD_COMMAND,
} from '../src/claude/attach.js'
import {claude} from '../src/claude/index.js'
import {claudeHooksManifest} from '../src/claude/hooks-plugin.js'

const CONCIV_SESSION = SessionId.parse('conciv_attach_test')
const MCP_URL = 'http://127.0.0.1:4242/api/mcp'
const HOOK_URL = 'http://127.0.0.1:4242/api/ext/terminal/hook'

const AGENTS_JSON = JSON.stringify([
  {
    pid: 45279,
    cwd: '/repo/app',
    kind: 'interactive',
    sessionId: '758f3da1-2759-42e1-9b49-524139cea6cf',
    name: 'spikea-fe',
    status: 'idle',
  },
  {pid: 45280, cwd: '/repo', kind: 'interactive', sessionId: 'parent-session', name: 'root', status: 'busy'},
  {pid: 45281, cwd: '/elsewhere', kind: 'interactive', sessionId: 'other-session', name: 'other', status: 'idle'},
  {pid: 45282, cwd: '/repo/app', kind: 'background', sessionId: 'bg-session', name: 'bg', status: 'idle'},
])

const scratch = {dir: '', path: ''}

function fakeClaude(script: string): void {
  const bin = join(scratch.dir, 'bin')
  mkdirSync(bin, {recursive: true})
  const file = join(bin, 'claude')
  writeFileSync(file, script)
  chmodSync(file, 0o755)
  process.env.PATH = `${bin}${delimiter}${scratch.path}`
}

function attachOf() {
  const attach = claude.attach
  if (!attach) throw new Error('claude harness has no attach sidecar')
  return attach
}

beforeEach(() => {
  scratch.dir = mkdtempSync(join(tmpdir(), 'conciv-claude-attach-'))
  scratch.path = process.env.PATH ?? ''
})

afterEach(() => {
  process.env.PATH = scratch.path
})

describe('claude live session discovery', () => {
  it('keeps interactive sessions whose cwd is related to the requested one', () => {
    const sessions = parseLiveSessions(AGENTS_JSON).filter((session) => relatedCwd(session.cwd, '/repo/app'))
    expect(sessions.map((session) => session.sessionId)).toEqual([
      '758f3da1-2759-42e1-9b49-524139cea6cf',
      'parent-session',
    ])
    expect(sessions[0]).toMatchObject({pid: 45279, name: 'spikea-fe', status: 'idle', cwd: '/repo/app'})
  })

  it('keeps directories above and below, and drops siblings', () => {
    expect(relatedCwd('/repo/app', '/repo')).toBe(true)
    expect(relatedCwd('/repo', '/repo/app')).toBe(true)
    expect(relatedCwd('/repo/app', '/repo/other')).toBe(false)
    expect(relatedCwd('/repo/app', '/repo/app')).toBe(true)
  })

  it('returns nothing for unparsable output', () => {
    expect(parseLiveSessions('not json')).toEqual([])
    expect(parseLiveSessions('{"unexpected": 1}')).toEqual([])
  })

  it('lists the sessions a working claude reports', async () => {
    fakeClaude(`#!/bin/sh\n[ "$1" = agents ] && cat <<'JSON'\n${AGENTS_JSON}\nJSON\nexit 0\n`)
    const found = await attachOf().candidates('/repo/app')
    expect(found.map((session) => session.sessionId)).toEqual([
      '758f3da1-2759-42e1-9b49-524139cea6cf',
      'parent-session',
    ])
  })

  it('reports no candidates when the cli fails or is missing', async () => {
    fakeClaude('#!/bin/sh\nexit 3\n')
    expect(await attachOf().candidates('/repo/app')).toEqual([])
    process.env.PATH = join(scratch.dir, 'empty')
    expect(await attachOf().candidates('/repo/app')).toEqual([])
  })

  it('gives up on a hanging cli', async () => {
    fakeClaude('#!/bin/sh\nsleep 30\n')
    expect(await attachOf().candidates('/repo/app')).toEqual([])
  }, 6_000)
})

describe('claude reload version floor', () => {
  it('accepts the first version that ships the forced reload', () => {
    expect(meetsReloadFloor('2.1.163 (Claude Code)')).toBe(true)
    expect(meetsReloadFloor('2.1.220 (Claude Code)')).toBe(true)
    expect(meetsReloadFloor('3.0.0')).toBe(true)
  })

  it('rejects older versions and unreadable output', () => {
    expect(meetsReloadFloor('2.1.162 (Claude Code)')).toBe(false)
    expect(meetsReloadFloor('2.0.999')).toBe(false)
    expect(meetsReloadFloor('unknown')).toBe(false)
  })
})

describe('claude connect plugin files', () => {
  const files = claudeConnectPluginFiles({
    stateDir: '/state/.conciv',
    concivSessionId: CONCIV_SESSION,
    mcpUrl: MCP_URL,
    hookUrl: HOOK_URL,
  })
  const root = claudeConnectDir('/state/.conciv')
  const contentsAt = (path: string): string => {
    const file = files.find((candidate) => candidate.path === path)
    if (!file) throw new Error(`no generated file at ${path}`)
    return file.contents
  }

  it('lays out a marketplace next to the plugin it publishes', () => {
    expect(files.map((file) => file.path)).toEqual([
      join(root, '.claude-plugin', 'marketplace.json'),
      join(root, 'conciv-connect', '.claude-plugin', 'plugin.json'),
      join(root, 'conciv-connect', '.mcp.json'),
      join(root, 'conciv-connect', 'hooks', 'hooks.json'),
    ])
    expect(JSON.parse(contentsAt(join(root, '.claude-plugin', 'marketplace.json')))).toMatchObject({
      name: 'conciv',
      plugins: [{name: 'conciv-connect', source: './conciv-connect'}],
    })
  })

  it('points the plugin mcp server at our minted conciv session, never the claude one', () => {
    const parsed = JSON.parse(contentsAt(join(root, 'conciv-connect', '.mcp.json')))
    expect(parsed).toEqual({
      mcpServers: {
        conciv: {type: 'http', url: MCP_URL, headers: {[CONCIV_SESSION_HEADER]: CONCIV_SESSION}},
      },
    })
  })

  it('reuses the same hooks manifest the launched plugin writes', () => {
    expect(contentsAt(join(root, 'conciv-connect', 'hooks', 'hooks.json'))).toBe(
      claudeHooksManifest({concivSessionId: CONCIV_SESSION, hookUrl: HOOK_URL}),
    )
  })
})

describe('claude attach install', () => {
  const installOptions = () => ({
    root: scratch.dir,
    stateDir: join(scratch.dir, '.conciv'),
    mcpUrl: MCP_URL,
    concivSessionId: CONCIV_SESSION,
    hookUrl: HOOK_URL,
  })

  it('writes the plugin tree and registers it with the cli', async () => {
    const log = join(scratch.dir, 'calls.log')
    fakeClaude(`#!/bin/sh\necho "$@" >> ${log}\n[ "$1" = --version ] && echo "2.1.220 (Claude Code)"\nexit 0\n`)
    const result = await attachOf().install(installOptions())

    expect(result).toEqual({ok: true, reloadCommand: CLAUDE_RELOAD_COMMAND})
    const root = claudeConnectDir(installOptions().stateDir)
    const mcp = JSON.parse(readFileSync(join(root, 'conciv-connect', '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers.conciv.headers[CONCIV_SESSION_HEADER]).toBe(CONCIV_SESSION)
    const calls = readFileSync(log, 'utf8')
    expect(calls).toContain(`plugin marketplace add ${root}`)
    expect(calls).toContain('plugin install conciv-connect@conciv --scope local')
  })

  it('refuses to install against a cli without the forced reload', async () => {
    fakeClaude('#!/bin/sh\n[ "$1" = --version ] && echo "2.1.100 (Claude Code)"\nexit 0\n')
    const result = await attachOf().install(installOptions())

    expect(result.ok).toBe(false)
    expect(result.reloadCommand).toBe('')
    expect(result.detail).toContain('2.1.163')
    expect(existsSync(claudeConnectDir(installOptions().stateDir))).toBe(false)
  })

  it('reports why the cli refused the plugin', async () => {
    fakeClaude(
      '#!/bin/sh\n[ "$1" = --version ] && echo "2.1.220 (Claude Code)" && exit 0\necho "marketplace exists" >&2\nexit 1\n',
    )
    const result = await attachOf().install(installOptions())

    expect(result.ok).toBe(false)
    expect(result.detail).toContain('marketplace exists')
  })

  it('removes the generated tree on uninstall', async () => {
    fakeClaude('#!/bin/sh\n[ "$1" = --version ] && echo "2.1.220 (Claude Code)"\nexit 0\n')
    await attachOf().install(installOptions())
    expect(existsSync(claudeConnectDir(installOptions().stateDir))).toBe(true)

    await attachOf().uninstall({root: scratch.dir, stateDir: installOptions().stateDir})
    expect(existsSync(claudeConnectDir(installOptions().stateDir))).toBe(false)
  })
})
