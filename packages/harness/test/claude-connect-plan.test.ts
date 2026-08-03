import {describe, expect, it} from 'vitest'
import {CONCIV_SESSION_HEADER, SessionId} from '@conciv/protocol/chat-types'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import {claude} from '../src/claude/index.js'
import {CONCIV_PLUGIN_DIR} from '../src/claude/plugin-dir.js'

const CONCIV_SESSION = SessionId.parse('conciv_plan_test')

const context = (over: Partial<HarnessConnectContext> = {}): HarnessConnectContext => ({
  cwd: '/workspace',
  stateDir: '/state/.conciv',
  concivSessionId: CONCIV_SESSION,
  harnessSessionId: 'tok-1',
  resume: false,
  owned: true,
  model: null,
  mcpUrl: null,
  hookUrl: null,
  ...over,
})

function plan(over: Partial<HarnessConnectContext> = {}): string[] {
  const connect = claude.connect
  if (!connect) throw new Error('claude harness has no connect plan')
  const built = connect.plan(context(over))
  expect(built.env).toEqual({})
  expect(built.files).toEqual([])
  const pluginAt = built.argv.indexOf('--plugin-dir')
  if (pluginAt === -1) return built.argv
  return [...built.argv.slice(0, pluginAt), ...built.argv.slice(pluginAt + 2)]
}

function mcpConfigOf(argv: string[]): unknown {
  const raw = argv[argv.indexOf('--mcp-config') + 1]
  if (!raw) throw new Error('plan has no --mcp-config payload')
  return JSON.parse(raw)
}

describe('claude connect.plan', () => {
  it('resumes an existing harness session and carries the conciv session header into the mcp config', () => {
    const argv = plan({resume: true, mcpUrl: 'http://127.0.0.1:1/api/mcp'})
    expect(argv.slice(0, 3)).toEqual(['claude', '--resume', 'tok-1'])
    expect(argv).toContain('--strict-mcp-config')
    expect(mcpConfigOf(argv)).toEqual({
      mcpServers: {
        conciv: {
          type: 'http',
          url: 'http://127.0.0.1:1/api/mcp',
          headers: {[CONCIV_SESSION_HEADER]: CONCIV_SESSION},
        },
      },
    })
  })

  it('pins a fresh harness session id when there is nothing to resume', () => {
    expect(plan().slice(0, 3)).toEqual(['claude', '--session-id', 'tok-1'])
  })

  it('omits the session flags entirely when no harness session id is known', () => {
    expect(plan({harnessSessionId: null})).toEqual(['claude'])
  })

  it('omits the mcp args when there is no mcp url', () => {
    const argv = plan()
    expect(argv).not.toContain('--mcp-config')
    expect(argv).not.toContain('--strict-mcp-config')
  })

  it('passes the model through', () => {
    expect(plan({model: 'opus'})).toEqual(['claude', '--session-id', 'tok-1', '--model', 'opus'])
  })

  it('points claude at the bundled conciv plugin directory', () => {
    const connect = claude.connect
    if (!connect) throw new Error('claude harness has no connect plan')
    if (!CONCIV_PLUGIN_DIR) throw new Error('conciv claude plugin is not bundled')
    expect(connect.plan(context()).argv.slice(-2)).toEqual(['--plugin-dir', CONCIV_PLUGIN_DIR])
  })
})
