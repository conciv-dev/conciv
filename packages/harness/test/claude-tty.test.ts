import {describe, expect, it} from 'vitest'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {HarnessConnectContext} from '@conciv/protocol/harness-types'
import {claudeTtyCommand} from '../src/claude/tty.js'

const context = (over: Partial<HarnessConnectContext> = {}): HarnessConnectContext => ({
  cwd: '/tmp/p',
  stateDir: '/state/.conciv',
  concivSessionId: SessionId.parse('conciv_tty_test'),
  harnessSessionId: HarnessSessionId.parse('abc-123'),
  resume: false,
  owned: true,
  model: null,
  mcpUrl: null,
  hookUrl: null,
  ...over,
})

describe('claudeTtyCommand', () => {
  it('resumes an existing session', () => {
    const cmd = claudeTtyCommand(context({resume: true}))
    expect(cmd.bin).toBe('claude')
    expect(cmd.args).toEqual(['--resume', 'abc-123'])
    expect(cmd.env.TERM).toBe('xterm-256color')
  })

  it('strips nested claude session markers so transcripts persist', () => {
    const cmd = claudeTtyCommand(context())
    expect(cmd.unsetEnvPrefixes).toContain('CLAUDECODE')
    expect(cmd.unsetEnvPrefixes).toContain('CLAUDE_CODE_')
  })

  it('pins the session id for a fresh session', () => {
    expect(claudeTtyCommand(context()).args).toEqual(['--session-id', 'abc-123'])
  })

  it('passes the model through', () => {
    const cmd = claudeTtyCommand(context({resume: true, model: 'opus'}))
    expect(cmd.args).toEqual(['--resume', 'abc-123', '--model', 'opus'])
  })

  it('appends conciv mcp args when mcpUrl provided', () => {
    const cmd = claudeTtyCommand(
      context({harnessSessionId: HarnessSessionId.parse('tok-1'), mcpUrl: 'http://localhost:4111/api/mcp'}),
    )
    const joined = cmd.args.join(' ')
    expect(joined).toContain('--mcp-config')
    expect(joined).toContain('--strict-mcp-config')
    expect(joined).toContain('http://localhost:4111/api/mcp')
    expect(joined).toContain('conciv_tty_test')
  })

  it('omits mcp args without mcpUrl', () => {
    expect(
      claudeTtyCommand(context({harnessSessionId: HarnessSessionId.parse('tok-1'), resume: true})).args.join(' '),
    ).not.toContain('--mcp-config')
  })
})
